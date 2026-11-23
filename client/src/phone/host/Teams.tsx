import { useState } from 'react';
import type { HostView, Player, TeamView } from '../../../../shared/types.ts';
import { Avatar } from '../Avatar.tsx';
import { COPY } from '../copy.ts';
import { TeamName } from '../TeamName.tsx';
import { membersOf } from '../teams.ts';
import { useAct } from './useAct.ts';

/** Host team setup: each team with its members, rename, move players, shuffle. */
export function Teams({ view }: { view: HostView }) {
  const act = useAct();
  const [confirm, setConfirm] = useState(false);
  // Shuffling mid-round would scramble who owns which caption; offer it between rounds only.
  const canShuffle = view.phase === 'LOBBY' || view.phase === 'SCOREBOARD' || view.phase === 'FINAL';

  return (
    <div className="ph-stack">
      {canShuffle && (
        <div className="ph-btn-row">
          {confirm ? (
            <span className="ph-confirm">
              {COPY.host.shuffleConfirm}
              <button
                className="ph-btn ph-btn--small ph-btn--danger"
                onClick={() => act({ type: 'shuffleTeams' }).then(() => setConfirm(false))}
              >
                {COPY.host.yes}
              </button>
              <button className="ph-btn ph-btn--small ph-btn--ghost" onClick={() => setConfirm(false)}>{COPY.host.no}</button>
            </span>
          ) : (
            <button className="ph-btn ph-btn--ghost" onClick={() => setConfirm(true)}>🔀 {COPY.host.shuffle}</button>
          )}
        </div>
      )}
      {view.teams.map((t) => (
        <TeamBlock key={t.id} team={t} teams={view.teams} members={membersOf(t, view.players)} />
      ))}
    </div>
  );
}

function TeamBlock({ team, teams, members }: { team: TeamView; teams: TeamView[]; members: Player[] }) {
  const act = useAct();
  return (
    <section className="ph-team-block" style={{ ['--team' as string]: team.color }}>
      <header className="ph-team-block__head">
        <TeamName team={team} onRename={(name) => act({ type: 'renameTeam', teamId: team.id, name })} />
        <span className="ph-team-block__score">{team.score} pts</span>
      </header>
      {members.length === 0 ? (
        <p className="ph-muted ph-team-block__empty">{COPY.host.noMembers}</p>
      ) : (
        <ul className="ph-team-block__members">
          {members.map((p) => (
            <li key={p.id}>
              <span className={`ph-dot${p.connected ? ' is-on' : ''}`} />
              <Avatar player={p} size={26} />
              <span className="ph-team-block__name">{p.name}</span>
              {/* Always shows "Move…"; picking a team moves the player, then it resets. */}
              <select
                className="ph-select"
                value=""
                aria-label={`${COPY.host.moveTo}: ${p.name}`}
                onChange={(e) => e.target.value && act({ type: 'moveToTeam', playerId: p.id, teamId: e.target.value })}
              >
                <option value="" disabled>
                  {COPY.host.move}
                </option>
                {teams
                  .filter((o) => o.id !== team.id)
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      → {o.name}
                    </option>
                  ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
