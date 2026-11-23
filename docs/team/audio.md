# audio: status

## SFX keys: who fires what (hand this to tv)

Call `playSfx(key)` from `client/src/audio/index.ts`. Every key has 1–4 Soundcraft-rendered takes; the manager
picks one at random (never the same take twice in a row), takes the music fully down while any SFX plays, and drops
duplicates that land on the same moment. **AUTO** keys fire from `useGameAudio(view)`: **tv must not call them.**

| Key | Takes | Who fires it | When |
|---|---|---|---|
| `join` | 4 | tv (already wired: `useSfxOnIncrease(players.length, 'join')`) | A player joins the lobby. In team mode this automatically plays `teamJoin` instead. |
| `teamJoin` | 4 | **AUTO** | A player lands on (or is moved to) a team in the lobby |
| `teamRename` | 2 | **AUTO** | A team's name changes (any phase) |
| `whoosh` | 4 | **AUTO** | Every phase change. It yields to allIn/timesUp/roundStart/reveal/champion fired at the same moment. |
| `roundStart` | 3 | tv should call | At the "Round N" slam (start of PHOTO_REVEAL, before or with the photo) |
| `reveal` | 3 | tv (already wired) | The photo flips in |
| `submit` | 4 | tv (already wired in Captioning) | A caption is submitted (a new ✓ badge) |
| `voteCast` | 4 | **AUTO** | Each vote during VOTING (subtle). **tv: remove `useSfxOnIncrease(voted.size, 'submit')` in Voting.tsx**, or votes double up. |
| `allIn` | 3 | **AUTO** | Every player/team has captioned, or everyone has voted. It plays as the phase advances early. |
| `lastCall` | 2 | **AUTO** | 10 seconds left in CAPTIONING/VOTING (ticks follow from 9) |
| `tick` | 2 | **AUTO** | Each of the last 9 seconds (the last 3 pitched up) |
| `timesUp` | 3 | **AUTO** | The deadline hits zero |
| `cardDeal` | 3 | tv (already wired) | Each caption card appears in VOTING |
| `drumroll` | 2 | tv should call | About 1.5 s before revealing the round winner (≈1.6 s long, ends dry so `winner` lands on the hit) |
| `tally` | 3 | tv (already wired) | Each step of a vote count-up. It **rises in pitch automatically** for calls under 0.7 s apart; or pass `playSfx('tally', { step: n })`. |
| `zeroVotes` | 3 | tv should call | A caption with 0 votes is shown (playful "aww"). Replaces the `cardDeal` currently used for zero-vote batches. Call it once per batch, not per caption. |
| `winner` | 4 | tv (already wired) | The round winner reveal |
| `tie` | 2 | tv should call | Top captions are tied for the win (call instead of `winner`, or just before it) |
| `sweep` | 2 | tv should call | The clean-sweep bonus is shown (`SWEEP_BONUS`) |
| `leaderboard` | 2 | tv (already wired) | The scoreboard reshuffle |
| `leaderChange` | 2 | tv should call | A different team/player takes first place on the scoreboard (after the reshuffle settles) |
| `podium3` | 1 | tv should call | FINAL: third place revealed |
| `podium2` | 1 | tv should call | FINAL: second place revealed |
| `podium1` | 1 | tv should call | FINAL: first place revealed (then `champion` for the celebration, or instead of it) |
| `champion` | 2 | tv (already wired) | The final champion celebration |

Lengths: 0.3–2.2 s (champion 3.7 s, reveal 2.5 s). Takes live in `client/public/audio/sfx-<key>-<n>.{ogg,mp3}`;
`cues.ts` lists the takes per key and their volume, ducking and repeat gap.


## Settings API (for tv's settings panel)

`client/src/audio/index.ts` exports these (spec: `docs/team/briefs/settings-audio-api.md`):
- `AudioSettings` `{ musicOn, sfxOn, master, music, sfx }`. Defaults: on, on, 0.8, 1, 1.
- `getAudioSettings()`
- `setAudioSettings(patch)`: persists to localStorage `tvAudio`, applies live.
- `useAudioSettings()`: returns `[settings, set]` and re-renders on any change.

