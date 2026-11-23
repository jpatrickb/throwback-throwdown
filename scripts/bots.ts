// Fake players for testing without a room full of phones.
//   npm run bots -- <ROOM> [count] [url] [--host <PIN>] [--fast] [--photos N]
// Bots join, then caption/vote with random delays whenever the phase allows.
// --host <PIN>  also drives /host: uploads N test photos if the queue is empty (default 3),
//               starts the game, advances every step, and exits after the FINAL screen.
// --fast        short delays (for quick end-to-end runs).
import zlib from 'node:zlib';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, HostAction, HostView, PlayerView, ServerToClientEvents, View } from '../shared/types.ts';

type Sock = Socket<ServerToClientEvents, ClientToServerEvents>;

const positional: string[] = [];
const flags: Record<string, string | true> = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--host' || a === '--photos') flags[a.slice(2)] = argv[++i] ?? '';
  else if (a.startsWith('--')) flags[a.slice(2)] = true;
  else positional.push(a);
}
const [room, countArg, url = 'http://localhost:3000'] = positional;
if (!room) {
  console.error('usage: npm run bots -- <ROOM> [count] [url] [--host <PIN>] [--fast] [--photos N]');
  process.exit(1);
}
const count = Number(countArg ?? 6);
const fast = flags.fast === true;
const hostPin = typeof flags.host === 'string' ? flags.host : null;
const photoCount = Number(flags.photos ?? 3);

const NAMES = ['Aunt Bot', 'Botty', 'Robo Cuz', 'Unit 7', 'Beep', 'Boop', 'Chip', 'Gizmo', 'Sprocket', 'Widget', 'Bolt', 'Pixel'];
const QUIPS = [
  'When the WiFi password is wrong',
  'Future tax accountant',
  'This is my villain origin story',
  'Me after one (1) grape',
  'Mom said it was my turn on the Xbox',
  'Already planning the heist',
  'Peak fashion, never topped',
  'The face of someone who just found the cookies',
];
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const later = (fn: () => void) => setTimeout(fn, fast ? 100 + Math.random() * 600 : 1000 + Math.random() * 6000);
const pause = (ms: number) => new Promise((r) => setTimeout(r, fast ? ms / 5 : ms));

// ---------- players ----------
for (let i = 0; i < count; i++) {
  const name = NAMES[i % NAMES.length];
  const s: Sock = io(url, { transports: ['websocket'] });
  let token: string | undefined;
  let actedOn = '';

  s.on('connect', () => {
    s.emit('player:join', { roomCode: room, name, token }, (res) => {
      if (!res.ok) return console.error(`${name}: ${res.error}`);
      token = res.token;
      console.log(`${name} joined as ${res.playerId}`);
    });
  });
  s.on('kicked', () => {
    console.log(`${name} was kicked`);
    s.disconnect();
  });

  s.on('view', (v: View) => {
    if (v.role !== 'player') return;
    const pv = v as PlayerView;
    const key = `${pv.phase}:${pv.round?.index}`;
    if (key === actedOn) return;
    if (pv.phase === 'CAPTIONING' && !pv.myCaption) {
      actedOn = key;
      later(() =>
        s.emit('player:caption', { text: pick(QUIPS) }, (r) => {
          if (!r.ok) {
            console.error(`${name} caption: ${r.error}`);
            actedOn = ''; // retry on the next view (e.g. after reconnecting)
          }
        }),
      );
    } else if (pv.phase === 'VOTING' && !pv.myVoteCaptionId && pv.round?.captions) {
      const options = pv.round.captions.filter((c) => c.id !== pv.myCaptionId);
      if (options.length) {
        actedOn = key;
        later(() =>
          s.emit('player:vote', { captionId: pick(options).id }, (r) => {
            if (!r.ok) {
            console.error(`${name} vote: ${r.error}`);
            actedOn = '';
          }
          }),
        );
      }
    }
  });
}

