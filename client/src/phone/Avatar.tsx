import type { Player } from '../../../shared/types.ts';
import { fallbackLook } from './avatars.ts';

export function Avatar({ player, size = 48 }: { player: Pick<Player, 'id' | 'avatar' | 'color'>; size?: number }) {
  const fb = fallbackLook(player.id);
  return (
    <span
      className="ph-avatar"
      style={{ width: size, height: size, fontSize: size * 0.58, background: player.color ?? fb.color }}
      aria-hidden
    >
      {player.avatar ?? fb.avatar}
    </span>
  );
}
