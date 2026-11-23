// Avatar picker options. Swap the lists to change what players can choose.
export const AVATARS = ['🦄', '🐸', '🦖', '🐙', '🦊', '🐼', '🐯', '🦉', '🐵', '🐧', '🦋', '🍕', '🌮', '👽', '🤠', '👑'];
export const COLORS = ['#ff5d8f', '#ffb020', '#3ddc97', '#4cc9f0', '#9b5de5', '#f15bb5', '#00bbf9', '#fee440'];
export const REACTIONS = ['😂', '🔥', '👏', '😱', '💀'];

/** Stable fallback avatar/color for a player without one (hash of id). */
export function fallbackLook(id: string): { avatar: string; color: string } {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { avatar: AVATARS[h % AVATARS.length], color: COLORS[h % COLORS.length] };
}
