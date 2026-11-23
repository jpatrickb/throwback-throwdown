// Pure colour helpers (no React/socket imports, so they're unit-testable).
import type { Player } from '../../../shared/types.ts';

/** Accent colour for a player: their own colour if set, else a palette slot from tokens.css. */
export function playerColor(p: Pick<Player, 'id' | 'color'>, index?: number): string {
  if (p.color) return p.color;
  let n = index;
  if (n === undefined) {
    n = 0;
    for (const ch of p.id) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return `var(--player-${n % 8})`;
}
