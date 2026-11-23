# Cousin Caption Party Game — Plan

**Game day:** Sunday, Nov 29, 2026 (cousin get-together, hosted by a family member)
**Status:** Monday milestone done early (Nov 22): scaffold + join flow + named tunnel working. Next: split into the agent team (§7).

## Decisions (Nov 22)
- **Venue:** an office building, with reliable internet. **Tunnel mode is primary.** Corporate wifi may isolate devices from each other, so the tunnel matters even with good internet: phones reach the server via the internet rather than the local network. LAN mode stays as an emergency fallback (phone hotspot).
- **Display:** MacBook → TV over HDMI (MacBook has HDMI built in). Sound goes over HDMI.
- **Tunnel:** named Cloudflare tunnel `party` → **`https://party.jpatrickbeal.com`** → `localhost:3000`. Config lives in `~/.cloudflared/config.yml` (credentials JSON next to it; keep it secret). Verified end to end on Nov 22: bots joined over the public URL.
- **Host PIN:** 6 digits, random each start (or `HOST_PIN` env). Because the server is public, wrong guesses are rate-limited: 5 per connection, then a 60s global lockout after 20 per minute.
- **Patrick's answers (Nov 23):** name stays **Throwback Throwdown**. No "who's in the photo" names: just the picture, and the reveal button is removed. Reactions only on reveal/results/scoreboard. Score fixes stay ±100. Photos are uploaded by the host from their phone, either all at the start or one at a time. **~25 players in 5 teams (the host's call, Nov 23):** one photo at a time; each team submits one caption (any member, latest replaces); everyone votes individually but not for their own team; points go to teams; preset team names that any member can rename; auto-assigned in join order (the host may switch this to a shuffle). Individual mode stays as a setting. Spec: `docs/team/briefs/teams.md`. The host only hosts, on an **iPhone** (Safari is the priority test).
- **Patrick's playtest feedback (Nov 23):** keep the berry stage as the default theme. Hide the LAN URL on the TV (it's only in the settings panel). No game-written text on the photo (players write all captions). TV gets an always-available settings button: themes, music/SFX toggles and volumes, reactions, fullscreen. **Music never plays over SFX**: it waits for stingers and ducks out under effects. The lobby track is his favorite, so it also plays during CAPTIONING (the most-played phase). Audio gets a harmony pass to remove discordant notes. Teams: join order by default, with the host able to shuffle and move people.
- **Stack as built:** Node 26, TypeScript, Express 5, Socket.IO 4, Vite 8, React 19, Vitest.

---

## 1. Recommendations

### Hosting / runtime: the display laptop runs everything (option c), with a LAN fallback

Run one Node.js server on the laptop that's plugged into the TV (the MacBook). It serves the web app, the WebSocket traffic, and the uploaded photos. Phones reach it one of two ways, and the TV shows a QR code for whichever one is active:

| Mode | When | How phones connect |
|---|---|---|
| **A. Tunnel (primary)** | Venue has working internet | `cloudflared` tunnel gives an `https://…` URL. Phones can be on venue wifi **or cellular**, so nobody needs the wifi password. |
| **B. LAN (fallback)** | Venue internet is bad or missing | Laptop and phones join the same network (venue wifi, or a phone hotspot / travel router). Phones open `http://<laptop-ip>:3000`. |

Since it's the same server either way, switching modes is just a different URL in the QR code. No code changes.

Why not the other options:
- **(a) Cloudflare Workers + Durable Objects + R2:** cheap and solid, but it means a second codebase shape, deploy steps, and R2 for photos. It can't run offline, so you'd still need the local version as a fallback. That's two systems to build in four evenings.
- **(b) Arch home-lab laptop + tunnel:** puts your home power, home internet, and home upload speed between the TV and the phones even though the TV is in the same room. You get more ways to fail and nothing in return.

