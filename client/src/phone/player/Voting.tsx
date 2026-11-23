import { useEffect, useState } from 'react';
import type { PlayerView } from '../../../../shared/types.ts';
import { useCountdown } from '../../socket.ts';
import { Countdown } from '../Countdown.tsx';
import { COPY } from '../copy.ts';
import { sendVote } from '../emit.ts';
import { useToast } from '../Toast.tsx';

export function Voting({ view }: { view: PlayerView }) {
  const toast = useToast();
  const captions = view.round?.captions ?? [];
  const roundIdx = view.round?.index ?? -1;
  const [pending, setPending] = useState<string | null>(null);
  const [local, setLocal] = useState<string | null>(null);
  const left = useCountdown(view.deadline, view.serverNow);
  const timeUp = left === 0;

  useEffect(() => setLocal(null), [roundIdx]);

  const chosen = local ?? view.myVoteCaptionId;
  const votable = captions.filter((c) => c.id !== view.myCaptionId);

  const vote = async (id: string) => {
    if (id === view.myCaptionId || timeUp || pending || id === chosen) return;
    setPending(id);
    const r = await sendVote(id);
    setPending(null);
    if (r.ok) {
      setLocal(id);
      navigator.vibrate?.(30);
    } else toast(r.error);
  };

  return (
    <section className="ph-stack">
      <div className="ph-topbar">
        <div className="ph-topbar__text">
          <strong>{COPY.vote.prompt}</strong>
          <span className="ph-muted">{chosen ? COPY.vote.change : ' '}</span>
        </div>
        <Countdown deadline={view.deadline} serverNow={view.serverNow} />
      </div>

      {captions.length === 0 && <p className="ph-sub ph-center-text">{COPY.vote.none}</p>}
      {captions.length > 0 && votable.length === 0 && (
        <p className="ph-sub ph-center-text">{COPY.vote.noVoteForYou}</p>
      )}

      <ul className="ph-votes">
        {captions.map((c) => {
          const mine = c.id === view.myCaptionId;
          const on = c.id === chosen;
          return (
            <li key={c.id}>
              <button
                className={`ph-vote${on ? ' is-on' : ''}${mine ? ' is-mine' : ''}${pending === c.id ? ' is-pending' : ''}`}
                disabled={mine || timeUp}
                aria-pressed={on}
                onClick={() => vote(c.id)}
              >
                <span className="ph-vote__text">{c.text}</span>
                {mine && <span className="ph-vote__tag">{COPY.vote.yours}</span>}
                {on && <span className="ph-vote__tag ph-vote__tag--on">✓</span>}
              </button>
            </li>
          );
        })}
      </ul>

      {chosen && <div className="ph-locked">{COPY.vote.locked}</div>}
    </section>
  );
}
