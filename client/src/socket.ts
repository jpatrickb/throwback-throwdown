import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents, View } from '../../shared/types.ts';
import { mockFromUrl } from './dev/fixtures.ts';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// One shared connection per page. Same origin in prod; Vite proxies in dev.
export const socket: GameSocket = io({ transports: ['websocket', 'polling'] });

/** True when the page was opened with ?mock=<PHASE> (see dev/fixtures.ts). */
export const IS_MOCK = new URLSearchParams(window.location.search).has('mock');

/** Latest view snapshot from the server, narrowed to the expected role.
 *  With ?mock=<PHASE> it returns a fixture instead (no server needed). */
export function useView<R extends View['role']>(role: R): Extract<View, { role: R }> | null {
  const [view, setView] = useState<Extract<View, { role: R }> | null>(
    () => mockFromUrl(role) as Extract<View, { role: R }> | null,
  );
  useEffect(() => {
    if (IS_MOCK) return;
    const onView = (v: View) => {
      if (v.role === role) setView(v as Extract<View, { role: R }>);
    };
    socket.on('view', onView);
    return () => {
      socket.off('view', onView);
    };
  }, [role]);
  return view;
}

export function useConnected(): boolean {
  const [connected, setConnected] = useState(socket.connected);
  useEffect(() => {
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    socket.on('connect', on);
    socket.on('disconnect', off);
    // Catch a connect that fired before this effect subscribed (WebKit/iPhone hits this).
    setConnected(socket.connected);
    return () => {
      socket.off('connect', on);
      socket.off('disconnect', off);
    };
  }, []);
  return connected;
}

/** Seconds left until a server deadline, corrected for clock skew. */
export function useCountdown(deadline: number | null, serverNow: number): number | null {
  const [skew] = useState(() => serverNow - Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [deadline]);
  if (!deadline) return null;
  return Math.max(0, Math.ceil((deadline - (now + skew)) / 1000));
}
