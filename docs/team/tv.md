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

## Done (Nov 23)
- `<AudioIndicator />` is rendered once in `Tv.tsx`, under the start overlay. It's styled via `--audio-indicator-*` tokens and confirmed on LOBBY, CAPTIONING and FINAL.
- Removed the TV's own `tick`/`timesUp` calls (audio fires them from `view.deadline`). The TV still calls reveal, submit, cardDeal, tally, winner, leaderboard, champion and join.
- Polaroids: portrait photos are letterboxed over a blurred fill (no crop, no black bars). A photo that fails to load shows "📷 Photo went missing!" instead of a broken image.

## Done (Nov 23, later): 25-player scaling, then TEAM MODE
- **Big rooms:** the voting grid uses 1–5 columns (`voteColumns`) plus one shared fitted font size (`useFitText` in `tv/fit.ts`).
  25 captions of 80 characters fit at about 22px (1080p) / 15px (720p), with numbered corner badges. With more than 12 voters, the strip becomes a progress bar plus the stragglers.
  The scoreboard uses 3 columns past 16 players, the lobby a 4-column grid past 15, and the final standings 2 columns past 12.
- **Results pacing** (`planReveal` / `revealSchedule` in `ranking.ts`, tested): zero-vote captions all at once, low-vote captions by vote count
  (at most 5 quick beats), 3rd then 2nd one at a time, then a drumroll and the winner. The header narrates each beat. 25 captions take about 20s; the tests assert under 45s.
- **Team mode** (`settings.teamMode && teams.length`; logic lives in `tv/entrants.ts`):
  - LOBBY: one column per team (team colour header, member count, members pop in).
  - CAPTIONING: a big chip per team flipping to ✓ (`submittedTeamIds`); teams with nobody connected don't count.
  - VOTING: about 5 big fitted cards.
  - RESULTS: the team name is the author, with "written by <last editor>" on the top-3 cards.
  - SCOREBOARD: teams ranked, with member names under each team.
  - FINAL: a team podium with member names, and team standings.
  - Players wear their team's colour everywhere (`decorateView`).
  - `--team-0..7` tokens in `tokens.css` match `TEAM_PRESETS`; preset colours map to the tokens, so a retheme carries over.
- Individual mode is unchanged (`?solo=1`). Both modes were screenshotted at 1920×1080 and 1280×720.

## Done (Nov 23): new SFX wired (per the table in docs/team/audio.md)
- `roundStart` at the "Round N" slam. `zeroVotes` once per zero-vote batch. The low-vote tiers keep `tally`.
- `drumroll` starts 1.5s before the winner sting, timed from the same `winnerHitDelay()` that flips the author in, so it ends on the hit (verified: 1.52s apart). The winner card's tally blips are silenced so they don't muddy the drumroll.
- `tie` instead of `winner` when tied, played once (only the lead winner card makes sound and confetti).
- `sweep` plus a "🧹 Clean sweep! +200" sticker when a caption's points include `SWEEP_BONUS`.
- `leaderChange` 0.9s after the scoreboard settles, when none of last round's leaders are still first (`leaderChanged()`, tested; never on the first scored round).
- `podium3`/`podium2`/`podium1` as each podium place reveals, then `champion` 0.9s after podium1.
- Removed the vote `submit` sound in Voting (audio's automatic `voteCast` covers it). No AUTO keys are called by the TV.
- Immediate SFX now go through a 0ms timer so React StrictMode's dev double-run doesn't double-fire them.
- Verified by wrapping `window.__tvAudio.playSfx` in headless Chrome and logging every call with timestamps on RESULTS (normal, `&mocktie`, `&mocksweep`), SCOREBOARD, FINAL and PHOTO_REVEAL, in team and solo modes. No console errors.

## Done (Nov 23): Patrick's feedback
- **No game text on photos.** `Polaroid` no longer takes a label, so the strip is always blank, like a real polaroid. The polaroid back art has no text.
  Instructions live in the header ("Write a caption on your phone!", "Vote for the funniest on your phone!") and under the reveal photo.
  Header titles fit themselves to their column, so long titles and wide theme fonts never collide.
- **LAN URL** is only in Settings → Emergency.
- **Settings** (`client/src/tv/settings/`): a discreet gear bottom-left in every phase, or the **S** key. Esc closes, focus stays inside the panel, and the cursor shows while the mouse moves.
  - `registry.ts` is **one array of setting definitions** (toggle / slider / choice / info). Adding a setting is one entry.
  - Theme, music/SFX on-off, master/music/SFX volume, emoji reactions on the TV (saved per device in localStorage `tvPrefs`), fullscreen, and the Wi-Fi join URL.
  - **The theme is server state** so phones follow it. The panel emits `tv:setTheme {theme}`, and the TV applies `view.settings.theme` to `<html data-theme>`. Nothing is stored locally. In mock mode a pick is a local preview only.
  - Audio goes through `audioAdapter.ts`, a re-export of audio's real `useAudioSettings`/`get`/`setAudioSettings` (landed in a0fd90f). The M and -/= keys stay in sync with the panel.
- **Themes** (ids from `THEMES` in shared/types.ts): berry (Berry Stage, default), cork (Cork Board), arcade (Retro Arcade), picnic (Sunny Picnic). Each is a `[data-theme]` block in `tokens.css`; `settings/themes.ts` holds only the preview swatches.
  Checked on phones (390×844) too. Arcade captions use the body font, since the pixel font hurt readability. Cork and picnic use a darker mint, and `--c-stage-highlight` keeps highlighted numbers readable on light stages.
  New role tokens make light and dark themes work: `--c-on-accent`, `--stage-chip-*`, `--stage-pattern`, `--logo-*`, `--team-name-size`, and others.
  Fonts added in index.html: Shrikhand, Caveat Brush, Bungee, Fredoka. Dev/mocks: `?theme=<id>`.

## Dev helpers
- `/tv?mock=<PHASE>` as usual. Click once to dismiss the start overlay.
- `&solo=1` individual mode. `&mockplayers=25`, `&mockcaptions=0|1|25`, `&mocklong` (all captions 80 chars), `&mocktie`, `&mocksweep` stress the fixtures (`client/src/tv/devStress.ts`, mock mode only).
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
