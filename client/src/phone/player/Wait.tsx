import type { PlayerView } from '../../../../shared/types.ts';
import { Avatar } from '../Avatar.tsx';
import { COPY } from '../copy.ts';

/** LOBBY and PHOTO_REVEAL: nothing to do but look at the TV. */
export function Wait({ view }: { view: PlayerView }) {
  const reveal = view.phase === 'PHOTO_REVEAL';
  return (
    <section className="ph-center ph-wait">
      <div className="ph-wait__bounce">
        <Avatar player={view.me} size={128} />
      </div>
      <h2 className="ph-title">{reveal ? COPY.reveal.title : COPY.wait.title}</h2>
      <p className="ph-sub">{reveal ? COPY.reveal.sub : COPY.wait.sub}</p>
      {!reveal && <p className="ph-chip">{view.me.name}</p>}
    </section>
  );
}
