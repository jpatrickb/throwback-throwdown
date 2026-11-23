import { useState } from 'react';
import type { HostView, Player, TeamView } from '../../../../shared/types.ts';
import { Avatar } from '../Avatar.tsx';
import { COPY } from '../copy.ts';
import { isTeamMode, teamById } from '../teams.ts';
import { useAct } from './useAct.ts';

export function Players({ view }: { view: HostView }) {
  const teamMode = isTeamMode(view);
  if (view.players.length === 0) return <p className="ph-muted">{COPY.host.noPlayers}</p>;
  return (
    <ul className="ph-list">
      {view.players.map((p) => (
        <PlayerRow key={p.id} p={p} team={teamMode ? teamById(view.teams, p.teamId) : null} teamMode={teamMode} />
      ))}
    </ul>
  );
}

function PlayerRow({ p, team, teamMode }: { p: Player; team: TeamView | null; teamMode: boolean }) {
  const act = useAct();
  const [mode, setMode] = useState<'idle' | 'rename' | 'kick'>('idle');
  const [name, setName] = useState(p.name);

  return (
    <li className="ph-list__item ph-player">
      <span className={`ph-dot${p.connected ? ' is-on' : ''}`} aria-label={p.connected ? 'connected' : 'offline'} />
      <Avatar player={p} size={32} />
      {mode === 'rename' ? (
        <form
          className="ph-inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (name.trim() && (await act({ type: 'rename', playerId: p.id, name: name.trim() }))) setMode('idle');
          }}
        >
          <input className="ph-input ph-input--small" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} autoFocus />
          <button className="ph-btn ph-btn--small ph-btn--primary" type="submit">✓</button>
          <button className="ph-btn ph-btn--small ph-btn--ghost" type="button" onClick={() => setMode('idle')}>✕</button>
        </form>
      ) : (
        <>
          <div className="ph-list__main">
            <button className="ph-linklike" onClick={() => { setName(p.name); setMode('rename'); }} title={COPY.host.rename}>
              {p.name} ✎
            </button>
            {teamMode ? (
              <span className="ph-muted ph-team-tag" style={{ ['--team' as string]: team?.color ?? 'transparent' }}>
                {team?.name ?? '—'}
              </span>
            ) : (
              <span className="ph-muted">{p.score} pts</span>
            )}
          </div>
          <div className="ph-player__actions">
            {/* Individual scores only matter in solo mode; team points come from votes. */}
            {!teamMode && (
              <>
                <button className="ph-btn ph-btn--small ph-btn--ghost" onClick={() => act({ type: 'adjustScore', playerId: p.id, delta: -100 })}>−100</button>
                <button className="ph-btn ph-btn--small ph-btn--ghost" onClick={() => act({ type: 'adjustScore', playerId: p.id, delta: 100 })}>+100</button>
              </>
            )}
            {mode === 'kick' ? (
              <span className="ph-confirm">
                {COPY.host.kickConfirm}
                <button className="ph-btn ph-btn--small ph-btn--danger" onClick={() => act({ type: 'kick', playerId: p.id }).then(() => setMode('idle'))}>
                  {COPY.host.yes}
                </button>
                <button className="ph-btn ph-btn--small ph-btn--ghost" onClick={() => setMode('idle')}>{COPY.host.no}</button>
              </span>
            ) : (
              <button className="ph-btn ph-btn--small ph-btn--danger" onClick={() => setMode('kick')}>{COPY.host.kick}</button>
            )}
          </div>
        </>
      )}
    </li>
  );
}
