import type { Player } from '../../../../shared/types.ts';

/** 1-based rank with ties sharing a rank (two 500s are both #2). */
export function rankOf(players: Player[], meId: string): number {
  const me = players.find((p) => p.id === meId);
  if (!me) return players.length;
  return 1 + players.filter((p) => p.score > me.score).length;
}