Tunnel detail: a **quick tunnel** (`cloudflared tunnel --url http://localhost:3000`) needs no account or domain, but the URL is random each run and has no uptime guarantee. A QR code on the TV makes the random URL a non-issue. If you already have a domain on Cloudflare, a **named tunnel** (e.g. `game.yourdomain.com`) is a bit more reliable and gives you a stable URL. Decide Monday.

### Realtime: Socket.IO on Node, server-authoritative

- **Socket.IO** (rather than raw `ws`) because phones constantly sleep, switch apps, and drop wifi. Socket.IO handles reconnection automatically, falls back to long-polling when WebSockets hiccup, and has rooms built in. Its overhead doesn't matter at 15–30 players.
- **The server owns all game state.** Clients send *intents* (`submitCaption`, `vote`, `host:next`), and the server validates them, updates state, and sends each screen a fresh **snapshot** of what it should show. No diffing. Because the snapshot is the full picture, a reconnecting phone automatically catches up.
- After every transition the server writes the state to `data/state.json` (plus photos on disk), so if the process crashes or restarts mid-game, the game resumes where it was.

### Stack
- **Server:** Node 22+, TypeScript, Express (static files + photo upload) + Socket.IO.
- **Client:** Vite + React + TypeScript, built as one app with three routes: `/tv`, `/play`, `/host`.
- **Animation:** Motion (Framer Motion) for transitions, CSS keyframes for idle wiggles, `canvas-confetti` for winner reveals.
- **Audio:** Howler.js (loops, stingers, crossfades).
- **QR codes:** `qrcode` npm package, rendered on the TV.
- **No database.** In-memory state + JSON snapshot file.

---

## 2. Architecture

```
          ┌──────────────────── Display laptop (MacBook) ─────────────────────┐
          │  Node server :3000                                                 │
          │   ├─ Express: serves built client, POST /api/photos, GET /photos/* │
          │   ├─ Socket.IO: game events                                        │
          │   ├─ Game engine (state machine, pure TS, unit-tested)            │
          │   └─ data/state.json + data/photos/                                │
          │  Browser (fullscreen) → /tv  ──HDMI──▶ TV + speakers              │
          └───────────────▲──────────────────────────────▲─────────────────────┘
                          │ cloudflared tunnel (A)       │ LAN (B)
              ┌───────────┴───────────┐       ┌──────────┴──────────┐
              │ Player phones /play   │       │ the host's phone /host   │
              └───────────────────────┘       └─────────────────────┘
```

### The three screens

