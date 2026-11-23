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

export interface RevealPlan {
  /** Captions in reveal order (fewest votes first). */
  order: ScoredCaption[];
  /** Ids of the winning caption(s); empty when nobody got a vote. */
  winners: Set<string>;
  /** Groups revealed together, one per step (all tied winners share the last step). */
  steps: ScoredCaption[][];
}

export function planReveal(results: ScoredCaption[]): RevealPlan {
  const order = [...results].sort((a, b) => a.votes - b.votes || b.text.length - a.text.length);
  const max = Math.max(0, ...order.map((c) => c.votes));
  const winners = new Set(max > 0 ? order.filter((c) => c.votes === max).map((c) => c.id) : []);
  const steps: ScoredCaption[][] = order.filter((c) => !winners.has(c.id)).map((c) => [c]);
  const w = order.filter((c) => winners.has(c.id));
  if (w.length) steps.push(w);
  return { order, winners, steps };
}
