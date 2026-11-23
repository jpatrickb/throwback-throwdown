// Motion presets for the TV. Durations mirror --dur-* in theme/tokens.css (seconds here).
import type { Transition, Variants } from 'motion/react';

export const DUR = { fast: 0.18, base: 0.4, slow: 0.9 } as const;

export const SPRING_POP: Transition = { type: 'spring', stiffness: 520, damping: 18 };
export const SPRING_SOFT: Transition = { type: 'spring', stiffness: 220, damping: 24 };

/** Whole-screen transition between phases. */
export const screenVariants: Variants = {
  initial: { opacity: 0, scale: 0.94, y: 40 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: DUR.base, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, scale: 1.04, y: -30, transition: { duration: DUR.fast * 1.5 } },
};

/** Timings for scripted sequences (ms). Tune pacing here. */
export const TIMING = {
  revealRoundTitle: 1400, // "Round N" slam before the photo flips
  revealFlip: 1100,
  cardDealStagger: 0.18, // seconds between voting cards
  resultsFirstDelay: 900,
  resultsPerCaption: 2300, // gap between revealed captions
  resultsWinnerHold: 3200, // extra suspense before the winner
  scoreboardReorderDelay: 1300,
  finalPodiumStep: 1100,
} as const;
