import { useEffect, useState } from 'react';
import type { HostView } from '../../../../shared/types.ts';
import { COPY } from '../copy.ts';
import { useToast } from '../Toast.tsx';
import { useAct } from './useAct.ts';

export function Settings({ view }: { view: HostView }) {
  const act = useAct();
  const toast = useToast();
  const [cap, setCap] = useState(String(view.settings.captionSeconds));
  const [vote, setVote] = useState(String(view.settings.voteSeconds));
  useEffect(() => {
    setCap(String(view.settings.captionSeconds));
    setVote(String(view.settings.voteSeconds));
  }, [view.settings.captionSeconds, view.settings.voteSeconds]);

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
    </form>
  );
}
