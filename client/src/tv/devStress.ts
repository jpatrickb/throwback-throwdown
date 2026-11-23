// Dev-only: stress the mock fixtures from the URL, to check layouts at the edges.
//   /tv?mock=RESULTS&mockcaptions=0   tough crowd (0, 1, ... captions)
//   /tv?mock=SCOREBOARD&mockplayers=16  a big family
// No effect unless ?mock= is set.
import type { Player, TvView } from '../../../shared/types.ts';
import { IS_MOCK } from '../socket.ts';

const EXTRA_NAMES = ['Uncle Bartholomew', 'Zoe', 'Great-Aunt Marguerite', 'Leo', 'Nana', 'Ricky Jr.', 'Ava', 'Big Mike', 'Lulu', 'Theo', 'Cousin Christopher', 'Mo'];
const EXTRA_CAPTIONS = [
  'Nobody tell him the ice cream truck plays music when it is out of ice cream',
  'POV: you just heard the word "bedtime"',
  'Before the bowl cut. After the trauma.',
  'He thinks he is people',
  'Me explaining my fantasy football strategy at Thanksgiving dinner to absolutely no one',
  'Peak fashion, 1997',
];

export function stressView(v: TvView | null): TvView | null {
  if (!IS_MOCK || !v) return v;
  const q = new URLSearchParams(location.search);
  let out = v;
  const np = q.get('mockplayers');
  if (np !== null) {
    const n = Number(np);
    const players: Player[] = Array.from({ length: n }, (_, i) =>
      v.players[i] ?? {
        id: `x${i}`,
        name: EXTRA_NAMES[(i - v.players.length) % EXTRA_NAMES.length],
        avatar: i % 3 === 0 ? ['🦖', '🐸', '🌮', '👑'][i % 4] : null,
        color: null,
        score: Math.max(0, 900 - i * 70),
        connected: i % 7 !== 3,
      },
    );
    out = { ...out, players };
  }
  const nc = q.get('mockcaptions');
  if (nc !== null && out.round) {
    const n = Number(nc);
    const pad = <T,>(arr: T[], make: (i: number) => T) => Array.from({ length: n }, (_, i) => arr[i] ?? make(i));
    const r = out.round;
    out = {
      ...out,
      round: {
        ...r,
        captions: r.captions && pad(r.captions, (i) => ({ id: `xc${i}`, text: EXTRA_CAPTIONS[i % EXTRA_CAPTIONS.length] })),
        results:
          r.results &&
          pad(r.results, (i) => ({
            id: `xc${i}`,
            text: EXTRA_CAPTIONS[i % EXTRA_CAPTIONS.length],
            playerId: out.players[i % out.players.length].id,
            playerName: out.players[i % out.players.length].name,
            votes: i % 3,
            points: (i % 3) * 100,
          })).map((c) => (n === 1 ? { ...c, votes: 0, points: 0 } : c)),
      },
    };
  }
  return out;
}
