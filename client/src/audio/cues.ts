// Audio manifest: the single source of truth for every sound the TV plays.
//
// Music: one file per cue.   lobby: { src: real('music-lobby'), ... }
//   real('music-lobby') looks for client/public/audio/music-lobby.ogg, then .mp3.
// SFX: several takes per key; the manager picks one at random, never the same twice in a row.
//   winner: { takes: takes('sfx-winner', 4), ... }  ->  sfx-winner-1 ... sfx-winner-4
//   Swap in your own file by listing it: { takes: [real('my-fanfare'), ...takes('sfx-winner', 2)] }
// If a file is missing or fails to load, that take (or cue) is silently skipped.
// The files are rendered in Soundcraft by client/src/audio/soundtrack/build.sh (see docs/team/music-briefs.md).
import type { Phase } from '../../../shared/types.ts';
import type { SfxKey } from './index.ts';

/** A file in client/public/audio/ (ogg first: it loops gaplessly; mp3 as fallback). */
export const real = (name: string): string[] => [`/audio/${name}.ogg`, `/audio/${name}.mp3`];
/** Files from client/src/audio/generate-placeholders.sh (not committed; run the script to get them). */
export const placeholder = (name: string): string[] => [
  `/audio/placeholder/${name}.ogg`,
  `/audio/placeholder/${name}.mp3`,
];
/** name-1 .. name-n, as written by the soundtrack build. */
export const takes = (name: string, n: number): string[][] => Array.from({ length: n }, (_, i) => real(`${name}-${i + 1}`));

export type MusicKey = 'lobby' | 'captioning' | 'voting' | 'results' | 'final';

export interface Cue {
  src: string[];
  /** 0..1, relative to the master volume. */
  volume: number;
  loop: boolean;
}

export interface SfxCue {
  /** One entry per take; each entry is that take's [ogg, mp3] paths. */
  takes: string[][];
  /** 0..1, relative to the master volume. */
  volume: number;
  /** Dip the music while this plays. */
  duck?: boolean;
  /** Consecutive calls within this many ms count as one rising run (each step plays higher). */
  risingRunMs?: number;
  /** Ignore repeat calls closer together than this (ms). */
  minGapMs?: number;
}

export const MUSIC: Record<MusicKey, Cue> = {
  lobby: { src: real('music-lobby'), volume: 0.5, loop: true },
  captioning: { src: real('music-captioning'), volume: 0.5, loop: true },
  voting: { src: real('music-voting'), volume: 0.4, loop: true },
  results: { src: real('music-results'), volume: 0.35, loop: true },
  final: { src: real('music-final'), volume: 0.5, loop: true },
};

