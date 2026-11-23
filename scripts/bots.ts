// Fake players for testing without a room full of phones.
//   npm run bots -- <ROOM> [count] [url]
// Bots join, then caption/vote with random delays whenever the phase allows.
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, PlayerView, ServerToClientEvents, View } from '../shared/types.ts';

const [room, countArg, url = 'http://localhost:3000'] = process.argv.slice(2);
if (!room) {
  console.error('usage: npm run bots -- <ROOM> [count] [url]');
  process.exit(1);
}
const count = Number(countArg ?? 6);
const NAMES = ['Aunt Bot', 'Botty', 'Robo Cuz', 'Unit 7', 'Beep', 'Boop', 'Chip', 'Gizmo', 'Sprocket', 'Widget', 'Bolt', 'Pixel'];
const QUIPS = [
  'When the WiFi password is wrong',
  'Future tax accountant',
  'This is my villain origin story',
  'Me after one (1) grape',
  'Mom said it was my turn on the Xbox',
  'Already planning the heist',
];
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const later = (fn: () => void) => setTimeout(fn, 1000 + Math.random() * 6000);

for (let i = 0; i < count; i++) {
  const name = NAMES[i % NAMES.length];
  const s: Socket<ServerToClientEvents, ClientToServerEvents> = io(url, { transports: ['websocket'] });
  let token: string | undefined;
  let actedOn = '';

  s.on('connect', () => {
    s.emit('player:join', { roomCode: room, name, token }, (res) => {
      if (!res.ok) return console.error(`${name}: ${res.error}`);
      token = res.token;
      console.log(`${name} joined as ${res.playerId}`);
    });
  });

  s.on('view', (v: View) => {
    if (v.role !== 'player') return;
    const pv = v as PlayerView;
    const key = `${pv.phase}:${pv.round?.index}`;
    if (key === actedOn) return;
    if (pv.phase === 'CAPTIONING' && !pv.myCaption) {
      actedOn = key;
      later(() => s.emit('player:caption', { text: pick(QUIPS) }, () => {}));
    } else if (pv.phase === 'VOTING' && !pv.myVoteCaptionId && pv.round?.captions) {
      const options = pv.round.captions.filter((c) => c.id !== pv.myCaptionId);
      if (options.length) {
        actedOn = key;
        later(() => s.emit('player:vote', { captionId: pick(options).id }, () => {}));
      }
    }
  });
}
