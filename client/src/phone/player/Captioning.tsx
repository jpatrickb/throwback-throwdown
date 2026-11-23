import { useEffect, useState } from 'react';
import type { PlayerView } from '../../../../shared/types.ts';
import { useCountdown } from '../../socket.ts';
import { Countdown } from '../Countdown.tsx';
import { COPY } from '../copy.ts';
import { sendCaption } from '../emit.ts';
import { useToast } from '../Toast.tsx';

export function Captioning({ view }: { view: PlayerView }) {
  const toast = useToast();
  const max = view.settings.maxCaptionLength;
  const roundIdx = view.round?.index ?? -1;
  // localSubmitted covers mock mode and the gap before the server's next view.
  const [localSubmitted, setLocalSubmitted] = useState<string | null>(null);
  const [draft, setDraft] = useState(view.myCaption ?? '');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const left = useCountdown(view.deadline, view.serverNow);
  const timeUp = left === 0;

  useEffect(() => {
    setLocalSubmitted(null);
    setEditing(false);
    setDraft('');
  }, [roundIdx]);

  const submitted = view.myCaption ?? localSubmitted;
  const showForm = !submitted || editing;

  const submit = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    const r = await sendCaption(text);
    setBusy(false);
    if (r.ok) {
      setLocalSubmitted(text);
      setEditing(false);
      navigator.vibrate?.(30);
    } else toast(r.error);
  };

  const total = view.players.filter((p) => p.connected).length;
  const done = view.round?.submittedPlayerIds.length ?? 0;

  return (
    <section className="ph-stack">
      <div className="ph-topbar">
        {view.round && <img className="ph-thumb" src={view.round.photo.url} alt="This round's photo" />}
        <div className="ph-topbar__text">
          <strong>{COPY.caption.prompt}</strong>
          <span className="ph-muted">{COPY.caption.waiting(done, total)}</span>
        </div>
        <Countdown deadline={view.deadline} serverNow={view.serverNow} />
      </div>

      {timeUp && !submitted ? (
        <div className="ph-card ph-center-text">
          <h2 className="ph-title">{COPY.caption.timesUp}</h2>
          <p className="ph-sub">{COPY.caption.missed}</p>
        </div>
      ) : showForm ? (
        <form
          className="ph-card ph-caption-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <textarea
            className="ph-textarea"
            value={draft}
            maxLength={max}
            onChange={(e) => setDraft(e.target.value.replace(/\n/g, ' '))}
            placeholder={COPY.caption.placeholder}
            rows={3}
            autoFocus
            disabled={timeUp}
            enterKeyHint="send"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
          />
          <div className="ph-caption-form__row">
            <span className={`ph-count${draft.length >= max - 10 ? ' ph-count--warn' : ''}`}>
              {draft.length}/{max}
            </span>
            <button
              type="submit"
              className="ph-btn ph-btn--primary"
              disabled={!draft.trim() || busy || timeUp}
            >
              {submitted ? COPY.caption.update : COPY.caption.submit}
            </button>
          </div>
        </form>
      ) : (
        <div className="ph-card ph-submitted">
          <div className="ph-submitted__check">{COPY.caption.submitted}</div>
          <p className="ph-quote">“{submitted}”</p>
          {!timeUp && (
            <button
              className="ph-btn ph-btn--ghost"
              onClick={() => {
                setDraft(submitted ?? '');
                setEditing(true);
              }}
            >
              {COPY.caption.edit}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
