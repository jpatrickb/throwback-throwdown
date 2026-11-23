// Pure ranking helpers (unit-tested in ranking.test.ts).
import type { Player, ScoredCaption } from '../../../shared/types.ts';

export function byScore(a: Pick<Player, 'score' | 'name'>, b: Pick<Player, 'score' | 'name'>) {
  return b.score - a.score || a.name.localeCompare(b.name);
}

/** Competition ranking: ties share a rank (1, 2, 2, 4). */
export function ranks<T extends { score: number }>(sorted: T[]): number[] {
  return sorted.map((p) => 1 + sorted.filter((q) => q.score > p.score).length);
}

/** Points each player earned this round. */
export function roundPoints(results: ScoredCaption[] | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of results ?? []) out[r.playerId] = (out[r.playerId] ?? 0) + r.points;
  return out;
}

export type BeatKind = 'zero' | 'tier' | 'drama' | 'winner';

/** One moment of the results reveal: a group of captions shown together. */
export interface Beat {
  kind: BeatKind;
  captions: ScoredCaption[];
}

export interface RevealPlan {
  /** Ids of the winning caption(s); empty when nobody got a vote. */
  winners: Set<string>;
  /** Ids of the top-3 runners-up that get their own dramatic beat. */
  drama: Set<string>;
  beats: Beat[];
}

/**
 * Results pacing for big groups (25 captions must reveal in well under 45s):
 *   1. every zero-vote caption at once (one quick beat),
 *   2. the remaining low-vote captions grouped by vote count, fewest first (one quick beat per count),
 *   3. the top 3 one at a time for drama (3rd, then 2nd),
 *   4. the winner(s) together, last.
 * Tied winners all share the last beat; ties can push the top-3 group past 3.
 */
const MAX_TIER_BEATS = 5;

export function planReveal(results: ScoredCaption[]): RevealPlan {
  const desc = [...results].sort((a, b) => b.votes - a.votes || a.text.length - b.text.length);
  const max = desc[0]?.votes ?? 0;
  const winnerList = max > 0 ? desc.filter((c) => c.votes === max) : [];
  const winners = new Set(winnerList.map((c) => c.id));
  // Top 3 by votes (with votes > 0); winners count toward the 3.
  const dramaList = desc.filter((c) => c.votes > 0 && !winners.has(c.id)).slice(0, Math.max(0, 3 - winnerList.length));
  const drama = new Set(dramaList.map((c) => c.id));
  const rest = desc.filter((c) => !winners.has(c.id) && !drama.has(c.id));

  const beats: Beat[] = [];
  const zeros = rest.filter((c) => c.votes === 0);
  if (zeros.length) beats.push({ kind: 'zero', captions: zeros });
  const tiers = new Map<number, ScoredCaption[]>();
  for (const c of rest.filter((c) => c.votes > 0)) tiers.set(c.votes, [...(tiers.get(c.votes) ?? []), c]);
  // At most MAX_TIER_BEATS quick beats: neighbouring vote counts are merged if there are more.
  const counts = [...tiers.keys()].sort((a, b) => a - b);
  const per = Math.ceil(counts.length / MAX_TIER_BEATS);
  for (let i = 0; i < counts.length; i += per) {
    beats.push({ kind: 'tier', captions: counts.slice(i, i + per).flatMap((v) => tiers.get(v)!) });
  }
  for (const c of [...dramaList].reverse()) beats.push({ kind: 'drama', captions: [c] });
  if (winnerList.length) beats.push({ kind: 'winner', captions: winnerList });
  return { winners, drama, beats };
}

/** How long each kind of beat stays on screen before the next one (ms). */
export const BEAT_MS: Record<BeatKind, number> = {
  zero: 2600,
  tier: 1700,
  drama: 3000,
  winner: 4500, // winner card animation + confetti; nothing follows, counted for the total
};
/** Pause before the first beat, and the extra drumroll before the winner (ms). */
export const FIRST_BEAT_MS = 900;
export const DRUMROLL_MS = 2200;

/** When each beat starts (ms from the screen appearing), plus the total duration. */
export function revealSchedule(plan: RevealPlan): { starts: number[]; total: number } {
  const starts: number[] = [];
  let t = FIRST_BEAT_MS;
  plan.beats.forEach((b, i) => {
    if (b.kind === 'winner' && i > 0) t += DRUMROLL_MS;
    starts.push(t);
    t += BEAT_MS[b.kind];
  });
  return { starts, total: t };
}

/**
 * Did someone new take first place this round? True when none of last round's leaders
 * (highest `prev` score) are among this round's leaders. False before anyone had points.
 */
export function leaderChanged(rows: { id: string; score: number; prev: number }[]): boolean {
  if (!rows.length) return false;
  const prevMax = Math.max(...rows.map((r) => r.prev));
  if (prevMax <= 0) return false;
  const max = Math.max(...rows.map((r) => r.score));
  const before = new Set(rows.filter((r) => r.prev === prevMax).map((r) => r.id));
  return !rows.some((r) => r.score === max && before.has(r.id));
}
