import express from 'express';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { randomInt, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { Server, type Socket } from 'socket.io';
import type { ClientToServerEvents, GameState, ServerToClientEvents } from '../shared/types.ts';
import { apply, initialState, type EngineEvent } from './engine.ts';
import { loadSaved, save } from './persist.ts';
import { archivePhoto, photoRouter, pruneMissing, scanPhotoDir } from './photos.ts';
import { createPinGuard } from './pin.ts';
import { isObj, isStr, parseHostAction, parseJoin } from './validate.ts';
import { hostView, playerView, tvView, type JoinInfo } from './views.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 3000);
const PUBLIC_URL = process.env.PUBLIC_URL ?? null; // e.g. https://party.jpatrickbeal.com
const HOST_PIN = process.env.HOST_PIN ?? String(randomInt(100000, 1000000));
const IS_PROD = process.env.NODE_ENV === 'production';
const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR ?? 'data');
const PHOTO_DIR = path.join(DATA_DIR, 'photos');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const MAX_PLAYERS = 80; // counts disconnected players too
const RESTORE_GRACE_MS = 20_000; // after a restart, give phones time to reconnect before a timer fires

// ---------- Room code ----------
const CODE_ALPHABET = 'ABCDEFGHJKMNPRSTWXYZ'; // no I, L, O, Q, U, V
const makeRoomCode = () =>
  Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

// ---------- State (restored from data/state.json unless RESET_STATE=1) ----------
const saved = process.env.RESET_STATE === '1' ? null : loadSaved(STATE_FILE);
let state: GameState = saved?.state ?? initialState(makeRoomCode());
if (process.env.ROOM_CODE) state.roomCode = process.env.ROOM_CODE.toUpperCase();
const tokens = new Map<string, string>(saved?.tokens ?? []); // secret token -> playerId
if (saved) {
  for (const p of Object.values(state.players)) p.connected = false;
  if (state.deadline !== null) state.deadline = Math.max(state.deadline, Date.now() + RESTORE_GRACE_MS);
  console.log(`♻️  Restored game from ${path.relative(ROOT, STATE_FILE)} (phase ${state.phase})`);
}
{
  const played = new Set(state.rounds.map((r) => r.photoId));
  state.photos = pruneMissing(PHOTO_DIR, state.photos, played);
  const found = scanPhotoDir(PHOTO_DIR, state.photos);
  state.photos.push(...found);
  if (found.length) console.log(`🖼️  Added ${found.length} photo(s) from ${path.relative(ROOT, PHOTO_DIR)}/`);
}

// ---------- Join URLs ----------
function lanIp(): string | null {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) if (a.family === 'IPv4' && !a.internal) return a.address;
  }
  return null;
}
const lan = lanIp();
const lanBase = lan ? `http://${lan}:${IS_PROD ? PORT : 5173}` : null;
const joinBase = PUBLIC_URL ?? lanBase ?? `http://localhost:${PORT}`;
const join: JoinInfo = {
  joinUrl: `${joinBase}/play?room=${state.roomCode}`,
  joinQrDataUrl: await QRCode.toDataURL(`${joinBase}/play?room=${state.roomCode}`, {
    margin: 1,
    width: 512,
  }),
  lanJoinUrl: PUBLIC_URL && lanBase ? `${lanBase}/play?room=${state.roomCode}` : null,
};

// ---------- Engine dispatch ----------
const checkPin = createPinGuard(HOST_PIN);
let timer: NodeJS.Timeout | undefined;

/** Runs an event through the engine. On success: re-arm the timer, persist, broadcast. */
function dispatch(event: EngineEvent): string | undefined {
  const res = apply(state, event, Date.now());
  if (res.error) return res.error;
  state = res.state;
  onChange();
}

function onChange() {
  armTimer();
  try {
    save(STATE_FILE, state, tokens);
  } catch (e) {
    console.error('⚠️  Could not save state:', (e as Error).message);
  }
  broadcast();
}

function armTimer() {
  clearTimeout(timer);
  timer = undefined;
  if (state.deadline === null) return;
  const deadline = state.deadline;
  timer = setTimeout(() => {
    if (state.deadline === deadline) dispatch({ type: 'timeout' });
  }, Math.max(0, deadline - Date.now()) + 25);
}