export const SFX: Record<SfxKey, SfxCue> = {
  // lobby
  join: { takes: takes('sfx-join', 4), volume: 0.55, minGapMs: 120 },
  teamJoin: { takes: takes('sfx-teamJoin', 4), volume: 0.5, minGapMs: 200 },
  teamRename: { takes: takes('sfx-teamRename', 2), volume: 0.55, minGapMs: 400 },
  // round flow
  whoosh: { takes: takes('sfx-whoosh', 4), volume: 0.45, minGapMs: 400 },
  roundStart: { takes: takes('sfx-roundStart', 3), volume: 0.85, duck: true, minGapMs: 1000 },
  reveal: { takes: takes('sfx-reveal', 3), volume: 0.8, duck: true, minGapMs: 1000 },
  // captioning & voting
  submit: { takes: takes('sfx-submit', 4), volume: 0.5, minGapMs: 80 },
  voteCast: { takes: takes('sfx-voteCast', 4), volume: 0.3, minGapMs: 90 },
  allIn: { takes: takes('sfx-allIn', 3), volume: 0.8, duck: true, minGapMs: 1500 },
  lastCall: { takes: takes('sfx-lastCall', 2), volume: 0.75, duck: true, minGapMs: 2000 },
  tick: { takes: takes('sfx-tick', 2), volume: 0.35 },
  timesUp: { takes: takes('sfx-timesUp', 3), volume: 0.8, duck: true, minGapMs: 1500 },
  cardDeal: { takes: takes('sfx-cardDeal', 3), volume: 0.5 },
  // results
  drumroll: { takes: takes('sfx-drumroll', 2), volume: 0.75, duck: true, minGapMs: 1000 },
  tally: { takes: takes('sfx-tally', 3), volume: 0.5, risingRunMs: 700 },
  zeroVotes: { takes: takes('sfx-zeroVotes', 3), volume: 0.6, duck: true, minGapMs: 600 },
  winner: { takes: takes('sfx-winner', 4), volume: 0.9, duck: true, minGapMs: 1000 },
  tie: { takes: takes('sfx-tie', 2), volume: 0.8, duck: true, minGapMs: 1000 },
  sweep: { takes: takes('sfx-sweep', 2), volume: 0.85, duck: true, minGapMs: 1000 },
  leaderboard: { takes: takes('sfx-leaderboard', 2), volume: 0.7, duck: true, minGapMs: 800 },
  leaderChange: { takes: takes('sfx-leaderChange', 2), volume: 0.8, duck: true, minGapMs: 1000 },
  // final
  podium3: { takes: takes('sfx-podium3', 1), volume: 0.75, duck: true, minGapMs: 500 },
  podium2: { takes: takes('sfx-podium2', 1), volume: 0.85, duck: true, minGapMs: 500 },
  podium1: { takes: takes('sfx-podium1', 1), volume: 0.95, duck: true, minGapMs: 500 },
  champion: { takes: takes('sfx-champion', 2), volume: 1, duck: true, minGapMs: 2000 },
};

/** Which music bed plays in each phase. null = silence (the reveal stinger gets the stage).
 *  Consecutive phases with the same cue keep playing without restarting. */
export const PHASE_MUSIC: Record<Phase, MusicKey | null> = {
  LOBBY: 'lobby',
  PHOTO_REVEAL: null,
  CAPTIONING: 'captioning',
  VOTING: 'voting',
  RESULTS: 'results',
  SCOREBOARD: 'results',
  FINAL: 'final',
};

/** Sounds that would pile up on the same moment. Within `windowMs` a key is skipped if a key listed
 *  before it in the same group already played (priority order). With `firstWins`, any earlier one blocks it. */
export const SFX_EXCLUSIVE: { keys: SfxKey[]; windowMs: number; firstWins?: boolean }[] = [
  { keys: ['join', 'teamJoin'], windowMs: 400, firstWins: true }, // a new player in team mode
  { keys: ['allIn', 'timesUp', 'champion', 'roundStart', 'reveal', 'whoosh'], windowMs: 900 }, // phase changes
  { keys: ['allIn', 'voteCast', 'submit'], windowMs: 300 }, // the last vote/caption
  { keys: ['lastCall', 'tick'], windowMs: 900 },
];

/** Semitone offsets for each step of a rising run (tally count-ups). Last value repeats. */
export const RISING_STEPS = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19];

/** Mixing and timing knobs. */
export const AUDIO_TUNING = {
  /** Phase-to-phase music crossfade. */
  crossfadeMs: 800,
  /** Music level (multiplier) while a ducking stinger plays. */
  duckLevel: 0.3,
  duckInMs: 120,
  duckOutMs: 500,
  /** Tick every second when a timed phase has fewer than this many seconds left. */
  tickFromSeconds: 10,
  /** Play lastCall (instead of a tick) when this many seconds are left. */
  lastCallSeconds: 10,
  /** The last N ticks play slightly higher and louder. */
  urgentTicks: 3,
  /** Play timesUp automatically when a phase deadline hits zero. */
  autoTimesUp: true,
  defaultVolume: 0.8,
  /** Volume step for the -/= keys on the TV. */
  volumeStep: 0.1,
};
