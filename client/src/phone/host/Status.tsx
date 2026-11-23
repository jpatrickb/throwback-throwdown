import type { HostView } from '../../../../shared/types.ts';
import { Countdown } from '../Countdown.tsx';
import { COPY } from '../copy.ts';
import { useAct } from './useAct.ts';

/** Live progress for timed phases: who's done, who's missing, clock controls. */
export function Status({ view }: { view: HostView }) {
  const act = useAct();
  const timed = view.phase === 'CAPTIONING' || view.phase === 'VOTING';
  const round = view.round;
  if (!round) return null;

  const active = view.players.filter((p) => p.connected);
  const doneIds = view.phase === 'CAPTIONING' ? round.submittedPlayerIds : round.votedPlayerIds;
  const done = active.filter((p) => doneIds.includes(p.id)).length;
  const missing = active.filter((p) => !doneIds.includes(p.id));

  return (
    <section className="ph-card ph-status">
      <div className="ph-status__row">
        <img className="ph-thumb" src={round.photo.url} alt="" />
        <div className="ph-status__text">
          <span className="ph-muted">
            Photo {round.index + 1} of {round.totalPhotosQueued}
          </span>
          {timed && (
            <strong>
              {view.phase === 'CAPTIONING'
                ? COPY.host.captionsIn(done, active.length)
                : COPY.host.votesIn(done, active.length)}
            </strong>
          )}
        </div>
        {timed && <Countdown deadline={view.deadline} serverNow={view.serverNow} />}
      </div>

      {timed && missing.length > 0 && (
        <p className="ph-missing">
          <span className="ph-muted">{COPY.host.missing}: </span>
          {missing.map((p) => p.name).join(', ')}
        </p>
      )}

      {timed && (
        <div className="ph-btn-row">
          <button className="ph-btn ph-btn--ghost" onClick={() => act({ type: 'addTime', seconds: 30 })}>
            {COPY.host.addTime}
          </button>
          <button className="ph-btn ph-btn--ghost" onClick={() => act({ type: 'next' })}>
            {COPY.host.skip}
          </button>
        </div>
      )}
    </section>
  );
}
