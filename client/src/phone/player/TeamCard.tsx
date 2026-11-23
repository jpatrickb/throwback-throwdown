import type { PlayerView } from '../../../../shared/types.ts';
import { Avatar } from '../Avatar.tsx';
import { COPY } from '../copy.ts';
import { renameMyTeam } from '../emit.ts';
import { TeamName } from '../TeamName.tsx';
import { membersOf } from '../teams.ts';
import { useToast } from '../Toast.tsx';

/** "You're on <Team>" card: team colour, renameable name, teammates. */
export function TeamCard({ view, compact = false }: { view: PlayerView; compact?: boolean }) {
  const toast = useToast();
  const team = view.myTeam;
  if (!team) return null;
  const members = membersOf(team, view.players);
  const rename = async (name: string) => {
    const r = await renameMyTeam(name);
    if (!r.ok) toast(r.error);
    return r.ok;
  };
  return (
    <section className={`ph-card ph-team${compact ? ' ph-team--compact' : ''}`} style={{ ['--team' as string]: team.color }}>
      <span className="ph-team__label">{COPY.team.youreOn}</span>
      <TeamName team={team} onRename={rename} className="ph-team__name" />
      {!compact && (
        <>
          <span className="ph-muted">{COPY.team.teammates(members.length)}</span>
          <ul className="ph-team__members">
            {members.map((p) => (
              <li key={p.id} className={p.connected ? '' : 'is-off'}>
                <Avatar player={p} size={28} />
                <span>
                  {p.name}
                  {p.id === view.me.id && <em> ({COPY.team.you})</em>}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