The TV keys use the same path:
- `M`: if anything is on, turns music and SFX off; if both are off, turns both on.
- `-` / `=`: master volume (turning it up also unmutes).

Old `{volume, muted}` storage migrates automatically. Turning music off keeps it running silently, so turning it back on resumes in place.

## Music & SFX overlap rules
- **Nothing plays under an SFX.** Any SFX fades the music fully down in 90 ms. The music returns 350 ms after the SFX ends, fading up over 0.7 s.
- **Bursts** (tick, tally, voteCast, submit, cardDeal, join/teamJoin) hold the music for 0.7–1.2 s after each hit. A burst therefore keeps the music down until it ends, with no pumping. The music is silent through the last 10 s of a timer (lastCall, then ticks).
- **Phase changes:** the new phase's music starts only after that moment's stingers (whoosh, allIn, timesUp, reveal, roundStart…) have finished. A faded-out track pauses rather than stopping, so it resumes where it left off.
- Knobs: `AUDIO_TUNING.holdFadeMs/holdGapMs/musicReturnMs` and per-key `holdAfterMs` in `cues.ts`.

## Lobby track: restored and frozen (Patrick's call)
Patrick preferred the original lobby track, so it's back **exactly** as rendered in `e4390a0`:
- `client/public/audio/music-lobby.ogg` and `.mp3`, plus `client/src/audio/sessions/music-lobby.scraft`. `git diff e4390a0` on these paths is empty.
- Its composer source: the original melody, the chromatic-approach bass and 4-note voicings (as `legacy` options), and the original brass/lead detune and keys chorus (as `patchOverrides`). Composed with the freeze lifted, the source reproduces e4390a0's lobby MIDI and track presets byte for byte.
- `frozen: 'Patrick approved the e4390a0 lobby track (Nov 23)'` on the cue is the harmony-check allowlist entry. Frozen cues aren't checked and get no render job, so `build.sh` never rewrites the approved files.
- Everything else from the harmony pass, the no-overlap rules and CAPTIONING → lobby stay as they are.

