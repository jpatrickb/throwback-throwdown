import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { HostView } from '../../../shared/types.ts';
import { IS_MOCK, socket, useConnected, useView } from '../socket.ts';
import { COPY } from '../phone/copy.ts';
import { ToastProvider } from '../phone/Toast.tsx';
import { useWakeLock } from '../phone/useWakeLock.ts';
import { primaryFor } from '../phone/host/primary.ts';
import { useAct } from '../phone/host/useAct.ts';
import { Status } from '../phone/host/Status.tsx';
import { PhotoQueue } from '../phone/host/PhotoQueue.tsx';
import { Moderation } from '../phone/host/Moderation.tsx';
import { Players } from '../phone/host/Players.tsx';
import { Settings } from '../phone/host/Settings.tsx';
import '../phone/phone.css';

const PIN_KEY = 'ccp:hostpin';

function readPin(): string {
  try {
    return sessionStorage.getItem(PIN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function Host() {
  return (
    <ToastProvider>
      <HostInner />
    </ToastProvider>
  );
}

function HostInner() {
  const view = useView('host');
  const connected = useConnected();
  const [pin, setPin] = useState(readPin);
  const [error, setError] = useState<string | null>(null);

  useWakeLock(!!view);

  const auth = (p: string) =>
    socket.emit('host:auth', { pin: p }, (res) => {
      if (res.ok) {
        try {
          sessionStorage.setItem(PIN_KEY, p);
        } catch {
          /* ignore */
        }
        setError(null);
      } else setError(res.error);
    });

  useEffect(() => {
    if (IS_MOCK) return;
    const reauth = () => {
      const saved = readPin();
      if (saved) auth(saved);
    };
    if (socket.connected) reauth();
    socket.on('connect', reauth);
    return () => {
      socket.off('connect', reauth);
    };
  }, []);

  if (!view) {
    return (
      <main className="phone ph-host">
        <form
          className="ph-join"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            auth(pin);
          }}
        >
          <header className="ph-join__brand">
            <div className="ph-big-emoji">🎬</div>
            <h1 className="ph-logo">{COPY.host.title}</h1>
          </header>
          <label className="ph-field">
            <span>{COPY.host.pin}</span>
            <input
              className="ph-input ph-input--code"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
            />
          </label>
          {error && <p className="ph-error">{error}</p>}
          <button type="submit" className="ph-btn ph-btn--primary ph-btn--big" disabled={!connected || !pin}>
            {connected ? COPY.host.enter : COPY.join.connecting}
          </button>
        </form>
      </main>
    );
  }

  return <HostPanel view={view} pin={pin} connected={connected} />;
}

function HostPanel({ view, pin, connected }: { view: HostView; pin: string; connected: boolean }) {
  const act = useAct();
  const step = primaryFor(view);
  const [busy, setBusy] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const moderating = view.phase === 'CAPTIONING' || view.phase === 'VOTING';
  const unused = view.photos.filter((p) => !p.used).length;

  useEffect(() => setConfirmEnd(false), [view.phase]);

  // Guard against double taps skipping a phase: lock until the ack and at least 1s.
  const go = async () => {
    if (busy) return;
    setBusy(true);
    await Promise.all([act(step.action), new Promise((r) => setTimeout(r, 1000))]);
    setBusy(false);
  };

  return (
    <main className={`phone ph-host phone--${view.phase.toLowerCase()}`}>
      {!connected && !IS_MOCK && <div className="ph-banner">{COPY.reconnecting}</div>}
      <header className="ph-host__bar">
        <span className="ph-chip">Room {view.roomCode}</span>
        <span className="ph-chip ph-chip--phase">{view.phase.replace('_', ' ').toLowerCase()}</span>
        <span className="ph-muted">
          {view.players.filter((p) => p.connected).length} playing · {unused} photos left
        </span>
      </header>

      <button className="ph-btn ph-btn--primary ph-btn--giant" disabled={busy} onClick={go}>
        {step.label}
      </button>

      {view.phase !== 'LOBBY' && view.phase !== 'FINAL' && (
        <div className="ph-btn-row ph-btn-row--end">
          {confirmEnd ? (
            <span className="ph-confirm">
              End the whole game?
              <button className="ph-btn ph-btn--small ph-btn--danger" onClick={() => act({ type: 'end' })}>{COPY.host.yes}</button>
              <button className="ph-btn ph-btn--small ph-btn--ghost" onClick={() => setConfirmEnd(false)}>{COPY.host.no}</button>
            </span>
          ) : (
            <button className="ph-btn ph-btn--small ph-btn--ghost" onClick={() => setConfirmEnd(true)}>{COPY.host.endNow}</button>
          )}
        </div>
      )}

      <Status view={view} />

      {moderating && (
        <Section title={`${COPY.host.moderation} (${view.allCaptions?.length ?? 0})`} defaultOpen>
          <Moderation view={view} />
        </Section>
      )}
      <Section title={`${COPY.host.players} (${view.players.length})`} defaultOpen={view.phase === 'LOBBY'}>
        <Players view={view} />
      </Section>
      <Section title={`${COPY.host.photos} (${view.photos.length})`} defaultOpen={view.phase === 'LOBBY'}>
        <PhotoQueue view={view} pin={pin} />
      </Section>
      <Section title={COPY.host.settings}>
        <Settings view={view} />
      </Section>
    </main>
  );
}

function Section({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`ph-section${open ? ' is-open' : ''}`}>
      <button className="ph-section__head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{title}</span>
        <span aria-hidden>{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="ph-section__body">{children}</div>}
    </section>
  );
}
