// Host PIN check, shared by the socket (host:auth) and HTTP (x-host-pin) paths.
// The server is public through the tunnel, so guessing is rate-limited:
//  - per caller (socket id or IP): 5 wrong tries, then that caller is blocked for a minute
//    (sockets are also disconnected by the caller);
//  - globally: 20 wrong tries per minute pauses host login for everyone for a minute.
import { timingSafeEqual } from 'node:crypto';

export const PIN_FAILS_PER_CALLER = 5;
export const PIN_FAILS_GLOBAL = 20;
const WINDOW_MS = 60_000;

export type PinResult = { ok: true } | { ok: false; error: string; tooMany: boolean };

export function createPinGuard(hostPin: string) {
  let globalFails: number[] = [];
  let lockedUntil = 0;
  const callerFails = new Map<string, number[]>();

  return function checkPin(pin: unknown, callerKey: string, now = Date.now()): PinResult {
    if (now < lockedUntil) return { ok: false, error: 'Too many tries. Wait a minute.', tooMany: true };
    const mine = (callerFails.get(callerKey) ?? []).filter((t) => now - t < WINDOW_MS);
    if (mine.length >= PIN_FAILS_PER_CALLER) return { ok: false, error: 'Too many tries. Wait a minute.', tooMany: true };

    const given = typeof pin === 'string' ? pin.trim() : '';
    const ok = given.length === hostPin.length && timingSafeEqual(Buffer.from(given), Buffer.from(hostPin));
    if (ok) return { ok: true };

    mine.push(now);
    callerFails.set(callerKey, mine);
    if (callerFails.size > 5000) callerFails.clear(); // don't grow without bound under a flood
    globalFails = [...globalFails.filter((t) => now - t < WINDOW_MS), now];
    if (globalFails.length >= PIN_FAILS_GLOBAL) {
      lockedUntil = now + WINDOW_MS;
      console.warn('⚠️  Host PIN locked for 60s after repeated failures');
    }
    return { ok: false, error: 'Wrong PIN', tooMany: mine.length >= PIN_FAILS_PER_CALLER };
  };
}
