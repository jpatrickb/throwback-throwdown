// Audio seam between the TV screen and the audio workstream.
// The TV calls these; the audio teammate owns everything behind them
// (cue manifest, Howler manager, assets). Keep these signatures stable.
import type { TvView } from '../../../shared/types.ts';

/** One-shot sound effects the TV can trigger at animation moments. */
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

/** Call once from Tv.tsx with the latest view. Drives phase music. */
export function useGameAudio(_view: TvView | null): void {}

/** Fire a one-shot sound effect. Safe to call before audio is unlocked. */
export function playSfx(_key: SfxKey): void {}

/** Browsers block audio until a user gesture. TV calls this from its "click to start" overlay. */
export function unlockAudio(): void {}