## Music map
LOBBY → lobby, PHOTO_REVEAL → silence, **CAPTIONING → lobby** (Patrick's favorite plays where music plays most), VOTING → voting, RESULTS/SCOREBOARD → results, FINAL → final.

Because the lobby track pauses and resumes, each CAPTIONING phase continues the lobby track instead of restarting the same 32 s.

**Old captioning track:** retired. Its files are removed (saves 1.8 MB). The composition stays in `compose.ts` (`retired: true`) in case it's wanted back, e.g. as an alternate lobby/captioning bed on even rounds to reduce repetition. To bring it back: set `retired: false`, rebuild, and add it to `MUSIC`/`PHASE_MUSIC`.

## Done
- **Cue manifest** `client/src/audio/cues.ts`: music cues, every SfxKey (src/volume/loop/duck), `PHASE_MUSIC`, and mixing/timing knobs (`AUDIO_TUNING`). Swapping in a real track means changing `placeholder('x')` to `real('x')`.
- **Manager** `client/src/audio/manager.ts` (Howler):
  - Howler is lazy-loaded on unlock, so phones never download it and there are no autoplay console warnings.
  - Phase music crossfades over 800 ms. Consecutive phases with the same cue don't restart. Switching back mid-fade revives the same sound.
  - Stingers flagged `duck` dip the music to 30% while they play.
  - Ticks play automatically in the last 10 s of timed phases (from `deadline` and `serverNow`); the last 3 are pitched up. `timesUp` plays automatically when the deadline hits zero, including when the server auto-advances at the deadline. It doesn't play when the host advances early.
  - Big stingers are deduped so a double call won't double-play.
  - Master volume and mute persist in localStorage (`tvAudio`, all access in try/catch). Keys on the TV: `M` mute, `-`/`=` volume.
  - Missing or failed files are skipped silently (verified with a 404'd cue). Calls before unlock are safe: music is remembered and starts on unlock; SFX are dropped.
- **`<AudioIndicator />`**: a bottom-right pill showing Muted, a volume flash, or "Click anywhere for sound". The TV needs to render it.
- **Placeholders** in `client/public/audio/placeholder/` (ogg + mp3), generated by `client/src/audio/generate-placeholders.sh`. Pure ffmpeg synthesis: arpeggiated loop beds (whole bars, click-free seams) and 10 stingers, peak-normalized.
- **`docs/team/music-briefs.md`**: the per-cue spec for Patrick's Soundcraft tracks, plus the SFX list.
- **Verified** in headless Chrome against `/tv?mock=LOBBY` and `/tv?mock=FINAL` through `window.__tvAudio` (dev only): crossfade levels at 400 ms and after, ducking, tick and timesUp sequences, mute persisting across a reload, and a missing file. The only console errors were the favicon 404 (not mine) and the deliberate 404 in the missing-file test.

## Soundcraft soundtrack (Nov 23)
- **All cues are now real tracks made in Soundcraft**, and `cues.ts` uses `real()` for everything. Files are in `client/public/audio/<name>.{ogg,mp3}`. The ffmpeg placeholders are kept as a fallback.
- **Pipeline** (`client/src/audio/soundtrack/`):
  - `compose.ts` writes the music data (chords, written melodies, drum/bass/comp patterns, synth patches, mix levels) as MIDI, Soundcraft track presets, and one Soundcraft script per cue.
  - `build.sh` runs `soundcraft-cli script` for each cue: it imports the MIDI as instrument tracks (Subtractive Synth / Drum Synth), applies presets (EQ, chorus, delay, room/plate reverb), adds a master track (compressor + maximizer), bounces a WAV, and saves the session.
  - ffmpeg then cuts the exact loop, applies static-gain normalization, and encodes ogg + mp3.
  - Rebuilding everything takes about 30 s.
- **Cues:**

  | Cue | Tempo, key | Length | Arrangement |
  |---|---|---|---|
  | lobby | 120 BPM, C major | 16 bars, 32 s | Pop drums, bass, skank keys, brass stabs in the B section, lead melody + bell |
  | captioning | 96 BPM, F major | 16 bars, 40 s | Light swung drums, walking bass, plucks, pad, bell melody (jazzy ii–V changes) |
  | voting | 128 BPM, G major | 16 bars, 30 s | Disco drums, octave bass, brass stabs, keys, lead melody |
  | results | 100 BPM, A minor to C major | 16 bars, 38.4 s | Pulse drums, pulse bass, pad, arpeggio, bell melody |
  | final | 125 BPM, D major | 16 bars, 30.7 s | Disco drums, brass hits, keys, lead + bell |

  SFX: bell, brass, pluck and drum-synth stingers (snare-roll reveal, brass fanfares for winner and champion, a woodblock tick, etc.).
- **Seamless loops:** each cue is rendered twice and only the second pass is kept, so reverb and release tails wrap into the loop start. Bar lengths are whole samples at 48 kHz.
- **Verified:**
  - Decoded lengths are sample-exact (ogg and mp3).
  - The sample jump at the seam is 0.007–0.024, against a typical step of 0.14–0.23.
  - Music is at -16 LUFS (captioning -18.2, peak-limited), with peaks ≤ -1 dBFS. Stingers peak at -1.5 dBFS.
  - Pitches checked by FFT.
  - In Chrome, all 20 files load through the manager with no load failures and no placeholder requests.
- **Sessions:** `client/src/audio/sessions/*.scraft` (self-contained: MIDI clips inline). Music sessions hold the loop twice; bounce the second pass. See `docs/team/music-briefs.md`.
- **Limit:** I can't listen to the audio. Mix balance was set from per-stem loudness measurements, so Patrick should give it a listen and nudge levels in `compose.ts` (`volumeDb`, per-cue `mix`) or the `cues.ts` volumes.

## SFX takes & new moments (Nov 23)
- 25 SfxKeys (15 new) with 66 takes, all rendered in Soundcraft from `client/src/audio/soundtrack/sfx.ts` (note data per take) by `build.sh`. One session per key, `client/src/audio/sessions/sfx-<key>.scraft`, holds that key's takes back to back, 2 s apart. Two new patches: Sweep (gliding saw for whooshes) and Trombone (sliding brass for "aww").
- Manifest: `SfxCue.takes` (array of [ogg, mp3]), `minGapMs`, `risingRunMs`, `duck`. `SFX_EXCLUSIVE` priority groups stop pile-ups (e.g. allIn beats whoosh; join/teamJoin first wins). `RISING_STEPS` drives the tally pitch climb.
- Manager auto-detects from the view: allIn (including when the server auto-advances, since the next phase's first view still lists submissions/votes), voteCast, teamJoin, teamRename, whoosh, lastCall.
- `playSfx(key, { step? })` is additive; old calls are unchanged.
- Size: `client/public/audio` is now 12 MB (music 8 MB, SFX 4.4 MB at 128 kbps). I removed the unused ffmpeg placeholder files (2.9 MB); `generate-placeholders.sh` can regenerate them.
- Verified in Chrome (synthetic views):
  - Takes never repeat back to back, and a tally run climbs 1 → 1.12 → 1.26 → 1.34 → 1.50 → 1.68, then a new run starts on a new take.
  - lastCall fires at 10 s; allIn fires on early advance with the whoosh suppressed; voteCast, teamJoin and teamRename fire.
  - All 66 takes load. No console errors except the favicon 404.

## Harmony pass (Nov 23, after Patrick's listen)
- **Automated check:** `soundtrack/harmony.ts` runs inside `compose.ts`, so **the build fails** on any of these:
  - a note outside the cue's/take's major key
  - a melody note on beat 1 or 3 (or at a chord change) that isn't a chord tone
  - a passing note that doesn't move by step
  - a bass note that isn't a chord tone
  - any two notes, across layers, that start together a minor 2nd/major 7th or a tritone apart
  - a tally take that isn't on C
- **What it found and fixed:** 109 problems on the first run.
  - Rewrote the melodies of voting, results and final bar by bar. (The lobby rewrite was reverted: see "Lobby track: restored and frozen".)
  - Bass now uses chord tones only (no chromatic approach notes).
  - Comping uses triads only (no clustered maj7/9th voicings).
  - Results bar 8 is G7sus4→G instead of E major (G# was out of key).
  - SFX: D-major and Bb chords in C-major takes, a G7 tritone in lastCall, the chromatic "aww" in zeroVotes, and the Bb neighbor note in the champion fanfare.
- **Tally:** takes now sit on C only, and the runtime steps (`RISING_STEPS`, major scale) land on C-major degrees: C D E F G A B C…
- **Detune:** oscillator 2 detune is now ≤4 cents everywhere (was up to 18), and chorus depth is down from 35 to 18. Rendered pitches were spot-checked by FFT.
- **Result:** re-rendered everything in Soundcraft. Energy on out-of-key pitch classes dropped (lobby 8.6→7.4%, voting 10.6→10.0%, results 7.0→5.8%, final 9.4→7.7%). The remainder is synth overtones and drums.

## Notes for tv
- See the table at the top. Never call the AUTO keys (teamJoin, teamRename, whoosh, voteCast, allIn, lastCall, tick, timesUp).
- Call `tally` once per count-up step; the pitch climbs on its own.

## Next / ideas
- Volume and mute controls on `/host` (PLAN §D) would need a contract change (a host action relayed to the TV). Deferred.

## Questions for Patrick (resolved)

_Answered by Patrick on Nov 23. See PLAN.md "Decisions": berry theme stays the default, LAN URL only in settings, music waits for stingers, join-order teams with shuffle/move._
- Is the TV sound going over HDMI to the TV, or to a separate speaker? The default master volume is 80%; adjust it with `-`/`=` on the TV.
- PHOTO_REVEAL is silent (only the reveal stinger plays). Would you prefer the thinking music to start at reveal?
