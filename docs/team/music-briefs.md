# Music & SFX briefs for Soundcraft

Patrick, these are the specs for the real tracks. Placeholders are already in the game (synth beeps in
`client/public/audio/placeholder/`), so you can make any subset in any order and the game keeps working.

## How to drop a track in (two steps)

1. Export the file with the **exact filename** below into `client/public/audio/`.
   Export both `.ogg` and `.mp3` if you can. The game tries `.ogg` first because it loops without a gap, and falls back to `.mp3`.
2. In `client/src/audio/cues.ts`, change that cue's `placeholder('…')` to `real('…')`. For example:
   ```ts
   lobby: { src: real('music-lobby'), volume: 0.5, loop: true },
   ```
   The `volume` next to it (0 to 1) is the in-game mix level. Nudge it if your track sounds louder or quieter than the others.

If a file is missing or broken, that sound is skipped silently. Nothing crashes.

## Export settings (every file)

| Setting | Value |
|---|---|
| Formats | `.ogg` (Vorbis, quality ~6) **and** `.mp3` (192 kbps CBR), 44.1 kHz, stereo |
| Loudness | music around **-14 LUFS integrated**; stingers can peak louder but should feel even with the music |
| Peaks | true peak **≤ -1 dBFS** (put a limiter on the master) |
| Loops | the file starts and ends **exactly** on the loop point: a whole number of bars, no fade-in or fade-out, no silence at either end. Let reverb and delay tails from the last bar wrap: render the tail and mix it into the start, or keep the last bar dry. |
| Test | loop it in Soundcraft for a full minute and listen for clicks or a "hiccup" at the seam |

The TV crossfades between cues over 0.8 s, and dips the music under the big stingers (reveal, time's up, winner,
leaderboard, champion), so the music doesn't need its own intros or outros.

Overall vibe: **warm, playful family game show**. Think a cozy daytime quiz show crossed with a scrapbook of
'90s home videos. Bright, friendly, a little goofy. Never aggressive, never "epic trailer". It plays in a living room
full of relatives of every age, under people talking, so leave room in the mids for voices and keep the low end polite.

## Music cues

### 1. Lobby: `music-lobby`
- **When:** title screen while everyone scans the QR code and joins. This can play for 5–10 minutes, so it must not get annoying.
- **Mood:** welcoming, upbeat, "come on in, grab a plate".
- **BPM / key:** 118–124 BPM, C or F major.
- **Length:** 60–90 s loop (e.g. 32 bars at 120 BPM = 64 s).
- **Energy curve:** flat and steady with small variations every 8 bars (a part drops out, a fill, a counter-melody) so the loop isn't obvious. No big build.
- **Reference vibe:** bouncy electric piano or ukulele, light claps, walking bass, glockenspiel accents. A friendly game-show warm-up band.

### 2. Captioning (thinking): `music-captioning`
- **When:** players are typing captions on their phones (default 75 s). The last 10 s get a ticking clock from the game, so you don't need to add one.
- **Mood:** light, curious, a bit mischievous. Background "thinking music" that doesn't pull focus.
- **BPM / key:** 92–100 BPM, a relaxed major key (F or Bb), maybe major-7th chords.
- **Length:** 30–60 s loop.
- **Energy curve:** low and even. Sparse arrangement (plucks, soft pads, brushed drums). Nothing that sounds like an ending.
- **Reference vibe:** quirky pizzicato or marimba over soft keys, the kind of cue that plays while a cartoon character schemes.

### 3. Voting: `music-voting`
- **When:** captions are on the TV and everyone votes (default 30 s).
- **Mood:** bouncy, a little more urgent than captioning, playful anticipation.
- **BPM / key:** 128–136 BPM, G or D major.
- **Length:** 20–40 s loop. It often only plays once or twice through.
- **Energy curve:** mid energy from the first beat (no intro). Steady driving rhythm.
- **Reference vibe:** perky synth-pop or swing shuffle, staccato brass hits, hand percussion. "Lock in your answers!"

### 4. Results & scoreboard: `music-results`
- **When:** captions are revealed one by one with vote tallies, then the leaderboard. The winner fanfare and tally blips play over it.
- **Mood:** light suspense that resolves warm. A drum-roll feeling without an actual drum roll.
- **BPM / key:** 104–112 BPM, A minor moving to C major (or a similar relative minor/major pair).
- **Length:** 30–60 s loop.
- **Energy curve:** low-mid and restrained. The stingers carry the peaks, so the bed stays under them. Keep it sparse in the 1–4 kHz range where the blips sit.
- **Reference vibe:** soft pulsing synth bass, ticking hi-hat, sustained strings or pads with a hopeful lift every 4 bars.

### 5. Final / champion: `music-final`
- **When:** game over, the podium and the champion celebration. The champion fanfare plays over the start of it.
- **Mood:** celebratory, triumphant but goofy, a "you're all winners" group hug.
- **BPM / key:** 124–130 BPM, C or D major.
- **Length:** 45–90 s loop. It may play while people take photos and chat.
- **Energy curve:** high from the start, with a slightly bigger chorus every 8–16 bars.
- **Reference vibe:** full band party groove (brass section, claps, bright piano, tambourine). End-of-show credits for a family game show.

The photo reveal phase is deliberately silent (the reveal stinger lands on its own), so there's no cue for it.

## Sound effects (stingers)

Same export settings. **No loop and no silence at the start**: trim to the first transient so they fire in sync with the animation.
Filenames go in `client/public/audio/` and get switched over in the `SFX` block of `cues.ts`.

| Filename | Length | Description |
|---|---|---|
| `sfx-join` | ~0.3 s | Cheerful two-note "boop-bip" when a player joins the lobby. Can play many times in a row, so keep it soft. |
| `sfx-reveal` | 1–2 s | Whoosh into a sparkly shimmer as the childhood photo flips in. The "ta-da!" moment. |
| `sfx-submit` | ~0.2 s | Quick, satisfying pop or bubble when someone submits a caption or vote. |
| `sfx-tick` | <0.1 s | Dry clock tick or woodblock for the last 10 seconds. The game pitches the last 3 up, so keep it pitch-neutral. |
| `sfx-timesUp` | ~1 s | Friendly "time's up": a descending three-note bell or a cartoon buzzer, not a harsh alarm. |
| `sfx-cardDeal` | ~0.15 s | Card flick or paper swipe as each caption card appears. Plays in quick succession. |
| `sfx-tally` | ~0.15 s | Bright coin-like blip for each vote counted. Plays rapidly; if you make 3 rising variants, tell the audio teammate and they'll rotate them. |
| `sfx-winner` | 1.5–2 s | Short brass fanfare ("da-da-da-DAAA") for the round winner. Confetti moment. |
| `sfx-leaderboard` | ~1 s | Rising swoosh plus a rapid arpeggio as the scoreboard reshuffles. |
| `sfx-champion` | 3–4 s | Big triumphant fanfare with a cymbal swell for the overall champion. The biggest sound in the game. |

## Priorities if time is short

1. `sfx-winner`, `sfx-reveal`, `sfx-timesUp`: the three moments people will notice.
2. `music-lobby`: it plays the longest.
3. `sfx-champion`, `music-final`.
4. Everything else. The placeholders are fine.
