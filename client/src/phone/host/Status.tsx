import { useState } from 'react';
import type { HostView } from '../../../../shared/types.ts';
import { Countdown } from '../Countdown.tsx';
import { COPY } from '../copy.ts';
import { activeTeams, isTeamMode } from '../teams.ts';
import { summarizeNames } from './names.ts';
import { useAct } from './useAct.ts';

/** How many missing names to list before collapsing into "+N more". */
const MISSING_MAX = 6;

/** Live progress for timed phases: who's done, who's missing, clock controls. */
export function Status({ view }: { view: HostView }) {
  const act = useAct();
  const timed = view.phase === 'CAPTIONING' || view.phase === 'VOTING';
  const round = view.round;
  if (!round) return null;

  // Team mode CAPTIONING counts teams (one caption each); everything else counts players.
  const byTeam = isTeamMode(view) && view.phase === 'CAPTIONING';
  const units: { id: string; name: string }[] = byTeam
    ? activeTeams(view.teams, view.players)
    : view.players.filter((p) => p.connected);
  const doneIds = byTeam ? round.submittedTeamIds : view.phase === 'CAPTIONING' ? round.submittedPlayerIds : round.votedPlayerIds;
  const done = units.filter((u) => doneIds.includes(u.id)).length;
  const missing = units.filter((u) => !doneIds.includes(u.id));
  const total = units.length;

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
              {byTeam
                ? COPY.team.teamsIn(done, total)
                : view.phase === 'CAPTIONING'
                  ? COPY.host.captionsIn(done, total)
                  : COPY.host.votesIn(done, total)}
            </strong>
          )}
        </div>
        {timed && <Countdown deadline={view.deadline} serverNow={view.serverNow} />}
      </div>

      {timed && total > 0 && (
        <div className="ph-progress" aria-hidden>
          <div className="ph-progress__bar" style={{ width: `${(done / total) * 100}%` }} />
        </div>
      )}

      {timed && missing.length > 0 && <Missing names={missing.map((p) => p.name)} />}

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

function Missing({ names }: { names: string[] }) {
  const [all, setAll] = useState(false);
  const { shown, more } = summarizeNames(names, all ? Infinity : MISSING_MAX);
  return (
    <p className="ph-missing">
      <span className="ph-muted">{COPY.host.missing}: </span>
      {shown.join(', ')}
      {more > 0 && (
        <button className="ph-missing__more" onClick={() => setAll(true)}>
          {COPY.host.more(more)}
        </button>
      )}
      {all && names.length > MISSING_MAX && (
        <button className="ph-missing__more" onClick={() => setAll(false)}>
          {COPY.host.less}
        </button>
      )}
    </p>
  );
}
