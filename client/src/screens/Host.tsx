import { useEffect, useState, type FormEvent } from 'react';
import type { HostAction } from '../../../shared/types.ts';
import { socket, useView } from '../socket.ts';

const PIN_KEY = 'ccp:hostpin';

// Placeholder host screen: PIN gate + player list + kick. Phase controls and
// photo queue come with the engine workstream.
export function Host() {
  const view = useView('host');
  const [pin, setPin] = useState(() => sessionStorage.getItem(PIN_KEY) ?? '');
  const [error, setError] = useState<string | null>(null);

  const auth = (p: string) =>
    socket.emit('host:auth', { pin: p }, (res) => {
      if (res.ok) {
        sessionStorage.setItem(PIN_KEY, p);
        setError(null);
      } else setError(res.error);
    });

  useEffect(() => {
    const reauth = () => {
      const saved = sessionStorage.getItem(PIN_KEY);
      if (saved) auth(saved);
    };
    if (socket.connected) reauth();
    socket.on('connect', reauth);
    return () => {
      socket.off('connect', reauth);
    };
  }, []);

  const act = (a: HostAction) =>
    socket.emit('host:action', a, (res) => {
      if (!res.ok) setError(res.error);
    });

  if (!view) {
    return (
      <main className="play">
        <h1>Host controls</h1>
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            auth(pin);
          }}
          className="join-form"
        >
          <label>
            Host PIN
            <input value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" required />
          </label>
          <button type="submit">Enter</button>
          {error && <p className="error">{error}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="play">
      <h1>Host · Room {view.roomCode}</h1>
      <p>Phase: {view.phase}</p>
      {error && <p className="error">{error}</p>}
      <h2>Players ({view.players.length})</h2>
      <ul className="host-players">
        {view.players.map((p) => (
          <li key={p.id}>
            <span className={p.connected ? '' : 'offline'}>{p.name}</span>
            <button onClick={() => act({ type: 'kick', playerId: p.id })}>Kick</button>
          </li>
        ))}
      </ul>
      <button onClick={() => act({ type: 'start' })}>Start game</button>
    </main>
  );
}
