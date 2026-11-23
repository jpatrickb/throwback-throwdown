# phones: status

## Done
- **Player phone (`/play`)**: join (room from `?room=`, name, avatar emoji + color picker sent on join, remembered in localStorage, auto-rejoin with token), lobby wait with bouncing avatar, PHOTO_REVEAL "Look at the TV", CAPTIONING (polaroid thumb, live char count against `settings.maxCaptionLength`, countdown, Submitted ✓ with Edit until time's up, Enter submits), VOTING (big tilted tap cards, own caption disabled "yours", tap to select/change, locked-in state), RESULTS/SCOREBOARD (your caption, votes, points, who you voted for, rank with ties, total, confetti if you won), FINAL (rank, confetti for top 3), reconnecting banner, kicked screen, Screen Wake Lock, reaction bar (😂🔥👏😱💀, throttled 700ms) on reveal/results/scoreboard.
- **Host (`/host`)**: PIN gate; one giant phase button (Start game → Start captions → Start voting → Show results → Scoreboard → Next photo / Final results → New game) with a 1s double-tap guard; "End game now" with inline confirm; live status (N of M written/voted, who's missing, countdown, +30s, Skip); collapsible sections for captions moderation (hide/unhide), players (connected dot, tap name to rename, ±100 score, kick with inline "Kick? Yes/No"), photo queue (thumbs, ↑/↓, used badge, remove with inline confirm, upload), settings (caption/vote seconds).
- **Upload**: `accept="image/*" multiple`, each file decoded (EXIF-aware `createImageBitmap`), resized to ≤1920px JPEG 0.85 on a canvas, POSTed one at a time as field `photos` with `x-host-pin`, progress bar + per-file error toasts.
- Errors are toasts (`phone/Toast.tsx`), actions time out after 8s with a toast; mock mode skips join/PIN and actions are no-ops.
- Unit tests: `client/src/phone/phone.test.ts` (phase button mapping, resize math, rank ties).

- **Big rooms (25 players)**: voting has a sticky header (prompt + countdown), compact cards above 8 captions, and a sticky footer showing your locked-in pick. Host "Waiting on" lists 6 names then "+N more", with a progress bar. (The `?mockcount` padding was removed; fixtures now have 25 players.)
- **Team mode (Nov 23)**: player lobby shows a "You're on <Team>" card in team colour with teammates and inline team rename (`player:renameTeam`). CAPTIONING shows "Writing for <Team>", "3 of 5 teams have a caption", the team's current caption with "Written by X / you" and "Tap to replace it" (prefilled; submit replaces). VOTING tags your team's card "your team" (disabled). RESULTS: "Your team got 9 votes, +900", last editor, team rank and score. FINAL: team rank, team medals, confetti for top-3 teams. Host: Teams section (team cards with members, inline rename, per-player "Move…" picker, Shuffle with inline confirm, shown in LOBBY/SCOREBOARD/FINAL), status counts teams while captioning and lists missing teams, moderation shows "Team · Written by X", ±100 hidden in team mode (player scores unused), Settings has a "Play in teams" switch and a 2–8 team-count stepper (instant, lobby only). Individual mode is unchanged (`?solo=1`).

- **Themes (Nov 23)**: `/play` and `/host` follow `view.settings.theme` via `phone/useTheme.ts`. It sets `<html data-theme>` (berry = no attribute, the same convention as the TV), crossfades with View Transitions where supported and falls back to a 400ms colour fade, and remembers the last theme in localStorage so a reload doesn't flash berry. `?theme=<id>` previews the join/PIN screens. `phone.css` uses only tokens, plus derived phone knobs: `--ph-title` mixes `--logo-a` into `--c-fg` so headings read on both dark and light stages, `--ph-panel` is derived from `--c-stage-deep`, and text on accent fills uses `--c-on-accent`. Every screen was checked in all 4 themes.

## Where to change things
- All phone copy: `client/src/phone/copy.ts`. Avatar emoji/colors and reaction emoji: `client/src/phone/avatars.ts`.
- Styles: `client/src/phone/phone.css`, built on tv's `theme/tokens.css`.
- Phase → button mapping: `client/src/phone/host/primary.ts`.
- Team helpers (team mode check, rank, members, active teams): `client/src/phone/teams.ts`.

## Next / polish ideas
- Optimistic reorder in photo queue; drag to reorder.
- Haptics already on submit/vote (`navigator.vibrate`, Android only).

## Decisions from Patrick
- **No "who is in the photo" names (Nov 23).** The Reveal button and subject-name field are gone from the host UI. The contract and engine are unchanged: `subject` stays null, and `revealSubject`/`setSubject` are simply never sent.
- Score adjust stays at ±100 buttons.
- Reactions stay on reveal/results/scoreboard only.

## Questions for Patrick
- None open.
