import type { HostView } from '../../../../shared/types.ts';
import { COPY } from '../copy.ts';
import { useAct } from './useAct.ts';

export function Moderation({ view }: { view: HostView }) {
  const act = useAct();
  const caps = view.allCaptions ?? [];
  const nameOf = (id: string) => view.players.find((p) => p.id === id)?.name ?? '?';
  const teamOf = (id: string | null) => view.teams.find((t) => t.id === id) ?? null;
  const author = (c: { playerId: string; teamId: string | null }) => {
    const t = teamOf(c.teamId);
    return t ? `${t.name} · ${COPY.team.writtenBy(nameOf(c.playerId))}` : nameOf(c.playerId);
  };
  if (caps.length === 0) return <p className="ph-muted">No captions yet.</p>;
  return (
    <ul className="ph-list">
      {caps.map((c) => (
        <li key={c.id} className={`ph-list__item${c.hidden ? ' is-hidden' : ''}`}>
          <div className="ph-list__main">
            <span className="ph-list__title">“{c.text}”</span>
            <span className="ph-muted">{author(c)}</span>
          </div>
          <button
            className={`ph-btn ph-btn--small ${c.hidden ? 'ph-btn--ghost' : 'ph-btn--danger'}`}
            onClick={() => act({ type: 'hideCaption', captionId: c.id, hidden: !c.hidden })}
          >
            {c.hidden ? COPY.host.unhide : COPY.host.hide}
          </button>
        </li>
      ))}
    </ul>
  );
}