// ---------- host driver ----------
/** A solid-color PNG (valid, so the TV can show it) for filling an empty photo queue. */
function solidPng(w: number, h: number, [r, g, b]: [number, number, number]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const COLORS: [number, number, number][] = [[240, 120, 90], [90, 170, 240], [120, 200, 120], [230, 190, 70], [180, 120, 220]];

async function uploadTestPhotos(n: number) {
  const form = new FormData();
  for (let i = 0; i < n; i++) form.append('photos', new Blob([new Uint8Array(solidPng(640, 480, COLORS[i % COLORS.length]))], { type: 'image/png' }), `${i + 1} - Bot Cousin ${i + 1}.png`);
  const res = await fetch(`${url}/api/photos`, { method: 'POST', headers: { 'x-host-pin': hostPin! }, body: form });
  const body = (await res.json()) as { ok: boolean; error?: string };
  if (!body.ok) throw new Error(`upload failed: ${body.error}`);
  console.log(`[host] uploaded ${n} test photo(s)`);
}

if (hostPin) {
  const h: Sock = io(url, { transports: ['websocket'] });
  let busy = false;
  let lastKey = '';
  let uploaded = false;

  const act = (action: HostAction) =>
    new Promise<void>((resolve) =>
      h.emit('host:action', action, (r) => {
        if (!r.ok) console.error(`[host] ${action.type}: ${r.error}`);
        resolve();
      }),
    );

  h.on('connect', () => {
    h.emit('host:auth', { pin: hostPin }, (r) => {
      if (!r.ok) {
        console.error(`[host] auth failed: ${r.error}`);
        process.exit(1);
      }
      console.log('[host] authenticated');
    });
  });

  let pending: HostView | null = null;
  h.on('view', (v: View) => {
    if (v.role === 'host') handle(v as HostView);
  });

  async function handle(hv: HostView): Promise<void> {
    if (busy) {
      pending = hv; // re-check the newest view when the current step finishes
      return;
    }
    const key = `${hv.phase}:${hv.round?.index ?? -1}`;
    if (key === lastKey) return;
    busy = true;
    try {
      switch (hv.phase) {
        case 'LOBBY': {
          if (hv.players.length < count) break; // wait for everyone
          if (!hv.photos.some((p) => !p.used)) {
            if (uploaded) break;
            uploaded = true;
            await uploadTestPhotos(photoCount);
            break; // the next view starts the game
          }
          lastKey = key;
          console.log(`[host] starting with ${hv.players.length} players, ${hv.photos.length} photos`);
          await pause(1000);
          await act({ type: 'start' });
          break;
        }
        case 'PHOTO_REVEAL':
          lastKey = key;
          console.log(`[host] round ${hv.round!.index + 1}: photo ${hv.round!.photo.url}`);
          await pause(2000);
          await act({ type: 'revealSubject' });
          await act({ type: 'next' });
          break;
        case 'CAPTIONING':
        case 'VOTING':
          break; // auto-advances when everyone is done (or the timer ends)
        case 'RESULTS': {
          lastKey = key;
          const top = hv.round?.results?.[0];
          console.log(`[host] results: ${top ? `"${top.text}" by ${top.playerName} (${top.votes} votes)` : 'tough crowd'}`);
          await pause(2500);
          await act({ type: 'next' });
          break;
        }
        case 'SCOREBOARD':
          lastKey = key;
          console.log(`[host] scoreboard: ${hv.players.map((p) => `${p.name} ${p.score}`).join(', ')}`);
          await pause(2500);
          await act({ type: 'next' });
          break;
        case 'FINAL':
          lastKey = key;
          console.log(`[host] FINAL after ${(hv.round?.index ?? -1) + 1} round(s). Champion: ${hv.players[0]?.name} (${hv.players[0]?.score})`);
          setTimeout(() => process.exit(0), 300);
          break;
      }
    } finally {
      busy = false;
      const p = pending as HostView | null;
      pending = null;
      if (p) void handle(p);
    }
  }
}
