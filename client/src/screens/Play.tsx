import { useEffect, useState } from 'react';
import type { PlayerView } from '../../../shared/types.ts';
import { IS_MOCK, socket, useConnected, useView } from '../socket.ts';
import { AVATARS, COLORS } from '../phone/avatars.ts';
import { COPY } from '../phone/copy.ts';
import { ToastProvider } from '../phone/Toast.tsx';
import { useWakeLock } from '../phone/useWakeLock.ts';
import { Join, type JoinValues } from '../phone/player/Join.tsx';
import { Wait } from '../phone/player/Wait.tsx';
import { Captioning } from '../phone/player/Captioning.tsx';
import { Voting } from '../phone/player/Voting.tsx';
import { Results } from '../phone/player/Results.tsx';
import { Final } from '../phone/player/Final.tsx';
import { Reactions } from '../phone/player/Reactions.tsx';
import { applySavedTheme, useTheme } from '../phone/useTheme.ts';
import '../phone/phone.css';

const KEYS = { token: 'ccp:token', name: 'ccp:name', room: 'ccp:room', avatar: 'ccp:avatar', color: 'ccp:color' };

function store(key: string, value?: string | null): string | null {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode etc. */
  }
  return null;
}

const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

export function Play() {
  // Only on this route (main.tsx imports every screen): last-known theme, no flash.
  useState(applySavedTheme);
  return (
    <ToastProvider>
      <PlayInner />
    </ToastProvider>
  );
}

function PlayInner() {
  const view = useView('player');
  const connected = useConnected();
  useTheme(view?.settings.theme);
  const params = new URLSearchParams(window.location.search);
  const urlRoom = params.get('room')?.toUpperCase() ?? null;
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(IS_MOCK);
  const [busy, setBusy] = useState(false);
  const [kicked, setKicked] = useState(false);

  useWakeLock(joined && !kicked);

  const join = (v: JoinValues, token?: string) => {
    setBusy(true);
    socket.emit(
      'player:join',
      { roomCode: v.room, name: v.name, token, avatar: v.avatar, color: v.color },
      (res) => {
        setBusy(false);
        if (res.ok) {
          store(KEYS.token, res.token);
          store(KEYS.name, v.name);
          store(KEYS.room, v.room.toUpperCase());
          store(KEYS.avatar, v.avatar);
          store(KEYS.color, v.color);
          setJoined(true);
          setKicked(false);
          setError(null);
        } else {
          if (token) store(KEYS.token, null); // stale token: fall back to the join form
          setJoined(false);
          setError(res.error);
        }
      },
    );
  };

  const saved = (): JoinValues => ({
    room: urlRoom ?? store(KEYS.room) ?? '',
    name: store(KEYS.name) ?? '',
    avatar: store(KEYS.avatar) ?? pick(AVATARS),
    color: store(KEYS.color) ?? pick(COLORS),
  });
  const [initial] = useState(saved);

  // Auto-rejoin on every (re)connect if we have a token for this room.
  useEffect(() => {
    if (IS_MOCK) return;
    const rejoin = () => {
      const token = store(KEYS.token);
      const savedRoom = store(KEYS.room);
      if (token && savedRoom && (!urlRoom || urlRoom === savedRoom)) {
        join({ ...saved(), room: savedRoom }, token);
      }
    };
    if (socket.connected) rejoin();
    socket.on('connect', rejoin);
    const onKicked = () => {
      store(KEYS.token, null);
      setJoined(false);
      setKicked(true);
    };
    socket.on('kicked', onKicked);
    return () => {
      socket.off('connect', rejoin);
      socket.off('kicked', onKicked);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (kicked) {
    return (
      <main className="phone ph-center">
        <div className="ph-big-emoji">👋</div>
        <h2 className="ph-title">{COPY.join.kicked}</h2>
        <button className="ph-btn ph-btn--ghost" onClick={() => setKicked(false)}>
          {COPY.join.submit}
        </button>
      </main>
    );
  }

  if (!joined || !view) {
    return (
      <main className="phone">
        <Join initial={initial} connected={connected} busy={busy} error={error} onJoin={(v) => join(v)} />
      </main>
    );
  }

  return (
    <main className={`phone phone--${view.phase.toLowerCase()}`}>
      {!connected && !IS_MOCK && <div className="ph-banner">{COPY.reconnecting}</div>}
      <PhaseScreen view={view} />
      {(view.phase === 'PHOTO_REVEAL' || view.phase === 'RESULTS' || view.phase === 'SCOREBOARD') && <Reactions />}
    </main>
  );
}

function PhaseScreen({ view }: { view: PlayerView }) {
  switch (view.phase) {
    case 'LOBBY':
    case 'PHOTO_REVEAL':
      return <Wait view={view} />;
    case 'CAPTIONING':
      return <Captioning view={view} />;
    case 'VOTING':
      return <Voting view={view} />;
    case 'RESULTS':
    case 'SCOREBOARD':
      return <Results view={view} />;
    case 'FINAL':
      return <Final view={view} />;
  }
}