**TV display — `/tv`** (watches only, never plays)
- Lobby: big room code, QR code, join URL, avatars/names popping in as people join, lobby music.
- Photo reveal: dramatic reveal animation of the childhood photo, plus a "Who is this?!" moment (optional: the host can reveal the cousin's name).
- Captioning: photo plus countdown timer, with a "✓ submitted" badge per player (no caption text).
- Voting: photo plus the anonymous captions in numbered cards, plus a timer.
- Results: captions revealed one at a time with vote counts and authors, winner gets confetti and a sound stinger.
- Scoreboard: animated leaderboard reshuffle.
- Final: podium, champion celebration.
- Has a one-time "Click to start" overlay, because browsers block audio until someone interacts with the page.

**Player phone — `/play`**
- Join: room code (prefilled from the QR link) + name (+ avatar pick, stretch).
- Waiting: "You're in! Look at the TV."
- Captioning: text box (max ~80 chars), submit button, timer. They can edit until the timer ends.
- Voting: list of captions, minus their own (greyed out / hidden). Tap to vote, can change the vote until time is up.
- Results: "You got N votes, +X points", their rank.
- Reconnect: a token in `localStorage` puts a sleeping or refreshed phone back into the same player slot.

**Host controls — `/host`** (the host, on their phone)
- Gated by a **host PIN**, separate from the room code. The room code is on the TV for everyone, so it can't be the host password.
- Photo queue: thumbnails of preloaded photos plus an **"Upload photo"** button (opens camera roll / camera). She picks the next photo.
- Big context-sensitive buttons: **Start game → Reveal photo → Start captions → Start voting → Show results → Next round / End game.**
- Escape hatches: +30s, skip ahead, hide a caption (moderation), kick/rename a player, reveal who's in the photo, adjust a score.
- Live status: who's joined, who has submitted or voted.

### Game state machine

```
LOBBY ──host:start──▶ PHOTO_REVEAL ──host:next──▶ CAPTIONING
                          ▲                          │ timer ends OR all submitted OR host:next
                          │                          ▼
                     host:nextRound              VOTING
                          │                          │ timer ends OR all voted OR host:next
                     SCOREBOARD ◀──host:next── RESULTS
                          │
                     host:end ──▶ FINAL ──host:reset──▶ LOBBY
```

Rules:
- **Auto-advance** out of CAPTIONING and VOTING when the timer runs out or everyone is done. The host can always advance early or add time. The other steps wait for the host, who controls the pace and the jokes land.
- **Default timers:** captions 75s, voting 30s. Both configurable from `/host`.
- **Captions** are shuffled and anonymized in VOTING. You can't vote for your own caption.
- **Scoring:** 100 points per vote received. +200 bonus if every voter picked your caption (a "clean sweep"). Ties get the same rank.
- **Edge cases:** 0 or 1 captions → skip voting and show "Tough crowd!" Late joiners enter at the next phase and can still caption if CAPTIONING is open. Disconnected players stay on the scoreboard. Duplicate names get a number appended.
- The engine is a **pure function** `(state, event, now) → state`, kept separate from Socket.IO so it can be unit-tested and replayed.

### Photo upload
- **Preload (main path):** before the party, drop photos into `data/photos/` or bulk-upload from `/host`. The host can also put them in order and add the cousin's name on each one, which is optional.
- **Live upload (supported):** `/host` → file input (`accept="image/*"`). On iPhone this converts HEIC to JPEG automatically. The phone resizes the photo to about 1920px on a canvas before uploading, which keeps uploads fast through a tunnel. Then it's `POST /api/photos` (host PIN required), saved to disk, and added to the queue.
- Photos get served from `/photos/<id>.jpg`. The TV and phones preload the next image so the reveal is instant.

### Room code
- 4 letters, generated when the server starts, from an alphabet without lookalike letters (no I, O, L, Q, U, V).
- The TV QR code encodes `<base-url>/play?room=ABCD`, so most people never type it.
- Joining requires a matching code. A wrong code gets "Room not found." That's the only gate, as intended.
- The host PIN is printed in the server console at startup (or set via `HOST_PIN` env var).
- One room per server. Multi-room support isn't needed.

---

## 3. Workstreams

### A. Tech / infrastructure
- [ ] Decide on a quick tunnel or a named tunnel (domain?). Install `cloudflared` on the MacBook.
- [ ] Repo scaffold: `server/` + `client/` (Vite) with a shared `shared/types.ts` for event and state types.
- [ ] `npm run dev` (Vite + server with hot reload) and `npm run start` (production build served by Express).
- [ ] `npm run party` script: build, start the server, start the tunnel, print the URLs, room code, and host PIN.
- [ ] LAN mode: detect the laptop's LAN IP and show it as the fallback QR code on the TV.
- [ ] State snapshot to `data/state.json` and restore on boot.
- [ ] Test the tunnel from a phone **on cellular** (wifi off) on day one.
- [ ] Logistics: HDMI adapter for the MacBook, power cable, macOS "prevent sleep" (`caffeinate -dis`), turn off notifications/Focus, test audio over HDMI.
- [ ] Fallback network kit: phone hotspot or travel router, tested on Saturday.

### B. Game software
- [ ] Shared types: `GameState`, `Player`, `Round`, `Caption`, client→server events, per-role snapshots.
- [ ] Game engine (pure TS) covering the state machine, timers, scoring, and edge cases, with unit tests.
- [ ] Socket layer: join/rejoin with token, role auth (tv / player / host + PIN), per-role snapshot broadcast.
- [ ] Server-side timers (the server decides when time is up; clients just show a countdown from `deadline`).
- [ ] Photo upload endpoint + photo queue management.
- [ ] `/play` screens: join, wait, caption, vote, results.
- [ ] `/host` screens: PIN, lobby/player list, photo queue + upload, phase controls, escape hatches.
- [ ] `/tv` screens: lobby, reveal, captioning, voting, results, scoreboard, final.
- [ ] Moderation: host can hide a caption before voting.
- [ ] Stretch: avatars (pick an emoji/character + color at join), reactions (players tap 😂🔥👏 and they float up on the TV).

### C. Graphics / animation
- [ ] Pick a visual direction: bright, cartoony, "family photo album / scrapbook" theme (polaroid frames, tape, doodles).
- [ ] Game name + logo (AI-generated, then cleaned up).
- [ ] TV backgrounds: lobby and in-round, plus an animated gradient or slow parallax.
- [ ] Polaroid frame for photos, caption card style, timer design (shrinking ring + color change in the last 10s).
- [ ] Transitions: photo reveal (flip/zoom), caption cards dealing in, vote tally counting up, leaderboard reshuffle, confetti.
- [ ] Phone UI: big tap targets, readable in a dim room, same theme.
- [ ] Stretch: avatar set (8–12 characters, AI-generated in one consistent style).
- Tip: generate AI art in one session with one style prompt so everything matches, and export PNG/WebP at 2× size.

### D. Music / sound (stretch, except for a few stingers)
- [ ] Lobby loop (upbeat, ~60–90s, loops cleanly).
- [ ] Captioning "thinking" loop (lighter, with ticking tension near the end).
- [ ] Voting loop (shorter, bouncier).
- [ ] Stingers: photo reveal whoosh, "time's up", vote tally ticks, winner fanfare, final champion fanfare.
- [ ] UI blips on phones (optional, off by default since phones are often on silent).
- [ ] Export from Soundcraft as `.mp3` or `.ogg`, normalized volume, with loop points tested in Howler.
- [ ] Volume and mute controls on `/host`.
- Fallback if time runs out: CC0 tracks/SFX (e.g. from freesound/OpenGameArt) for the stingers, and skip loops.

### E. Testing
- [ ] Unit tests for the engine: every transition, scoring, ties, no-captions, late join, rejoin, self-vote blocked.
- [ ] Bot script: `npm run bots -- 12` spawns N fake players that join, caption, and vote with random delays, to play a full game on the laptop alone.
- [ ] Real devices: iPhone Safari, Android Chrome, an older phone if any relatives have one.
- [ ] Reconnect tests: lock the phone mid-caption, switch apps, toggle wifi↔cellular, refresh the page.
- [ ] Restart test: kill the server mid-round, restart, confirm the game resumes.
- [ ] TV test: real TV, overscan/scaling, text readable from the back of the room, audio over HDMI.
- [ ] Saturday dry run (see milestones), with a written list of what broke.

---

## 4. Milestones

Build time: Mon, Tue, Wed evenings (~3 hrs each) + Saturday. Thu and Fri are off (holiday plans).

### Mon Nov 23: Hosting decided + scaffold up
- Answer the hosting open questions (tunnel type, which laptop drives the TV).
- Scaffold repo, dev scripts, shared types.
- Server + Socket.IO running. `/tv` shows the room code + QR code. `/play` can join by code + name, and the TV lists joined players live.
- `cloudflared` tunnel working: **join from your phone on cellular.**
- ✅ Done when: your phone (cellular) joins and your name appears on the laptop's `/tv`.

### Tue Nov 24: Engine + caption/vote flow
- Game engine with unit tests (all states, scoring).
- `/host` with PIN and phase buttons.
- `/play` caption + vote screens. `/tv` plain screens for each phase (no polish yet).
- Bot script.
- ✅ Done when: one round goes lobby → results with bots + your phone.

### Wed Nov 25: Core loop playable end to end
- Photo preload + live upload from `/host`, photo queue.
- Multi-round, scoreboard, final screen.
- Reconnect/rejoin + state snapshot restore.
- Timers, auto-advance, +30s, skip, hide caption, kick.
- Basic theme applied (colors, fonts, polaroid frame) so it's fun even without full polish.
- ✅ Done when: a 3-round game with real photos, played on 2+ real phones plus bots, survives a phone lock and a server restart. **This is the minimum shippable game.**

### Thu–Fri: off
- Optional, no keyboard needed: send the host the photo request, ask about venue wifi, line up Saturday testers. AI art generation can happen on a phone/tablet if you have a spare moment.

### Sat Nov 28: Polish + full dry run
- Morning: graphics + animations pass (reveal, results, leaderboard, confetti), drop in AI art, add sound stingers / music if ready. Stretch: avatars + reactions.
- Afternoon: **dry run with 3–5 family members on their own phones, with the host driving `/host`** on the real TV setup if possible. Run both the tunnel mode and the LAN/hotspot mode.
- Evening: fix only what broke. **Feature freeze at the end of Saturday.**
- ✅ Done when: the host can run a full game without you touching the laptop.

### Sun Nov 29: Game day
- Before leaving: `git tag game-day`, photos preloaded in order, laptop charged, `npm run party` tested at home.
- Pack: MacBook, charger, HDMI adapter + cable, phone for hotspot, maybe a travel router, printed QR/URL card as backup.
- At the venue (arrive early, ~30 min of setup): connect the TV, check internet, start the tunnel *or* switch to LAN mode, test-join with one phone on wifi and one on cellular, check audio level.
- Run the game. Keep `/host` open on your own phone too, as a backup for the host.

### If you fall behind (cut in this order)
1. Avatars + reactions
2. Music loops (keep 2–3 stingers)
3. Fancy leaderboard animation (a plain sorted list is fine)
4. Live photo upload (preloaded photos only)
5. Moderation/kick extras

Never cut: join by code, reconnect, caption → vote → points, host controls, the LAN fallback.

---

## 5. Open questions / things to provide

**Venue & hardware**
1. Where is the get-together, and how good is the internet (wifi password, speed, cell signal there)?
2. What TV, and does it have HDMI? Do you have the right adapter for the MacBook? Will the sound come through the TV or a separate speaker?
3. Is the MacBook the display laptop? (Assumed yes.)
4. Do you have a domain on Cloudflare (for a named tunnel), or is a quick tunnel fine?

**Photos & content**
5. Who is collecting the childhood photos, and by when? How many rounds? (Suggest 8–12 photos; each round takes ~3–4 min.) Prints that need scanning, or digital already?
6. Should the photo subject be revealed on screen ("It's Cousin Jake!"), and before or after captions?
7. Can the cousin in the photo caption their own photo? (Default: yes, it's funnier.)
8. Content rules: are there young kids playing? Is host-hide-caption enough moderation, or do you want a basic word filter?

**People & roles**
9. Roughly how many players, and age range? Do any kids or older relatives lack a phone (should they pair up and share)?
10. Does the host also want to play, not just host? (Possible: they'd have `/host` and `/play` in two tabs, but it's clunky on one phone.)
11. Is the host comfortable driving it from their phone, or would they rather use a laptop/tablet? What kind of phone do they have?
12. Who test-plays Saturday, and what time? Can the host be one of them so they practice hosting?

**Creative**
13. Game name? (Placeholder ideas: "Cousin Caption Clash", "Who Wore It Worse", "Baby Pictures Don't Lie".)
14. Prizes for the winner (real-world)? It's worth showing on the final screen.
15. Music: how many Soundcraft tracks are realistic before Saturday? Which AI image tool are you using for art?

---

## 6. Repo layout & commands

```
shared/types.ts        THE CONTRACT: state, views, events. Lead owns; change deliberately.
server/index.ts        Express + Socket.IO, room code, join/rejoin, host auth, broadcast
server/views.ts        GameState → TvView / PlayerView / HostView (+ scoreRound)
server/engine.ts       (todo) pure state machine
client/src/main.tsx    path router: /tv, /host, else /play
client/src/socket.ts   shared socket + useView / useConnected / useCountdown hooks
client/src/screens/    Tv.tsx, Play.tsx, Host.tsx (placeholder UIs)
scripts/bots.ts        fake players: npm run bots -- <ROOM> [count] [url]
data/photos/           photos served at /photos/*
```

- `npm run dev`: server :3000 + Vite :5173 (open `localhost:5173/tv`, phones on the same wifi use the LAN URL)
- `npm run party`: production build + server on :3000 with `PUBLIC_URL=https://party.jpatrickbeal.com`
- `npm run tunnel`: `cloudflared tunnel run party`
- Env: `ROOM_CODE`, `HOST_PIN`, `PORT`, `PUBLIC_URL` (all optional; code and PIN are printed at startup)
- Game-day launch: terminal 1 `npm run party`, terminal 2 `npm run tunnel`, TV browser at `localhost:3000/tv`

---

## 7. Agent team

The lead (main session) owns `shared/types.ts`, `PLAN.md`, integration, and merges. Each teammate owns specific files so they don't collide. All work happens in one repo with frequent small commits. To change the contract, a teammate asks the lead.

| Teammate | Owns | Delivers | Depends on |
|---|---|---|---|
| **engine** | `server/engine.ts`, `server/engine.test.ts`, `server/index.ts`, `server/persist.ts`, `scripts/bots.ts` | Pure state machine + tests; server timers + auto-advance; all `host:action`s; caption/vote handlers; `POST /api/photos` + photo queue; `data/state.json` save/restore | contract only |
| **phones** | `client/src/screens/Play.tsx`, `Host.tsx`, `client/src/phone/**` | Every player screen (join, wait, caption, vote, results) and host screen (photo queue + upload with client-side resize, phase buttons, escape hatches, live status) | contract; builds against mock views in `client/src/dev/fixtures.ts` until the engine is ready |
| **tv** | `client/src/screens/Tv.tsx`, `client/src/tv/**`, `client/src/styles.css`, `client/src/theme/**`, `client/public/art/**` | Scrapbook theme, every TV phase screen, animations (reveal, card deal, tally, leaderboard, confetti), theme tokens shared with phones. Writes AI-art prompts for Patrick to generate; uses CSS/SVG placeholders until art arrives. | contract + fixtures |
| **audio** | `client/src/audio/**`, `client/public/audio/**` | Howler audio manager driven by phase changes (loops, stingers, crossfades, mute/volume); a music brief per cue for Patrick to make in Soundcraft; placeholder SFX until real tracks land | contract |
| **qa** (Wed/Sat) | `tests/**`, `docs/DEVICE-CHECKLIST.md` | Playwright end-to-end run (TV + host + bots), reconnect/restart tests, a device checklist for the Saturday dry run | engine + phones |

Notes:
- **Team rules** (ports, git, messaging, file ownership) are in `TEAM.md`.
- **Fixtures are done:** `client/src/dev/fixtures.ts` holds one sample `View` per phase, and `?mock=VOTING` on any screen renders it.
- **Working title: "Throwback Throwdown"**, set in `client/src/brand.ts`. Patrick will choose the final name; changing it is a one-line edit.
- **Audio seam:** `Tv.tsx` calls `useGameAudio(view)` from `client/src/audio/index.ts`. Audio owns everything behind that hook.
- Agents can't drive Soundcraft or an image generator. **Patrick makes the real music and art.** Agents write the briefs and prompts, wire everything up, and ship placeholders, so missing assets never block the game.
- Engine and phones are the **critical path** for Wednesday. TV polish and audio are Saturday-morning work if time is short.
