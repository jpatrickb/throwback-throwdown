# Brief: audio

Read `docs/team/briefs/common.md` first.

**You own:** `client/src/audio/**`, `client/public/audio/**`, `docs/team/music-briefs.md`.
Ports: vite 5401, api 3401. Audio plays **only on the TV** (`/tv`), never on phones.

The seam is `client/src/audio/index.ts`: `useGameAudio(view)`, `playSfx(key)`, `unlockAudio()`, and the `SfxKey`
union. **Keep those signatures**: the tv teammate calls them. Implement everything behind them.

## Deliverables, in order
1. **Cue manifest** `client/src/audio/cues.ts`: one place mapping music cues (`lobby`, `captioning`, `voting`,
   `results`, `final`) and every `SfxKey` to file paths, volume, and loop flag. Swapping in Patrick's real tracks
   must be a one-line change. Phase→music mapping lives here too.
2. **Audio manager** with `howler`: phase-driven music with crossfades (~800ms), stingers ducking music briefly,
   the last-10s `tick` pacing during timed phases (use `view.deadline`/`serverNow`), global volume + mute
   (press `M` on the TV, persisted to localStorage, try/catch around storage), a small unobtrusive mute indicator
   component the TV can render (export it, e.g. `<AudioIndicator />`, and tell `tv` about it). Missing or failed files
   must fail silently. Calling anything before `unlockAudio()` must queue or no-op, never throw.
3. **Placeholder sounds now**, generated with `ffmpeg` (installed; no sox) using `aevalsrc`/`sine` synthesis, into
   `client/public/audio/placeholder/`: short, cheerful, game-show-ish stingers for every SfxKey (blips, whooshes,
   arpeggios, a fanfare) and simple loopable music beds for each cue (arpeggiated chords at a steady BPM, 15–30s,
   loop cleanly). Keep it pleasant and quiet. Placeholders only need to be "fine". Commit the generation script
   (`client/src/audio/generate-placeholders.sh`) so they can be regenerated.
4. **`docs/team/music-briefs.md`** for Patrick to make the real tracks in Soundcraft (an Audition-style DAW): for each cue,
   the mood, BPM, key, length, loop points, energy curve, reference vibe (described, not copyrighted songs), export format
   (`.mp3` 192k + `.ogg`, -14 LUFS-ish, peaks ≤ -1 dBFS), and the exact filename to drop into `client/public/audio/` so
   cues.ts picks it up. Include the SFX list with a one-line description each.
5. Test in the browser at `/tv?mock=<PHASE>` (switch phases and confirm crossfades) and verify there are no console errors.
