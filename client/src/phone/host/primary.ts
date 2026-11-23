import type { HostAction, HostView } from '../../../../shared/types.ts';
import { COPY } from '../copy.ts';

export interface PrimaryStep {
  label: string;
  action: HostAction;
}

/** The one giant button: what "go to the next step" means in each phase. */
export function primaryFor(view: Pick<HostView, 'phase' | 'photos'>): PrimaryStep {
  const P = COPY.host.primary;
  switch (view.phase) {
    case 'LOBBY':
      return { label: P.LOBBY, action: { type: 'start' } };
    case 'PHOTO_REVEAL':
      return { label: P.PHOTO_REVEAL, action: { type: 'next' } };
    case 'CAPTIONING':
      return { label: P.CAPTIONING, action: { type: 'next' } };
    case 'VOTING':
      return { label: P.VOTING, action: { type: 'next' } };
    case 'RESULTS':
      return { label: P.RESULTS, action: { type: 'next' } };
    case 'SCOREBOARD':
      return view.photos.some((p) => !p.used)
        ? { label: P.SCOREBOARD_NEXT, action: { type: 'nextRound' } }
        : { label: P.SCOREBOARD_END, action: { type: 'end' } };
    case 'FINAL':
      return { label: P.FINAL, action: { type: 'reset' } };
  }
}
