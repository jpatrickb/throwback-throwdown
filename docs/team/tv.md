# tv: status

## Done (Nov 22)
- **Theme tokens:** `client/src/theme/tokens.css` ("family photo album meets game show": a berry stage, cream
  polaroids, washi tape, marker doodles). Colours, fonts (Lilita One / Nunito / Permanent Marker, loaded in
  `client/index.html`), radii, shadows, motion, per-player colours (`--player-0..7`) and the TV scale unit.
  `styles.css` imports it and is fully tokenized, so global buttons, inputs and textareas already match.
- **Art manifest:** `client/src/theme/art.ts` points to the SVG placeholders in `client/public/art/`. A missing
  file hides itself (`ArtImg`). Prompts for Patrick are in `docs/team/art-prompts.md`.
- **Every TV phase** is in `client/src/tv/`, using the shared animated `Background` and AnimatePresence transitions keyed on phase+round:
  - `Lobby`: logo, QR, join URL, room code, LAN fallback, bouncy player pop-ins, "waiting for host", mascot.
  - `PhotoReveal`: "Round N" slams in, then the polaroid flips over (sfx `reveal`).
  - `Captioning`: big polaroid, countdown ring (urgent shake + red in the last 10s; sfx `tick`/`timesUp`), chips flip to ✓ (`submit`).
  - `Voting`: numbered caption cards dealt in with stagger (`cardDeal`), small ring, a voted strip. Text density adapts to count/length (tested up to 12 × 80 chars).
  - `Results`: reveals from fewest to most votes, tallies (`tally` per vote), author flips in, then a drumroll before the winner,
    who gets confetti (`winner`). Ties are revealed together ("Tied for the win!"). Handles 0 captions, 1 caption, and zero votes.
    The subject's name appears on the polaroid when revealed. **The reveal is keyed on content, so repeated `view` snapshots don't restart it.**
  - `Scoreboard`: starts in last round's order, then reorders with Motion `layout` (`leaderboard`) while scores count up. Two columns past 8 players.
  - `Final`: podium reveals 3rd → 2nd → 1st, crown, cannons + burst (`champion`), co-champions on ties, full standings.
  - `StartOverlay`: a one-time "Click to start the party!" overlay that calls `unlockAudio()` and requests fullscreen.
  - `Reactions` (stretch): floats emoji from the socket `reaction` event, with the player's name.
- **Scaling:** the stage is a fixed 80×45em box with `1em = min(1.25vw, 2.22vh)`, so layouts are identical at 1920×1080 and 1280×720 (both checked by screenshot).
  Minimum on-screen text is about 1em (24px at 1080p). Body/caption text is 1.4–2.4em.
- **Tests:** `client/src/tv/ranking.test.ts` covers ranking ties, round points, and the reveal plan.
- `Tv.tsx` keeps `useView('tv')`, the `tv:hello` registration, and `useGameAudio(view)` (it gets the raw server view).

## Dev helpers
- `/tv?mock=<PHASE>` as usual. Click once to dismiss the start overlay.
- `&mockplayers=16` and `&mockcaptions=0|1|10` stress the fixtures (`client/src/tv/devStress.ts`, mock mode only).
- `&mockreactions` streams fake emoji reactions.

## Notes for others
- **phones:** use the tokens above. Handwritten captions look great in `--font-hand`. Per-player colour: `--player-{index % 8}`
  (the TV hashes player id → slot via `playerColor()` in `client/src/tv/common.tsx` if you want to match exactly).
  The phones teammate wasn't reachable by SendMessage from this session, so this file is the handoff.
- **lead:** in dev on my ports, the server's join URL/QR says `:5173` (it doesn't know `VITE_PORT`). Harmless in prod.

## Next / polish ideas
- Wire extra mascot poses into Results/Final once Patrick makes them.
- A "subject reveal" moment in Results when the host presses reveal-subject mid-phase (it currently appears on the polaroid label).

## Questions for Patrick
- Do you like the berry/purple stage, or would you prefer a lighter "cork board" look? It's a one-file change in `tokens.css`.
- Should the TV hide the LAN fallback URL when the tunnel is working? It currently shows small under the room code.
