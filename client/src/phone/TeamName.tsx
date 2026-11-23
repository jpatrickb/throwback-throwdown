import { useEffect, useState } from 'react';
import type { TeamView } from '../../../shared/types.ts';
import { COPY } from './copy.ts';
import { TEAM_NAME_MAX } from './teams.ts';

/** Team name with an inline ✎ rename. `onRename` resolves true on success. */
export function TeamName({
  team,
  onRename,
  className = '',
}: {
  team: Pick<TeamView, 'name' | 'color'>;
  onRename: (name: string) => Promise<boolean>;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(team.name);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!editing) setName(team.name);
  }, [team.name, editing]);

  if (!editing) {
    return (
      <button
        className={`ph-team-name ${className}`}
        onClick={() => setEditing(true)}
        aria-label={`${COPY.team.rename}: ${team.name}`}
      >
        {team.name} <span className="ph-team-name__pen" aria-hidden>✎</span>
      </button>
    );
  }
  return (
    <form
      className="ph-inline-form ph-team-name-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const n = name.trim();
        if (!n || busy) return;
        if (n === team.name) return setEditing(false);
        setBusy(true);
        const ok = await onRename(n);
        setBusy(false);
        if (ok) setEditing(false);
      }}
    >
      <input
        className="ph-input ph-input--small"
        value={name}
        maxLength={TEAM_NAME_MAX}
        onChange={(e) => setName(e.target.value)}
        aria-label={COPY.team.rename}
        autoFocus
      />
      <button className="ph-btn ph-btn--small ph-btn--primary" type="submit" disabled={busy || !name.trim()}>✓</button>
      <button className="ph-btn ph-btn--small ph-btn--ghost" type="button" onClick={() => setEditing(false)}>✕</button>
    </form>
  );
}
