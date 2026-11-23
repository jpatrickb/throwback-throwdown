// Fake players for testing without a room full of phones.
//   npm run bots -- <ROOM> [count] [url] [--host <PIN>] [--fast] [--photos N]
// Bots join, then caption/vote with random delays whenever the phase allows.
// --host <PIN>  also drives /host: tops the queue up to N unused test photos (default 3),
//               starts the game, advances every step, and exits after the FINAL screen.
// --fast        short delays (for quick end-to-end runs).
// --lazy F      fraction (0-1) of bots that never caption or vote, so phases end on the timer.
// --churn       bots randomly drop their connection for 1-4s during the game, then rejoin with their token.
// --timers C,V  host sets caption/vote seconds before starting (e.g. --timers 15,10).
// --quiet       don't log each join (automatic above 12 bots). At FINAL, host mode prints phase timings + ack latency.
import zlib from 'node:zlib';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, HostAction, HostView, PlayerView, ServerToClientEvents, View } from '../shared/types.ts';

type Sock = Socket<ServerToClientEvents, ClientToServerEvents>;

const positional: string[] = [];
const flags: Record<string, string | true> = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--host' || a === '--photos' || a === '--lazy' || a === '--timers') flags[a.slice(2)] = argv[++i] ?? '';
  else if (a.startsWith('--')) flags[a.slice(2)] = true;
  else positional.push(a);
}
const [room, countArg, url = 'http://localhost:3000'] = positional;
if (!room) {
  console.error('usage: npm run bots -- <ROOM> [count] [url] [--host <PIN>] [--fast] [--photos N] [--lazy F] [--churn] [--timers C,V] [--quiet]');
  process.exit(1);
}
const count = Number(countArg ?? 6);
const fast = flags.fast === true;
const hostPin = typeof flags.host === 'string' ? flags.host : null;
const photoCount = Number(flags.photos ?? 3);
const quiet = flags.quiet === true || count > 12;
const lazyCount = Math.round(count * Number(flags.lazy ?? 0));
const churn = flags.churn === true;
const timers = typeof flags.timers === 'string' ? flags.timers.split(',').map(Number) : null;

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
// ---------- stats (printed at FINAL in --host mode) ----------
const stats = { acks: 0, errors: 0, latencies: [] as number[], phaseStart: Date.now(), phase: '' };
/** Wraps an ack callback to record round-trip latency and errors. */
function timed<R extends { ok: boolean }>(cb: (r: R) => void): (r: R) => void {
  const t = Date.now();
  return (r) => {
    stats.acks++;
    stats.latencies.push(Date.now() - t);
    if (!r.ok) stats.errors++;
    cb(r);
  };
}
function printStats() {
  const l = [...stats.latencies].sort((a, b) => a - b);
  const pct = (q: number) => l[Math.min(l.length - 1, Math.floor(q * l.length))] ?? 0;
  console.log(`[stats] ${stats.acks} acks, ${stats.errors} errors, latency p50 ${pct(0.5)}ms p95 ${pct(0.95)}ms max ${l.at(-1) ?? 0}ms`);
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, fast ? ms / 5 : ms));

// ---------- players ----------
for (let i = 0; i < count; i++) {
  const name = NAMES[i % NAMES.length];
  const s: Sock = io(url, { transports: ['websocket'] });
  let token: string | undefined;
  let actedOn = '';
  const lazy = i < lazyCount;
  let churning = false;

  s.on('connect', () => {
    s.emit('player:join', { roomCode: room, name, token }, timed((res) => {
      if (!res.ok) return console.error(`${name}: ${res.error}`);
      token = res.token;
      if (!quiet) console.log(`${name} joined as ${res.playerId}`);
    }));
  });
  s.on('kicked', () => {
    console.log(`${name} was kicked`);
    s.disconnect();
  });

  s.on('view', (v: View) => {
    if (v.role !== 'player') return;
    const pv = v as PlayerView;
    if (churn && !churning && pv.phase !== 'LOBBY' && pv.phase !== 'FINAL') {
      churning = true;
      const blip = () => {
        setTimeout(() => {
          s.disconnect();
          setTimeout(() => {
            s.connect();
            blip();
          }, 1000 + Math.random() * 3000);
        }, 3000 + Math.random() * 12000);
      };
      blip();
    }
    if (lazy) return;
    const key = `${pv.phase}:${pv.round?.index}`;
    if (key === actedOn) return;
    if (pv.phase === 'CAPTIONING' && !pv.myCaption) {
      actedOn = key;
      later(() =>
        s.emit('player:caption', { text: pick(QUIPS) }, timed((r) => {
          if (!r.ok) {
            console.error(`${name} caption: ${r.error}`);
            actedOn = ''; // retry on the next view (e.g. after reconnecting)
          }
        })),
      );
    } else if (pv.phase === 'VOTING' && !pv.myVoteCaptionId && pv.round?.captions) {
      const options = pv.round.captions.filter((c) => c.id !== pv.myCaptionId);
      if (options.length) {
        actedOn = key;
        later(() =>
          s.emit('player:vote', { captionId: pick(options).id }, timed((r) => {
            if (!r.ok) {
              console.error(`${name} vote: ${r.error}`);
              actedOn = '';
            }
          })),
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
      h.emit('host:action', action, timed((r) => {
        if (!r.ok) console.error(`[host] ${action.type}: ${r.error}`);
        resolve();
      })),
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
    if (hv.phase !== stats.phase) {
      const now = Date.now();
      if (stats.phase === 'CAPTIONING' || stats.phase === 'VOTING')
        console.log(`[host]   ${stats.phase} took ${((now - stats.phaseStart) / 1000).toFixed(1)}s`);
      stats.phase = hv.phase;
      stats.phaseStart = now;
    }
    if (key === lastKey) return;
    busy = true;
    try {
      switch (hv.phase) {
        case 'LOBBY': {
          if (hv.players.filter((p) => p.connected).length < count) break; // wait for every bot (ignore stale players)
          const unused = hv.photos.filter((p) => !p.used).length;
          if (unused < photoCount) {
            if (uploaded) break;
            uploaded = true;
            await uploadTestPhotos(photoCount - unused);
            break; // the next view starts the game
          }
          lastKey = key;
          if (timers) await act({ type: 'updateSettings', settings: { captionSeconds: timers[0], voteSeconds: timers[1] } });
          console.log(`[host] starting with ${hv.players.filter((p) => p.connected).length} players, ${unused} photos`);
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
          printStats();
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
