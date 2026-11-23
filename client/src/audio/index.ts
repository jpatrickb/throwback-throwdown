// Audio seam between the TV screen and the audio workstream.
// The TV calls these; the audio teammate owns everything behind them
// (cue manifest in cues.ts, Howler manager in manager.ts, assets in public/audio/).
// Keep these signatures stable.
import { useEffect } from 'react';
import type { TvView } from '../../../shared/types.ts';
import { audio } from './manager.ts';

export { AudioIndicator } from './AudioIndicator.tsx';

/** One-shot sound effects the TV can trigger at animation moments.
 *  `tick` and `timesUp` are played automatically from view.deadline; the TV doesn't need to call them. */
export type SfxKey =
  | 'join' // a player joined the lobby
  | 'reveal' // photo reveal
  | 'submit' // someone submitted a caption / vote
  | 'tick' // final-seconds countdown tick
  | 'timesUp'
  | 'cardDeal' // caption card appears
  | 'tally' // a vote counts up
  | 'winner' // round winner reveal
  | 'leaderboard' // scoreboard reshuffle
  | 'champion'; // final winner

/** Call once from Tv.tsx with the latest view. Drives phase music, countdown ticks,
 *  and the TV keyboard shortcuts: M = mute, - / = = volume down / up. */
export function useGameAudio(view: TvView | null): void {
  useEffect(() => {
    audio.setView(view);
  }, [view]);

  useEffect(() => {
    // Any click/key on the TV page also unlocks audio, in case the overlay is skipped.
    const unlock = () => audio.unlock();
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === 'm' || e.key === 'M') audio.toggleMute();
      else if (e.key === '-' || e.key === '_') audio.nudgeVolume(-1);
      else if (e.key === '=' || e.key === '+') audio.nudgeVolume(1);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('keydown', onKey);
    if (import.meta.env.DEV) (window as unknown as { __tvAudio: typeof audio }).__tvAudio = audio;
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
}

/** Fire a one-shot sound effect. Safe to call before audio is unlocked (it's dropped). */
export function playSfx(key: SfxKey): void {
  audio.playSfx(key);
}

/** Browsers block audio until a user gesture. TV calls this from its "click to start" overlay. */
export function unlockAudio(): void {
  audio.unlock();
}
