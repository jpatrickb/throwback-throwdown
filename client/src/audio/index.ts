// Audio seam between the TV screen and the audio workstream.
// Tv.tsx calls useGameAudio(view) once; the audio teammate owns everything
// behind this hook (cue map, Howler manager, assets). Keep the signature.
import type { TvView } from '../../../shared/types.ts';

export function useGameAudio(_view: TvView | null): void {
  // Stub: audio teammate implements phase-driven loops and stingers.
}
