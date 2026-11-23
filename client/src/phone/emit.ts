// Promise wrappers around socket acks. In mock mode (?mock=) every action is a
// no-op success, so screens can be clicked through without a server.
import type { HostAction } from '../../../shared/types.ts';
import { IS_MOCK, socket } from '../socket.ts';

export type Result = { ok: true } | { ok: false; error: string };

const TIMEOUT_MS = 8000;

function withTimeout(run: (done: (r: Result) => void) => void): Promise<Result> {
  if (IS_MOCK) return Promise.resolve({ ok: true });
  return new Promise((resolve) => {
    let settled = false;
    const done = (r: Result) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };
    setTimeout(() => done({ ok: false, error: 'No answer from the server. Try again.' }), TIMEOUT_MS);
    run(done);
  });
}

export const sendCaption = (text: string) =>
  withTimeout((done) => socket.emit('player:caption', { text }, (r) => done(r.ok ? { ok: true } : r)));

export const sendVote = (captionId: string) =>
  withTimeout((done) => socket.emit('player:vote', { captionId }, (r) => done(r.ok ? { ok: true } : r)));

export const renameMyTeam = (name: string) =>
  withTimeout((done) => socket.emit('player:renameTeam', { name }, (r) => done(r.ok ? { ok: true } : r)));

export const hostAction = (a: HostAction) =>
  withTimeout((done) => socket.emit('host:action', a, (r) => done(r.ok ? { ok: true } : r)));

export function sendReaction(emoji: string) {
  if (!IS_MOCK) socket.emit('player:react', { emoji });
}
