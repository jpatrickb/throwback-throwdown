import { useEffect } from 'react';
import { socket, useView } from '../socket.ts';

// Placeholder TV screen. The graphics workstream replaces the visuals;
// keep the data wiring (useView('tv')).
export function Tv() {
  const view = useView('tv');

  useEffect(() => {
    const hello = () => socket.emit('tv:hello');
    if (socket.connected) hello();
    socket.on('connect', hello); // re-register after reconnects
    return () => {
      socket.off('connect', hello);
    };
  }, []);

  if (!view) return <main className="tv center">Connecting…</main>;

  return (
    <main className="tv">
      <h1>Cousin Caption Party</h1>
      {view.phase === 'LOBBY' ? (
        <section className="lobby">
          <div>
            <img src={view.joinQrDataUrl} alt="Join QR code" className="qr" />
            <p className="join-url">{view.joinUrl.replace(/\?.*$/, '')}</p>
            {view.lanJoinUrl && <p className="small">No internet? {view.lanJoinUrl}</p>}
          </div>
          <div>
            <p>Room code</p>
            <p className="room-code">{view.roomCode}</p>
            <p>{view.players.length} joined</p>
            <ul className="players">
              {view.players.map((p) => (
                <li key={p.id} className={p.connected ? '' : 'offline'}>
                  {p.name}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : (
        <p>Phase: {view.phase} (TV screens for this phase coming soon)</p>
      )}
    </main>
  );
}
