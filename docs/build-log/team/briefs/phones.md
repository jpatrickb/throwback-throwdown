# Brief: phones

Read `docs/team/briefs/common.md` first.

**You own:** `client/src/screens/Play.tsx`, `client/src/screens/Host.tsx`, `client/src/phone/**`
(components, `phone.css`). Ports: vite 5201, api 3201 (`VITE_PORT=5201 API_PORT=3201 npm run dev`).
You're on the **critical path** with engine.

Build against fixtures first (`/play?mock=VOTING&mockme=p3`, `/host?mock=CAPTIONING`). In mock mode Play
must skip the join gate and render the fixture view, and actions are no-ops. The engine teammate is building
the real loop on port 3100. Until it lands, actions return "Not implemented yet". Show errors as a small
toast, never a crash.

## Player phone (`/play`), designed for one thumb in a dim room, 390×844
- Join: room code (prefilled from `?room=`), name, then the stretch avatar picker (emoji + color, sent on join).
- Lobby/wait: "You're in! Eyes on the TV." Show your name/avatar plus a fun idle animation.
- PHOTO_REVEAL: "Look at the TV! 👀"
- CAPTIONING: show the photo (the round photo URL) small at the top, a textarea with a live char count (settings.maxCaptionLength),
  submit, countdown (`useCountdown`). After submitting, show "Submitted ✓" with an edit option until time's up.
- VOTING: the caption list as big tap cards. Your own caption is shown disabled ("yours"). Tapping selects it (they can change it),
  with a confirmation state.
- RESULTS / SCOREBOARD: your votes, points this round, rank, total score. Celebrate if you won.
- FINAL: your final rank, with a confetti burst for the top 3 (`canvas-confetti`).
- Reconnecting banner, kicked state, and a wake-lock request (Screen Wake Lock API) so phones don't sleep mid-round.
- Stretch: reaction buttons (😂🔥👏😱💀) → `player:react`, throttled.

## Host (`/host`), used by the host on their phone, so it must be dead simple
- PIN gate (exists).
- **One giant primary button** whose label/action depends on the phase: Start game → Start captions → Start voting →
  Show results → Scoreboard → Next photo / Final results → New game. Secondary actions in a smaller area.
- Live status: "6 of 9 have written a caption", who's missing, the countdown, +30s, skip.
- Photo queue: thumbnails in order, ↑/↓ reorder, edit the subject name, remove, "used" badge, and an
  **upload button** (`accept="image/*" multiple`) that resizes each image client-side to max 1920px JPEG ~0.85 on a canvas,
  then POSTs multipart field `photos` to `/api/photos` with the `x-host-pin` header (PIN from sessionStorage). Show progress.
- Moderation: during CAPTIONING/VOTING, list captions with author and a hide/unhide toggle.
- Players: list with connected dot, rename, kick (with an inline "are you sure?", **no `confirm()` dialogs**), adjust score.
- Reveal-subject button. Settings (caption/vote seconds).

## Styling
Use the theme tokens the **tv** teammate publishes in `client/src/theme/tokens.css` (CSS custom properties).
Until they exist, use the variables already in `styles.css`. Put phone-specific CSS in `client/src/phone/phone.css`.
Don't edit `styles.css` (tv owns it). Need a token? Message `tv`. Take screenshots at 390×844 and make it look like a real game, not a form.
