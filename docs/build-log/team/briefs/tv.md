# Brief: tv

Read `docs/team/briefs/common.md` first.

**You own:** `client/src/screens/Tv.tsx`, `client/src/tv/**`, `client/src/theme/**` (tokens.css, art.ts),
`client/src/styles.css`, `client/public/art/**`, the `<head>` of `client/index.html` (fonts), and
`docs/team/art-prompts.md`. Ports: vite 5301, api 3301. Build against fixtures: `/tv?mock=<PHASE>` at 1920×1080.

Patrick said the scaffold looks "a bit basic". **Make it feel like a real party game**: bold, colorful,
animated, legible from across a room.

## Deliverables, in order
1. **Theme system** in `client/src/theme/tokens.css`: colors, fonts, radii, shadows, motion durations as CSS custom
   properties. Pick a direction and commit to it. Suggested: **"family photo album meets game show"**: warm, saturated
   palette, polaroid frames, washi tape, doodles, chunky display font (Google Fonts) plus a friendly body font. Keep every
   style decision in tokens so it can be retuned in one file. Rework `styles.css` to use tokens.
   **Message `phones` as soon as tokens exist** so phone screens match.
2. **Art manifest** `client/src/theme/art.ts`: key → path (logo, backgrounds, frame, doodles, mascot). Ship CSS/SVG
   placeholders in `client/public/art/` now. Write `docs/team/art-prompts.md` with copy-pasteable AI image prompts
   for each asset (consistent style, sizes, transparent PNG where needed) for Patrick to generate later.
3. **Every TV phase**, componentized in `client/src/tv/` with a shared animated background:
   - LOBBY: logo/title (from `brand.ts`), big QR code, room code, join URL, players popping in (bouncy entrance), "waiting for host".
   - PHOTO_REVEAL: dramatic reveal of the photo in a polaroid frame (flip/zoom, drumroll moment), "Round N".
   - CAPTIONING: the photo plus a big countdown ring (turns urgent in the last 10s), player chips flipping to ✓ as they submit.
   - VOTING: the photo plus numbered caption cards dealt in with stagger, a countdown, who has voted.
   - RESULTS: reveal captions from fewest to most votes, vote counts tally up, author name revealed, winner card gets confetti.
     The subject's name if revealed. Handle the "tough crowd" case (0–1 captions).
   - SCOREBOARD: animated leaderboard reorder (Motion `layout`).
   - FINAL: podium for the top 3, champion celebration, full standings.
   - A one-time **"Click to start the party"** overlay that calls `unlockAudio()` from `client/src/audio/index.ts`.
   - Call `playSfx(key)` at the matching animation moments (keys are listed in audio/index.ts). The audio teammate implements them.
4. Use `motion` (Framer Motion) for transitions between phases (AnimatePresence) and `canvas-confetti`.
   Respect 1280×720 too (TVs vary). Text must be readable from 15 feet away. Check with screenshots at both sizes.
5. Stretch: listen for socket `reaction` events and float emoji up the screen.

Keep `useView('tv')`, the `tv:hello` registration and `useGameAudio(view)` wiring intact.
