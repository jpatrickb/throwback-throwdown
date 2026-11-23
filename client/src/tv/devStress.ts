// Dev-only: stress the mock fixtures from the URL, to check layouts at the edges.
//   /tv?mock=RESULTS&mockcaptions=0     tough crowd (0, 1, ... captions)
//   /tv?mock=VOTING&mockcaptions=25&mockplayers=25&mocklong   worst case: 25 captions, all 80 chars
//   /tv?mock=SCOREBOARD&mockplayers=25  a big family
// No effect unless ?mock= is set.
import type { Player, ScoredCaption, TvView } from '../../../shared/types.ts';
import { IS_MOCK } from '../socket.ts';

const FIRST = ['Uncle Bartholomew', 'Zoe', 'Great-Aunt Marguerite', 'Leo', 'Nana', 'Ricky Jr.', 'Ava', 'Big Mike', 'Lulu', 'Theo',
  'Cousin Christopher', 'Mo', 'Aunt Pam', 'Dex', 'Grandma Rose', 'Ellie', 'Uncle Ray', 'Kai', 'Becca', 'Junior', 'Tia', 'Oscar',
  'Marisol', 'Hank', 'Pip', 'Auntie Gwen', 'Benji', 'Cass', 'Uncle Lou', 'Nora'];

const CAPTIONS = [
  'Nobody tell him the ice cream truck plays music when it is out of ice cream',
  'POV: you just heard the word "bedtime"',
  'Before the bowl cut. After the trauma.',
  'He thinks he is people',
  'Me explaining my fantasy football strategy at Thanksgiving to absolutely no one',
  'Peak fashion, 1997',
  'The face of someone who just learned vegetables are mandatory',
  'Mom said smile. This is the smile.',
  'Plotting revenge on whoever invented naptime',
  'When the Wi-Fi drops during the family group call and you finally get some peace',
  'Certified chaos goblin',
  'That shirt was a choice and the choice was made by Grandma',
  'Me at 7am vs me at 7pm',
  'Already negotiating his allowance',
  'The original influencer',
  'He saw the dentist. The dentist saw him.',
  'Future reality TV star in the making, sponsored by apple juice and pure spite',
  'Emotionally preparing for the first day of kindergarten',
  'Ready to fight the family dog for the last chicken nugget on the plate',
  'Too cool for school, not too cool for juice',
];
const LONG = 'This caption is exactly eighty characters long so we can test the worst case!!!';

/** A realistic vote spread for n captions and v voters: a few favourites, a long tail of zeros. */
function spread(n: number, voters: number): number[] {
  const base = [7, 5, 3, 2, 2, 1, 1, 1, 1, 1, 1];
  const out = Array.from({ length: n }, (_, i) => base[i] ?? 0);
  let total = out.reduce((a, b) => a + b, 0);
  for (let i = 0; total > voters && i < n; i = (i + 1) % n) if (out[i] > 0) { out[i]--; total--; }
  // shuffle deterministically so the order on screen isn't sorted
  return out.map((v, i) => ({ v, k: (i * 7919) % 97 })).sort((a, b) => a.k - b.k).map((x) => x.v);
}

export function stressView(v: TvView | null): TvView | null {
  if (!IS_MOCK || !v) return v;
  const q = new URLSearchParams(location.search);
  const long = q.has('mocklong');
  let out = v;
  const np = q.get('mockplayers');
  if (np !== null) {
    const n = Number(np);
    const players: Player[] = Array.from({ length: n }, (_, i) => {
      if (v.players[i]) return v.players[i];
      const j = i - v.players.length;
      return {
        id: `x${i}`,
        name: FIRST[j % FIRST.length] + (j >= FIRST.length ? ` ${Math.floor(j / FIRST.length) + 1}` : ''),
        avatar: i % 3 === 0 ? ['🦖', '🐸', '🌮', '👑'][i % 4] : null,
        color: null,
        score: Math.max(0, 900 - i * 40),
        connected: i % 7 !== 3,
        teamId: null,
      };
    });
    out = { ...out, players };
  }
  const nc = q.get('mockcaptions');
  if ((nc !== null || long) && out.round) {
    const r = out.round;
    const n = nc !== null ? Number(nc) : (r.captions ?? r.results ?? []).length;
    const text = (i: number, orig?: string) => (long ? LONG : orig ?? CAPTIONS[i % CAPTIONS.length]);
    const votes = spread(n, Math.max(out.players.length, n));
    const ps = out.players;
    out = {
      ...out,
      round: {
        ...r,
        captions: r.captions && Array.from({ length: n }, (_, i) => ({ id: r.captions![i]?.id ?? `xc${i}`, text: text(i, r.captions![i]?.text) })),
        results:
          r.results &&
          Array.from({ length: n }, (_, i): ScoredCaption => {
            const p = ps[i % ps.length];
            const vv = n === 1 ? 0 : n <= r.results!.length ? r.results![i].votes : votes[i];
            return { id: r.results![i]?.id ?? `xc${i}`, text: text(i, r.results![i]?.text), playerId: p.id, playerName: p.name, teamId: null, teamName: null, votes: vv, points: vv * 100 };
          }),
        submittedPlayerIds: r.submittedPlayerIds,
        votedPlayerIds: r.votedPlayerIds,
      },
    };
  }
  return out;
}
