import { useEffect, useState } from 'react';
import type { PlayerView } from '../../../../shared/types.ts';
import { useCountdown } from '../../socket.ts';
import { Countdown } from '../Countdown.tsx';
import { COPY } from '../copy.ts';
import { sendCaption } from '../emit.ts';
import { activeTeams } from '../teams.ts';
import { useToast } from '../Toast.tsx';

export function Captioning({ view }: { view: PlayerView }) {
  const toast = useToast();
  const max = view.settings.maxCaptionLength;
  const roundIdx = view.round?.index ?? -1;
  const team = view.myTeam;
  // localSubmitted covers mock mode and the gap before the server's next view.
  const [localSubmitted, setLocalSubmitted] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const left = useCountdown(view.deadline, view.serverNow);
  const timeUp = left === 0;

  useEffect(() => {
    setLocalSubmitted(null);
    setEditing(false);
    setDraft('');
  }, [roundIdx]);

  // Server truth first: in team mode a teammate may have replaced it since.
  const submitted = view.myCaption ?? localSubmitted;
  const showForm = !submitted || editing;
  const byMe = view.myCaptionEditedBy ? view.myCaptionEditedBy === view.me.name : submitted === localSubmitted;
  const writtenBy = byMe ? COPY.team.writtenByYou : COPY.team.writtenBy(view.myCaptionEditedBy ?? '?');

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

  let progress: string;
  if (team) {
    const teams = activeTeams(view.teams, view.players);
    const done = teams.filter((t) => view.round?.submittedTeamIds.includes(t.id)).length;
    progress = COPY.team.teamsIn(done, teams.length);
  } else {
    progress = COPY.caption.waiting(view.round?.submittedPlayerIds.length ?? 0, view.players.filter((p) => p.connected).length);
  }

  const teamStyle = team ? { ['--team' as string]: team.color } : undefined;

  return (
    <section className="ph-stack">
      <div className="ph-topbar">
        {view.round && <img className="ph-thumb" src={view.round.photo.url} alt="This round's photo" />}
        <div className="ph-topbar__text">
          <strong>{COPY.caption.prompt}</strong>
          <span className="ph-muted">{progress}</span>
        </div>
        <Countdown deadline={view.deadline} serverNow={view.serverNow} />
      </div>

      {team && (
        <div className="ph-team-strip" style={teamStyle}>
          {COPY.team.captionFor(team.name)}
        </div>
      )}

      {timeUp && !submitted ? (
        <div className="ph-card ph-center-text">
          <h2 className="ph-title">{COPY.caption.timesUp}</h2>
          <p className="ph-sub">{team ? COPY.team.noCaption : COPY.caption.missed}</p>
        </div>
      ) : showForm ? (
        <form
          className="ph-card ph-caption-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {team && !submitted && <p className="ph-hint">{COPY.team.none}</p>}
          {team && submitted && (
            <p className="ph-hint">
              “{submitted}” <span className="ph-muted">· {writtenBy}</span>
            </p>
          )}
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
            {editing && (
              <button type="button" className="ph-btn ph-btn--ghost ph-btn--narrow" onClick={() => setEditing(false)}>
                ✕
              </button>
            )}
            <button type="submit" className="ph-btn ph-btn--primary" disabled={!draft.trim() || busy || timeUp}>
              {submitted ? (team ? COPY.team.replace : COPY.caption.update) : COPY.caption.submit}
            </button>
          </div>
        </form>
      ) : (
        <div className="ph-card ph-submitted">
          <div className="ph-submitted__check">{COPY.caption.submitted}</div>
          <p className="ph-quote">“{submitted}”</p>
          {team && <span className="ph-muted">{writtenBy}</span>}
          {!timeUp && (
            <button
              className="ph-btn ph-btn--ghost"
              onClick={() => {
                setDraft(submitted ?? '');
                setEditing(true);
              }}
            >
              {team ? COPY.team.tapToReplace : COPY.caption.edit}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
