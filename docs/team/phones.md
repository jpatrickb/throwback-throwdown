# phones: status

## Done
- **Player phone (`/play`)**: join (room from `?room=`, name, avatar emoji + color picker sent on join, remembered in localStorage, auto-rejoin with token), lobby wait with bouncing avatar, PHOTO_REVEAL "Look at the TV", CAPTIONING (polaroid thumb, live char count against `settings.maxCaptionLength`, countdown, Submitted ✓ with Edit until time's up, Enter submits), VOTING (big tilted tap cards, own caption disabled "yours", tap to select/change, locked-in state), RESULTS/SCOREBOARD (your caption, votes, points, who you voted for, rank with ties, total, confetti if you won), FINAL (rank, confetti for top 3), reconnecting banner, kicked screen, Screen Wake Lock, reaction bar (😂🔥👏😱💀, throttled 700ms) on reveal/results/scoreboard.
- **Host (`/host`)**: PIN gate; one giant phase button (Start game → Start captions → Start voting → Show results → Scoreboard → Next photo / Final results → New game) with a 1s double-tap guard; "End game now" with inline confirm; live status (N of M written/voted, who's missing, countdown, +30s, Skip); collapsible sections for captions moderation (hide/unhide), players (connected dot, tap name to rename, ±100 score, kick with inline "Kick? Yes/No"), photo queue (thumbs, ↑/↓, used badge, remove with inline confirm, upload), settings (caption/vote seconds).
- **Upload**: `accept="image/*" multiple`, each file decoded (EXIF-aware `createImageBitmap`), resized to ≤1920px JPEG 0.85 on a canvas, POSTed one at a time as field `photos` with `x-host-pin`, progress bar + per-file error toasts.
- Errors are toasts (`phone/Toast.tsx`), actions time out after 8s with a toast; mock mode skips join/PIN and actions are no-ops.
- Unit tests: `client/src/phone/phone.test.ts` (phase button mapping, resize math, rank ties).

- **Big rooms (25 players)**: voting has a sticky header (prompt + countdown), compact cards above 8 captions, and a sticky footer showing your locked-in pick. Host "Waiting on" lists 6 names then "+N more" (tap to expand), with a progress bar. Check any screen with `&mockcount=25` (dev-only, `phone/devMock.ts`).

## Where to change things
- All phone copy: `client/src/phone/copy.ts`. Avatar emoji/colors and reaction emoji: `client/src/phone/avatars.ts`.
- Styles: `client/src/phone/phone.css`, built on tv's `theme/tokens.css`.
- Phase → button mapping: `client/src/phone/host/primary.ts`.

## Next / polish ideas
- Optimistic reorder in photo queue; drag to reorder.
- Haptics already on submit/vote (`navigator.vibrate`, Android only).

## Decisions from Patrick
- **No "who is in the photo" names (Nov 23).** The Reveal button and subject-name field are gone from the host UI. The contract and engine are unchanged: `subject` stays null, and `revealSubject`/`setSubject` are simply never sent.
- Score adjust stays at ±100 buttons.
- Reactions stay on reveal/results/scoreboard only.

## Questions for Patrick
- None open.
