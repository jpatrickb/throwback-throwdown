import { useEffect, useState } from 'react';
import type { HostView } from '../../../../shared/types.ts';
import { COPY } from '../copy.ts';
import { useToast } from '../Toast.tsx';
import { useAct } from './useAct.ts';

// Matches the contract comment on Settings.teamCount (2..8) and TEAM_PRESETS length.
const TEAM_MIN = 2;
const TEAM_MAX = 8;

export function Settings({ view }: { view: HostView }) {
  const act = useAct();
  const toast = useToast();
  const [cap, setCap] = useState(String(view.settings.captionSeconds));
  const [vote, setVote] = useState(String(view.settings.voteSeconds));
  useEffect(() => {
    setCap(String(view.settings.captionSeconds));
    setVote(String(view.settings.voteSeconds));
  }, [view.settings.captionSeconds, view.settings.voteSeconds]);

  const lobby = view.phase === 'LOBBY';
  const count = view.settings.teamCount;
  const setCount = (teamCount: number) => act({ type: 'updateSettings', settings: { teamCount } });

  return (
    <form
      className="ph-settings"
      onSubmit={async (e) => {
        e.preventDefault();
        const captionSeconds = Number(cap);
        const voteSeconds = Number(vote);
        if (!(captionSeconds >= 10 && voteSeconds >= 10)) return toast('Use at least 10 seconds.');
        if (await act({ type: 'updateSettings', settings: { captionSeconds, voteSeconds } })) toast('Saved', 'info');
      }}
    >
      <label className="ph-field ph-field--row">
        <span>{COPY.host.captionSeconds}</span>
        <input className="ph-input ph-input--small" inputMode="numeric" type="number" min={10} max={600} value={cap} onChange={(e) => setCap(e.target.value)} />
      </label>
      <label className="ph-field ph-field--row">
        <span>{COPY.host.voteSeconds}</span>
        <input className="ph-input ph-input--small" inputMode="numeric" type="number" min={10} max={600} value={vote} onChange={(e) => setVote(e.target.value)} />
      </label>
      <button className="ph-btn ph-btn--ghost" type="submit">{COPY.host.save}</button>

      {/* Team settings apply instantly (they rebuild teams), lobby only. */}
      <div className="ph-settings__teams">
        <label className="ph-field ph-field--row ph-toggle">
          <span>{COPY.host.teamMode}</span>
          <input
            type="checkbox"
            role="switch"
            checked={view.settings.teamMode}
            disabled={!lobby}
            onChange={(e) => act({ type: 'updateSettings', settings: { teamMode: e.target.checked } })}
          />
        </label>
        {view.settings.teamMode && (
          <div className="ph-field ph-field--row">
            <span>{COPY.host.teamCount}</span>
            <div className="ph-stepper">
              <button type="button" className="ph-btn ph-btn--small ph-btn--ghost" disabled={!lobby || count <= TEAM_MIN} onClick={() => setCount(count - 1)} aria-label="Fewer teams">−</button>
              <span className="ph-stepper__value">{count}</span>
              <button type="button" className="ph-btn ph-btn--small ph-btn--ghost" disabled={!lobby || count >= TEAM_MAX} onClick={() => setCount(count + 1)} aria-label="More teams">+</button>
            </div>
          </div>
        )}
        {!lobby && <p className="ph-muted">{COPY.host.lobbyOnly}</p>}
      </div>
    </form>
  );
}
