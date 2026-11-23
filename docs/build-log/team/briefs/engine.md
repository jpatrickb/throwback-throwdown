# Brief: engine

Read `docs/team/briefs/common.md` first.

**You own:** `server/**` (index.ts, views.ts, new engine.ts, engine.test.ts, persist.ts, photos.ts),
`scripts/bots.ts`. Port 3100 (`PORT=3100 npx tsx watch server/index.ts`).
You're on the **critical path**: phones and TV need a real game loop by Wednesday. Today if possible.

## Deliverables, in order
1. **`server/engine.ts`: a pure reducer** `apply(state, event, now) => { state, error? }` (no I/O, no timers).
   Events: `caption {playerId,text}`, `vote {playerId,captionId}`, `host {action: HostAction}`,
   `timeout` (the deadline passed), plus join/leave if useful. Implement the state machine
   from PLAN.md §2 exactly:
   - `start`: LOBBY→PHOTO_REVEAL using the next unused photo (error "Add a photo first" if none). Creates a Round.
   - `next`: PHOTO_REVEAL→CAPTIONING (deadline = now + captionSeconds) → VOTING (deadline = now + voteSeconds)
     → RESULTS (apply scores to players exactly once) → SCOREBOARD → next round if unused photos remain, else FINAL.
   - Auto-advance: CAPTIONING→VOTING when every *connected* player has submitted, or on timeout.
     VOTING→RESULTS when every eligible connected voter has voted, or on timeout.
     Fewer than 2 visible captions skips VOTING and goes straight to RESULTS ("tough crowd").
   - Captions: trimmed, max `settings.maxCaptionLength`, editable until the phase ends, one per player.
   - Votes: can't vote for your own caption or a hidden one, can change until the phase ends.
   - Scoring: `POINTS_PER_VOTE` per vote, `SWEEP_BONUS` if ≥2 voters and all chose you. Move `scoreRound`
     into engine.ts and have views.ts import it.
   - All the other HostActions: nextRound, end, reset (scores to 0, rounds cleared, photos marked unused, players kept),
     addTime, revealSubject, hideCaption, kick, rename, adjustScore, reorderPhotos, setSubject, removePhoto,
     updateSettings (clamp to sane ranges).
   - Late joiners work in any phase.
2. **`server/engine.test.ts`** (vitest, `npm test`): every transition, auto-advance, scoring + sweep + ties,
   self-vote blocked, hidden caption excluded, <2 captions skip, reset, late join.
3. **Wire into `server/index.ts`:** caption/vote/host handlers go through the engine. One server-side timer
   is armed for `state.deadline` and dispatches `timeout`; re-arm on every change. Broadcast after every change.
   **Validate every payload's shape** (the server is public via the tunnel). Rate-limit `player:react`
   and forward reactions to TV sockets only. Implement `player:setAvatar` and the avatar/color fields on join.
4. **Photos (`server/photos.ts`):** `POST /api/photos` (multer, field `photos`, multiple files, header
   `x-host-pin`, image/* only, ≤15MB each), saved to `data/photos/<id>.<ext>` and appended to the queue.
   On boot, scan `data/photos/` for files not yet in the queue and add them sorted by filename, so Patrick can
   drop photos into the folder. Optional subject from the filename: `03 - Cousin Jake.jpg` → "Cousin Jake".
   Reuse the PIN check + rate limiting already in index.ts (extract it to one helper).
5. **Persistence (`server/persist.ts`):** after every change, write state + player tokens to `data/state.json`
   (atomic write: tmp file, then rename). Restore on boot, **keeping the same room code**, so phones reconnect
   after a restart. `RESET_STATE=1` starts fresh.
6. **Bots:** extend `scripts/bots.ts` so `npm run bots -- <ROOM> 8 http://localhost:3100` plays full games.
   Add `--host <PIN>` mode that also drives the host (start, next...) for a hands-free full game. Use it to prove
   a 3-round game runs end to end.

When 1–3 work, **message `phones` and `tv` (and the lead)** that the real loop is live on port 3100.
Note anything you think the contract needs, and send exact proposed diffs to the lead rather than editing `shared/types.ts`.
