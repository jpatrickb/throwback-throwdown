import type { PlayerView } from '../../../../shared/types.ts';
import { Avatar } from '../Avatar.tsx';
import { COPY } from '../copy.ts';
import { TeamCard } from './TeamCard.tsx';

/** LOBBY and PHOTO_REVEAL: nothing to do but look at the TV. */
export function Wait({ view }: { view: PlayerView }) {
  const reveal = view.phase === 'PHOTO_REVEAL';
  return (
    <section className="ph-center ph-wait">
      <div className="ph-wait__bounce">
        <Avatar player={view.me} size={view.myTeam && !reveal ? 96 : 128} />
      </div>
      <h2 className="ph-title">{reveal ? COPY.reveal.title : COPY.wait.title}</h2>
      <p className="ph-sub">{reveal ? COPY.reveal.sub : COPY.wait.sub}</p>
      {view.myTeam ? <TeamCard view={view} compact={reveal} /> : !reveal && <p className="ph-chip">{view.me.name}</p>}
    </section>
  );
}
