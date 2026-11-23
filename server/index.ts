import express from 'express';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { Server, type Socket } from 'socket.io';
import type { ClientToServerEvents, GameState, ServerToClientEvents } from '../shared/types.ts';
import { DEFAULT_SETTINGS } from '../shared/types.ts';
import { hostView, playerView, tvView, type JoinInfo } from './views.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 3000);
const PUBLIC_URL = process.env.PUBLIC_URL ?? null; // e.g. https://party.jpatrickbeal.com
const HOST_PIN = process.env.HOST_PIN ?? String(randomInt(100000, 1000000));

// The server is on the public internet via the tunnel, so cap PIN guessing:
// 5 wrong tries disconnects a socket, and 20 wrong tries per minute across
// everyone pauses host login for a minute.
const PIN_FAILS_PER_SOCKET = 5;
const PIN_FAILS_GLOBAL = 20;
let globalPinFails: number[] = [];
let pinLockedUntil = 0;
const IS_PROD = process.env.NODE_ENV === 'production';

// ---------- Room code ----------
const CODE_ALPHABET = 'ABCDEFGHJKMNPRSTWXYZ'; // no I, L, O, Q, U, V
const makeRoomCode = () =>
  Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

// ---------- State ----------
// TODO(engine workstream): move transitions into server/engine.ts as a pure
// (state, event, now) => state function, and persist to data/state.json.
const state: GameState = {
  roomCode: process.env.ROOM_CODE ?? makeRoomCode(),
  phase: 'LOBBY',
  players: {},
  photos: [],
  rounds: [],
  deadline: null,
  settings: { ...DEFAULT_SETTINGS },
};
const tokens = new Map<string, string>(); // secret token -> playerId

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

// ---------- HTTP ----------
const app = express();
app.use('/photos', express.static(path.join(ROOT, 'data/photos'), { maxAge: '1h' }));
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});
// TODO(engine workstream): POST /api/photos (host PIN in header) for uploads.
if (IS_PROD) {
  const dist = path.join(ROOT, 'dist/client');
  app.use(express.static(dist));
  app.get(/^\/(tv|play|host)?$/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const http = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(http, {
  cors: IS_PROD ? undefined : { origin: true },
});

type Role = 'tv' | 'player' | 'host';
interface SocketData {
  role?: Role;
  playerId?: string;
}
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

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
  for (const s of io.sockets.sockets.values()) sendView(s as GameSocket);
}

function refreshConnected() {
  const online = new Set<string>();
  for (const s of io.sockets.sockets.values()) {
    const d = (s as GameSocket).data;
    if (d.role === 'player' && d.playerId) online.add(d.playerId);
  }
  for (const p of Object.values(state.players)) p.connected = online.has(p.id);
}

io.on('connection', (socket: GameSocket) => {
  socket.on('tv:hello', () => {
    socket.data.role = 'tv';
    sendView(socket);
  });

  socket.on('player:join', ({ roomCode, name, token }, ack) => {
    if (roomCode?.trim().toUpperCase() !== state.roomCode) return ack({ ok: false, error: 'Room not found' });

    // Rejoin with an existing token keeps the same player slot.
    const existingId = token ? tokens.get(token) : undefined;
    if (token && existingId && state.players[existingId]) {
      socket.data = { role: 'player', playerId: existingId };
      refreshConnected();
      broadcast();
      return ack({ ok: true, playerId: existingId, token });
    }

    let clean = (name ?? '').trim().replace(/\s+/g, ' ').slice(0, 16);
    if (!clean) return ack({ ok: false, error: 'Please enter a name' });
    const taken = new Set(Object.values(state.players).map((p) => p.name.toLowerCase()));
    if (taken.has(clean.toLowerCase())) {
      let n = 2;
      while (taken.has(`${clean} ${n}`.toLowerCase())) n++;
      clean = `${clean} ${n}`;
    }

    const playerId = randomUUID().slice(0, 8);
    const newToken = randomUUID();
    tokens.set(newToken, playerId);
    state.players[playerId] = { id: playerId, name: clean, avatar: null, color: null, score: 0, connected: true };
    socket.data = { role: 'player', playerId };
    refreshConnected();
    broadcast();
    ack({ ok: true, playerId, token: newToken });
  });

  let socketPinFails = 0;
  socket.on('host:auth', (payload, ack) => {
    const now = Date.now();
    if (now < pinLockedUntil) return ack({ ok: false, error: 'Too many tries. Wait a minute.' });
    const pin = typeof payload?.pin === 'string' ? payload.pin : '';
    const ok =
      pin.length === HOST_PIN.length && timingSafeEqual(Buffer.from(pin), Buffer.from(HOST_PIN));
    if (!ok) {
      socketPinFails++;
      globalPinFails = [...globalPinFails.filter((t) => now - t < 60_000), now];
      if (globalPinFails.length >= PIN_FAILS_GLOBAL) {
        pinLockedUntil = now + 60_000;
        console.warn('⚠️  Host PIN locked for 60s after repeated failures');
      }
      ack({ ok: false, error: 'Wrong PIN' });
      if (socketPinFails >= PIN_FAILS_PER_SOCKET) socket.disconnect(true);
      return;
    }
    socket.data.role = 'host';
    ack({ ok: true });
    sendView(socket);
  });

  socket.on('host:action', (action, ack) => {
    if (socket.data.role !== 'host') return ack({ ok: false, error: 'Not host' });
    switch (action.type) {
      case 'kick': {
        delete state.players[action.playerId];
        for (const [t, id] of tokens) if (id === action.playerId) tokens.delete(t);
        for (const s of io.sockets.sockets.values()) {
          const gs = s as GameSocket;
          if (gs.data.playerId === action.playerId) {
            gs.emit('kicked');
            gs.data = {};
          }
        }
        break;
      }
      default:
        // TODO(engine workstream): all other actions go through the engine.
        return ack({ ok: false, error: `Not implemented yet: ${action.type}` });
    }
    broadcast();
    ack({ ok: true });
  });

  // Stubs so clients don't hang waiting on an ack.
  socket.on('player:caption', (_p, ack) => ack({ ok: false, error: 'Not implemented yet' }));
  socket.on('player:vote', (_p, ack) => ack({ ok: false, error: 'Not implemented yet' }));
  socket.on('player:react', () => {});

  socket.on('disconnect', () => {
    refreshConnected();
    broadcast();
  });
});

http.listen(PORT, () => {
  console.log(`
  🎉 Cousin Caption Party server on :${PORT}
     Room code : ${state.roomCode}
     Host PIN  : ${HOST_PIN}
     Join URL  : ${join.joinUrl}${join.lanJoinUrl ? `\n     LAN URL   : ${join.lanJoinUrl}` : ''}
     TV        : ${IS_PROD ? `http://localhost:${PORT}` : 'http://localhost:5173'}/tv
     Host      : ${joinBase}/host
`);
});
