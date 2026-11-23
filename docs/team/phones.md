# phones: status

## Done
- **Player phone (`/play`)**: join (room from `?room=`, name, avatar emoji + color picker sent on join, remembered in localStorage, auto-rejoin with token), lobby wait with bouncing avatar, PHOTO_REVEAL "Look at the TV", CAPTIONING (polaroid thumb, live char count against `settings.maxCaptionLength`, countdown, Submitted ✓ with Edit until time's up, Enter submits), VOTING (big tilted tap cards, own caption disabled "yours", tap to select/change, locked-in state), RESULTS/SCOREBOARD (your caption, votes, points, who you voted for, rank with ties, total, confetti if you won), FINAL (rank, confetti for top 3), reconnecting banner, kicked screen, Screen Wake Lock, reaction bar (😂🔥👏😱💀, throttled 700ms) on reveal/results/scoreboard.
- **Host (`/host`)**: PIN gate; one giant phase button (Start game → Start captions → Start voting → Show results → Scoreboard → Next photo / Final results → New game) with a 1s double-tap guard; "End game now" with inline confirm; live status (N of M written/voted, who's missing, countdown, +30s, Skip, Reveal who it is); collapsible sections for captions moderation (hide/unhide), players (connected dot, tap name to rename, ±100 score, kick with inline "Kick? Yes/No"), photo queue (thumbs, ↑/↓, subject edit on blur, used badge, remove with inline confirm, upload), settings (caption/vote seconds).
- **Upload**: `accept="image/*" multiple`, each file decoded (EXIF-aware `createImageBitmap`), resized to ≤1920px JPEG 0.85 on a canvas, POSTed one at a time as field `photos` with `x-host-pin`, progress bar + per-file error toasts.
- Errors are toasts (`phone/Toast.tsx`), actions time out after 8s with a toast; mock mode skips join/PIN and actions are no-ops.
- Unit tests: `client/src/phone/phone.test.ts` (phase button mapping, resize math, rank ties).

## Where to change things
- All phone copy: `client/src/phone/copy.ts`. Avatar emoji/colors and reaction emoji: `client/src/phone/avatars.ts`.
- Styles: `client/src/phone/phone.css`, built on tv's `theme/tokens.css`.
- Phase → button mapping: `client/src/phone/host/primary.ts`.

## Next / polish ideas
- Optimistic reorder in photo queue; drag to reorder.
- Haptics already on submit/vote (`navigator.vibrate`, Android only).

## Questions for Patrick
- Score adjust steps are ±100 (one vote's worth). Want a free-form number instead?
- Reactions show on reveal/results/scoreboard only (not while writing/voting, to keep focus). OK?
