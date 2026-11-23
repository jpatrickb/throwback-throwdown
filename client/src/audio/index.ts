// Audio seam between the TV screen and the audio workstream.
// The TV calls these; the audio teammate owns everything behind them
// (cue manifest in cues.ts, Howler manager in manager.ts, assets in public/audio/).
// Keep these signatures stable.
import { useEffect } from 'react';
import type { TvView } from '../../../shared/types.ts';
import { audio } from './manager.ts';

export { AudioIndicator } from './AudioIndicator.tsx';

/** One-shot sound effects. Every key has one or more takes (random, never the same twice in a row).
 *  AUTO = fired by useGameAudio from the view; the TV doesn't call these. See docs/team/audio.md. */
export type SfxKey =
  // lobby
  | 'join' // TV: a player joined the lobby
  | 'teamJoin' // AUTO: a player lands on (or moves to) a team in the lobby
  | 'teamRename' // AUTO: a team renamed itself
  // round flow
  | 'whoosh' // AUTO: every phase change
  | 'roundStart' // TV: the "Round N" slam
  | 'reveal' // TV: photo reveal
  // captioning & voting
  | 'submit' // TV: someone submitted a caption (or vote)
  | 'voteCast' // AUTO: a vote came in (subtle)
  | 'allIn' // AUTO: everyone/every team has submitted, or everyone has voted
  | 'lastCall' // AUTO: 10 seconds left
  | 'tick' // AUTO: final-seconds countdown tick
  | 'timesUp' // AUTO: deadline hit zero
  | 'cardDeal' // TV: caption card appears
  // results
  | 'drumroll' // TV: short build right before the winner reveal
  | 'tally' // TV: a vote counts up (rises in pitch through a count-up)
  | 'zeroVotes' // TV: a caption got no votes (playful "aww")
  | 'winner' // TV: round winner reveal
  | 'tie' // TV: tied for the win
  | 'sweep' // TV: clean sweep bonus
  | 'leaderboard' // TV: scoreboard reshuffle
  | 'leaderChange' // TV: a new leader takes first place on the scoreboard
  // final
  | 'podium3' // TV: third place revealed
  | 'podium2' // TV: second place revealed
  | 'podium1' // TV: first place revealed
  | 'champion'; // TV: final winner celebration

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

/** Fire a one-shot sound effect. Safe to call before audio is unlocked (it's dropped).
 *  `tally` rises automatically when called repeatedly (within 0.7 s); pass `{ step }` to set the step yourself. */
export function playSfx(key: SfxKey, opts?: { step?: number }): void {
  audio.playSfx(key, opts?.step !== undefined ? { step: opts.step } : {});
}

/** Browsers block audio until a user gesture. TV calls this from its "click to start" overlay. */
export function unlockAudio(): void {
  audio.unlock();
}