// ---------- HTTP ----------
const app = express();
app.set('trust proxy', 'loopback'); // cloudflared connects from localhost
app.use('/photos', express.static(PHOTO_DIR, { maxAge: '1h' }));
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});
app.use(
  photoRouter({
    dir: PHOTO_DIR,
    authorize: (req) => {
      const caller = `ip:${req.get('cf-connecting-ip') ?? req.ip ?? '?'}`;
      const r = checkPin(req.get('x-host-pin'), caller);
      return r.ok ? null : { status: r.tooMany ? 429 : 401, error: r.error };
    },
    onPhotos: (photos) => {
      dispatch({ type: 'addPhotos', photos });
    },
  }),
);
if (IS_PROD) {
  const dist = path.resolve(ROOT, process.env.CLIENT_DIST ?? 'dist/client'); // CLIENT_DIST: test builds elsewhere
  app.use(express.static(dist));
  app.get(/^\/(tv|play|host)?$/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const http = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(http, {
  cors: IS_PROD ? undefined : { origin: true },
  maxHttpBufferSize: 64 * 1024, // photos go over HTTP, so socket payloads are tiny
});

type Role = 'tv' | 'player' | 'host';
interface SocketData {
  role?: Role;
  playerId?: string;
}
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;
const sockets = () => [...io.sockets.sockets.values()] as GameSocket[];

function sendView(socket: GameSocket) {
  const { role, playerId } = socket.data;
  if (role === 'tv') socket.emit('view', tvView(state, join));
  else if (role === 'host') socket.emit('view', hostView(state, join));
  else if (role === 'player' && playerId) {
    const v = playerView(state, playerId);
    if (v) socket.emit('view', v);
  }
}

function broadcast() {
  for (const s of sockets()) sendView(s);
}

/** Sync each player's `connected` flag with live sockets (dispatches only if something changed). */
function refreshConnected() {
  const online = new Set<string>();
  for (const s of sockets()) if (s.data.role === 'player' && s.data.playerId) online.add(s.data.playerId);
  const changed = Object.values(state.players).some((p) => p.connected !== online.has(p.id));
  if (changed) dispatch({ type: 'presence', online: [...online] });
}

type AckFn = (res: { ok: true; [k: string]: unknown } | { ok: false; error: string }) => void;
const ackOf = (ack: unknown): AckFn => (typeof ack === 'function' ? (ack as AckFn) : () => {});
const reply = (ack: AckFn, error: string | undefined) => ack(error ? { ok: false, error } : { ok: true });

const REACTIONS_PER_WINDOW = 6;
const REACTION_WINDOW_MS = 3000;

io.on('connection', (socket: GameSocket) => {
  // A throwing handler must never take the server down mid-party.
  const on = (event: string, handler: (...args: unknown[]) => void) =>
    socket.on(event as keyof ClientToServerEvents, (...args: unknown[]) => {
      try {
        handler(...args);
      } catch (e) {
        console.error(`⚠️  ${event} handler failed:`, e);
        ackOf(args.at(-1))({ ok: false, error: 'Server error' });
      }
    });

  on('tv:hello', () => {
    socket.data = { role: 'tv' };
    refreshConnected();
    sendView(socket);
  });

  on('player:join', (payload, rawAck) => {
    const ack = ackOf(rawAck);
    const p = parseJoin(payload);
    if (!p) return ack({ ok: false, error: 'Bad request' });
    if (p.roomCode.trim().toUpperCase() !== state.roomCode) return ack({ ok: false, error: 'Room not found' });

    // Rejoin with an existing token keeps the same player slot (and score).
    const existingId = p.token ? tokens.get(p.token) : undefined;
    if (p.token && existingId && state.players[existingId]) {
      socket.data = { role: 'player', playerId: existingId };
      refreshConnected();
      sendView(socket);
      return ack({ ok: true, playerId: existingId, token: p.token });
    }

    if (Object.keys(state.players).length >= MAX_PLAYERS) return ack({ ok: false, error: 'The room is full' });
    const playerId = randomUUID().slice(0, 8);
    const err = dispatch({ type: 'join', playerId, name: p.name, avatar: p.avatar, color: p.color });
    if (err) return ack({ ok: false, error: err });
    const token = randomUUID();
    tokens.set(token, playerId);
    socket.data = { role: 'player', playerId };
    refreshConnected();
    onChange(); // persist the new token and send this socket its first view
    ack({ ok: true, playerId, token });
  });

  on('player:caption', (payload, rawAck) => {
    const ack = ackOf(rawAck);
    const { playerId, role } = socket.data;
    if (role !== 'player' || !playerId) return ack({ ok: false, error: 'Join first' });
    if (!isObj(payload) || !isStr(payload.text, 1000)) return ack({ ok: false, error: 'Bad request' });
    reply(ack, dispatch({ type: 'caption', playerId, text: payload.text, id: randomUUID().slice(0, 8) }));
  });

  on('player:vote', (payload, rawAck) => {
    const ack = ackOf(rawAck);
    const { playerId, role } = socket.data;
    if (role !== 'player' || !playerId) return ack({ ok: false, error: 'Join first' });
    if (!isObj(payload) || !isStr(payload.captionId, 64)) return ack({ ok: false, error: 'Bad request' });
    reply(ack, dispatch({ type: 'vote', playerId, captionId: payload.captionId }));
  });

  on('player:setAvatar', (payload, rawAck) => {
    const ack = ackOf(rawAck);
    const { playerId, role } = socket.data;
    if (role !== 'player' || !playerId) return ack({ ok: false, error: 'Join first' });
    const okField = (v: unknown) => v === null || isStr(v, 64);
    if (!isObj(payload) || !okField(payload.avatar) || !okField(payload.color)) return ack({ ok: false, error: 'Bad request' });
    reply(ack, dispatch({ type: 'setAvatar', playerId, avatar: payload.avatar as string | null, color: payload.color as string | null }));
  });

  let reactionTimes: number[] = [];
  on('player:react', (payload) => {
    const { playerId, role } = socket.data;
    if (role !== 'player' || !playerId || !isObj(payload) || !isStr(payload.emoji, 16)) return;
    const emoji = payload.emoji.trim();
    if (!emoji) return;
    const now = Date.now();
    reactionTimes = reactionTimes.filter((t) => now - t < REACTION_WINDOW_MS);
    if (reactionTimes.length >= REACTIONS_PER_WINDOW) return;
    reactionTimes.push(now);
    for (const s of sockets()) if (s.data.role === 'tv') s.emit('reaction', { playerId, emoji });
  });

  on('host:auth', (payload, rawAck) => {
    const ack = ackOf(rawAck);
    const r = checkPin(isObj(payload) ? payload.pin : undefined, `socket:${socket.id}`);
    if (!r.ok) {
      ack({ ok: false, error: r.error });
      if (r.tooMany) socket.disconnect(true);
      return;
    }
    socket.data = { role: 'host' };
    refreshConnected();
    ack({ ok: true });
    sendView(socket);
  });

  on('host:action', (payload, rawAck) => {
    const ack = ackOf(rawAck);
    if (socket.data.role !== 'host') return ack({ ok: false, error: 'Not host' });
    const action = parseHostAction(payload);
    if (!action) return ack({ ok: false, error: 'Bad request' });
    const before = state;
    const err = dispatch({ type: 'host', action });
    if (err) return ack({ ok: false, error: err });

    if (action.type === 'kick') {
      for (const [t, id] of tokens) if (id === action.playerId) tokens.delete(t);
      for (const s of sockets()) {
        if (s.data.playerId === action.playerId) {
          s.emit('kicked');
          s.data = {};
        }
      }
      onChange(); // persist the token removal
    } else if (action.type === 'removePhoto') {
      const gone = before.photos.find((p) => p.id === action.photoId);
      if (gone) archivePhoto(PHOTO_DIR, gone);
    }
    ack({ ok: true });
  });

  on('disconnect', () => {
    refreshConnected();
  });
});

armTimer();
http.listen(PORT, () => {
  console.log(`
  🎉 Throwback Throwdown server on :${PORT}
     Room code : ${state.roomCode}
     Host PIN  : ${HOST_PIN}
     Photos    : ${state.photos.length} queued (${state.photos.filter((p) => !p.used).length} unused)
     Join URL  : ${join.joinUrl}${join.lanJoinUrl ? `\n     LAN URL   : ${join.lanJoinUrl}` : ''}
     TV        : ${IS_PROD ? `http://localhost:${PORT}` : 'http://localhost:5173'}/tv
     Host      : ${joinBase}/host
`);
});
