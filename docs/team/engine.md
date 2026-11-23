# engine — status

**The real game loop is live on :3100.** Commits `204f8dc` (engine + tests) and `b9bf58b` (server wiring).
Dev instance: room `ENGN`, host PIN `123456`, run with `DATA_DIR=<scratchpad>` so `data/photos/` stays clean.
Point vite at it with `API_PORT=3100`.

(SendMessage to team-lead / phones / tv / cousin-party failed with "Failed to write to inbox", so these notes are here instead.)

## Done
- `server/engine.ts`: pure reducer `apply(state, event, now) => { state, error? }`. Events: join, presence, setAvatar,
  caption, vote, addPhotos, host, timeout. Implements the full PLAN §2 state machine. `scoreRound` lives here, and views.ts re-exports it.
- `server/engine.test.ts`: 38 tests covering transitions, auto-advance, timeout, scoring/sweep/ties, self-vote, hidden captions,
  skipping with <2 captions, reset, late join, kick, rename, photos, settings clamping.
- `server/index.ts`: every intent goes through the engine. One timer is armed for `state.deadline`, and every change re-arms it, persists, and broadcasts.
  Each handler is wrapped so a throw can't crash the server. Max 60 players. Socket payloads are capped at 64KB.
- `server/validate.ts`: shape checks for every socket payload. `server/pin.ts`: one PIN guard (per caller plus global
  lockout) shared by `host:auth` and the upload endpoint.
- `server/photos.ts`: `POST /api/photos` (field `photos`, header `x-host-pin`, JPEG/PNG/WebP/GIF/AVIF, 15MB each, up to 50).
  On boot it scans `data/photos/`, sorted naturally by filename; `03 - Cousin Jake.jpg` sets the subject to "Cousin Jake". HEIC is skipped with a warning.
  Removed photos move to `data/photos/removed/` instead of being deleted.
- `server/persist.ts`: atomic write of state + tokens to `data/state.json` after every change. On restore the room code is kept
  (`ROOM_CODE` env still overrides), every player starts disconnected, and running timers get 20s of grace. `RESET_STATE=1` starts fresh.
- `scripts/bots.ts`: `npm run bots -- <ROOM> 8 http://localhost:3100 [--host PIN] [--fast] [--photos N]`. Host mode uploads
  generated test PNGs if the queue is empty, then runs the whole game and exits at FINAL.
- Verified: a 3-round hands-free game end to end; killing the server mid-CAPTIONING and restarting it, after which the bots rejoined their same slots and the game went on.

## Notes for phones
- Error acks carry a readable `error`. Show it as is.
- After a reconnect, emit `player:join` with the saved token before any caption or vote. Until then the server answers "Join first".
- Upload reply: `{ok, photos}`, or `{ok:false,error}` with 401 for a wrong PIN, 429 when locked out, 400 for a bad file. An optional `subject` field is used for single-file uploads.
- Host errors to expect: removePhoto on a played photo; nextRound with no photos left (use `end`); hideCaption outside
  CAPTIONING/VOTING. `next` in LOBBY acts as start. `end` during VOTING scores the votes cast; during CAPTIONING it drops the round.
- updateSettings clamps: captions 10–600s, voting 5–300s, max caption length 20–200.

## Notes for tv
- `reaction` events go to TV sockets only, rate-limited to 6 per 3s per player.
- Results are sorted by votes desc, then name. Hidden captions are left out. With fewer than 2 visible captions, VOTING is skipped.

## Needs the lead
- `npm test` finds no server tests because `vite.config.ts` has `root: 'client'`. Fix: add `test: { root: '.' }`
  to `defineConfig` (or use `vitest run --root .` in package.json). Until then: `npx vitest run --root .`.
- No `shared/types.ts` changes needed.

## Questions for Patrick
- Can a player vote while they're the cousin in the photo? (Yes for now. Nothing special happens.)
- Should the subject reveal happen automatically at RESULTS? (Right now it's host-only via revealSubject.)
