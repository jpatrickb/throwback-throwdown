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
