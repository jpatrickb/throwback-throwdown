import { useEffect, useState, type FormEvent } from 'react';
import { socket, useConnected, useView } from '../socket.ts';
import { BRAND } from '../brand.ts';

const TOKEN_KEY = 'ccp:token';
const NAME_KEY = 'ccp:name';
const ROOM_KEY = 'ccp:room';

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

// Placeholder player screen: join + lobby wait. Caption/vote screens come
// with the engine workstream.
export function Play() {
  const view = useView('player');
  const connected = useConnected();
  const params = new URLSearchParams(window.location.search);
  const [room, setRoom] = useState(params.get('room') ?? store(ROOM_KEY) ?? '');
  const [name, setName] = useState(store(NAME_KEY) ?? '');
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  const join = (roomCode: string, playerName: string, token?: string) =>
    new Promise<boolean>((resolve) => {
      socket.emit('player:join', { roomCode, name: playerName, token }, (res) => {
        if (res.ok) {
          store(TOKEN_KEY, res.token);
          store(NAME_KEY, playerName);
          store(ROOM_KEY, roomCode.toUpperCase());
          setJoined(true);
          setError(null);
        } else {
          setError(res.error);
        }
        resolve(res.ok);
      });
    });

  // Auto-rejoin on every (re)connect if we have a token for this room.
  useEffect(() => {
    const rejoin = () => {
      const token = store(TOKEN_KEY);
      const savedRoom = store(ROOM_KEY);
      if (token && savedRoom && (!params.get('room') || params.get('room')!.toUpperCase() === savedRoom)) {
        join(savedRoom, store(NAME_KEY) ?? '', token);
      }
    };
    if (socket.connected) rejoin();
    socket.on('connect', rejoin);
    const onKicked = () => {
      store(TOKEN_KEY, null);
      setJoined(false);
      setError('You were removed by the host.');
    };
    socket.on('kicked', onKicked);
    return () => {
      socket.off('connect', rejoin);
      socket.off('kicked', onKicked);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    join(room, name);
  };

  if (!joined || !view) {
    return (
      <main className="play">
        <h1>{BRAND.name}</h1>
        <form onSubmit={onSubmit} className="join-form">
          <label>
            Room code
            <input
              value={room}
              onChange={(e) => setRoom(e.target.value.toUpperCase())}
              maxLength={4}
              autoCapitalize="characters"
              autoComplete="off"
              required
            />
          </label>
          <label>
            Your name
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={16} required />
          </label>
          <button type="submit" disabled={!connected}>
            {connected ? 'Join' : 'Connecting…'}
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="play center">
      {!connected && <p className="banner">Reconnecting…</p>}
      <h2>You're in, {view.me.name}!</h2>
      <p>{view.phase === 'LOBBY' ? 'Look at the TV. The game starts soon.' : `Phase: ${view.phase}`}</p>
    </main>
  );
}
