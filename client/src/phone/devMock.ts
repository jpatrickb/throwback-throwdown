// Dev-only: ?mock=VOTING&mockcount=25 pads the fixture view to N players and
// captions so big-room layouts can be checked without a server. No effect
// outside mock mode. (Fixtures themselves live in dev/fixtures.ts, lead-owned.)
import type { HostView, Player, PlayerView } from '../../../shared/types.ts';
import { IS_MOCK } from '../socket.ts';

const NAMES = ['Ava', 'Ben', 'Cleo', 'Dev', 'Eli', 'Fran', 'Gus', 'Hana', 'Ivy', 'Jon', 'Kai', 'Lou', 'Mo', 'Nia', 'Otto', 'Pia', 'Quinn', 'Rex', 'Sia', 'Theo', 'Uma', 'Vic', 'Wes'];
const LINES = [
  'Peak toddler confidence',
  'When the ice cream truck drives past without stopping',
  'Already disappointed in all of you',
  'Dressed for the job he wants: retired',
  'Negotiating bedtime like a seasoned lawyer',
  'The face of someone who just learned about taxes',
  'Born to nap, forced to pose',
  'This outfit was a choice and I respect it',
  'Plotting revenge on whoever took this photo',
];

function count(): number {
  if (!IS_MOCK) return 0;
  const n = Number(new URLSearchParams(window.location.search).get('mockcount'));
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 60) : 0;
}

function padPlayers(players: Player[], n: number): Player[] {
  const out = [...players];
  for (let i = out.length; i < n; i++) {
    out.push({ id: `x${i}`, name: NAMES[i % NAMES.length] + (i >= NAMES.length ? ` ${i}` : ''), avatar: null, color: null, score: 0, connected: true });
  }
  return out;
}

export function inflate<V extends PlayerView | HostView>(view: V | null): V | null {
  const n = count();
  if (!view || !n || !view.round) return view;
  const players = padPlayers(view.players, n);
  const extra = players.slice(view.players.length);
  const round = { ...view.round };
  if (round.captions) {
    round.captions = [...round.captions];
    for (let i = round.captions.length; i < n - 1; i++) round.captions.push({ id: `xc${i}`, text: LINES[i % LINES.length] });
  }
  const v = { ...view, players, round };
  if (v.role === 'host' && v.allCaptions) {
    (v as HostView).allCaptions = [
      ...v.allCaptions,
      ...extra.slice(0, Math.max(0, n - 1 - v.allCaptions.length)).map((p, i) => ({ id: `xc${i}`, playerId: p.id, text: LINES[i % LINES.length], hidden: false })),
    ];
  }
  return v as V;
}
