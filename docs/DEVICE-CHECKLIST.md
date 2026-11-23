# Device checklist — Saturday dry run (Nov 28) + game-day runbook

Print this or keep it open on a laptop. Tick boxes as you go and write anything that breaks in the
**Problems** table at the bottom. Fix only what breaks; feature freeze is end of Saturday.

**Setup for the dry run:** MacBook on HDMI to the real TV if possible. the host on her iPhone as host.
3–5 family members on their own phones (at least one iPhone and one Android). Run the bots for extra players:
`npm run bots -- <ROOM> 15 https://party.jpatrickbeal.com` (bots join through the public URL like real phones).

---

## 0. Before anyone arrives (10 min)

- [ ] `git pull`, then `npm test` passes, then `npx playwright test -c tests` passes (both chromium and webkit).
- [ ] Clear old test photos: move anything in `data/photos/` that isn't a real family photo somewhere else
      (files left in that folder get added to the queue on every start).
- [ ] Start fresh: `RESET_STATE=1 npm run party` (terminal 1) and `npm run tunnel` (terminal 2). See §5.
- [ ] Write down the **room code** and **host PIN** printed by terminal 1.
- [ ] On the laptop, open `http://localhost:3000/tv` in Chrome. Click "Click to start the party!" so audio is allowed.

## 1. Host: the host's iPhone (Safari), the top priority

- [ ] Open `https://party.jpatrickbeal.com/host` in Safari on **cellular** (wifi off). The page loads.
- [ ] The button changes from "Connecting…" to "Enter" within a few seconds.
      (A WebKit bug could leave it stuck on "Connecting…". If you see that, the fix in `client/src/socket.ts` is missing. See docs/team/engine.md.)
- [ ] Wrong PIN → "Wrong PIN" message. Right PIN → host controls appear.
- [ ] **Add to Home Screen** (Share → Add to Home Screen), open it from there, and confirm it still logs in.
- [ ] **Photo upload from the camera roll:** pick 3+ photos at once, including an iPhone HEIC photo and a
      portrait one. The progress bar runs, the photos show up in the queue, and on the TV they're right-side-up (not rotated).
- [ ] Upload one photo **taken with the camera** right then from the upload button.
- [ ] Reorder photos (↑/↓) and remove one (with the inline confirm).
- [ ] **Teams:** 5 teams show with members. Move a player to another team, rename a team, and Shuffle (with confirm).
      Settings: switch teams off and on, and change the team count (lobby only).
- [ ] **The giant button** walks through a whole round: Start game → Start captions → Start voting → Show results →
      Scoreboard → Next photo. It's easy to hit with a thumb, and a double tap doesn't skip two steps.
- [ ] +30s and Skip work during captions and voting. "End game now" asks to confirm.
- [ ] Moderation: hide a caption during voting. It disappears from the TV and phones.
- [ ] **Screen stays awake:** leave the host page open without touching it for 3+ minutes during a round. The screen
      shouldn't dim or lock. (Uses Screen Wake Lock, which needs iOS 16.4+ and HTTPS, so it works on the tunnel URL but
      **not** on the LAN `http://` URL. In LAN mode, or if it locks anyway: Settings → Display & Brightness →
      Auto-Lock → Never, and turn off Low Power Mode.)
- [ ] Lock the iPhone for 30s, unlock it. The host page reconnects without asking for the PIN again.
- [ ] Switch to another app and come back. Same.
- [ ] Text is readable for the host without zooming, and nothing gets cut off by the notch or home bar.

## 2. Players: iPhone (Safari) and Android (Chrome)

Do each on at least one iPhone and one Android.

- [ ] **Join by QR:** point the camera at the TV QR code, tap the link, and the room code is already filled in. Enter a name, pick an avatar, Join.
- [ ] After joining: "You're on <Team>" in the team color, teammates listed. Renaming the team works.
- [ ] Join by typing the URL + room code by hand (for anyone whose camera won't scan).
- [ ] Two people with the same name both get in (the second one shows as "Name 2").
- [ ] **Captioning:** type a caption, submit. A teammate sees "Written by <you>" and can replace it.
      The TV team chip flips to ✓.
- [ ] **Lock the phone mid-caption** (after typing, before submitting) for 20s, then unlock. The phone shows the
      current phase, and submitting still works (or it shows that time is up).
- [ ] **Switch wifi ↔ cellular** mid-round (toggle wifi off, then back on). It reconnects within a few seconds as the same
      player with the same team, and nothing is lost.
- [ ] **Refresh the page** mid-round. Same player, same team, no re-join prompt.
- [ ] **Close the browser tab completely** and reopen the link. Rejoins as the same player.
- [ ] **Voting:** your own team's card is disabled ("your team"). Tap to vote, tap another to change.
- [ ] Results and scoreboard: "Your team got N votes, +X", team rank.
- [ ] Reactions (😂🔥👏…) on reveal/results/scoreboard float up on the TV.
- [ ] Late joiner: someone joins in the middle of a round. They land on a team and can caption/vote right away.
- [ ] Host kicks a player. Their phone shows a "kicked" screen.
- [ ] Phone on silent: nothing weird. Phone with sound: no unexpected noise.
- [ ] Older or small phone (if a relative has one): everything fits, and the buttons are big enough.

## 3. TV (MacBook → HDMI)

- [ ] HDMI connected. In System Settings → Displays: mirror or extend, resolution set so the picture fills the TV
      (no black border, no edges cut off by overscan; if edges are cut off, use the TV's "Just Scan"/"Screen Fit" setting).
- [ ] **Audio over HDMI:** System Settings → Sound → Output → the TV. Lobby music plays, and the volume is set from the TV remote.
- [ ] **Fullscreen:** Chrome → View → Enter Full Screen (⌃⌘F). Also View → uncheck "Always Show Toolbar in Full Screen".
- [ ] Mouse cursor parked out of sight. Notifications off (Focus → Do Not Disturb). `caffeinate -dis` running in a third
      terminal so the Mac never sleeps.
- [ ] **Readability from the back of the room:** stand where the farthest person will sit. Can you read the room code,
      the timer, a full 80-character caption on a voting card, team names on the scoreboard?
- [ ] QR code scans from across the room (try from 3–4 meters).
- [ ] 25+ people in the lobby: everyone fits on screen, and the team columns aren't cut off.
- [ ] Results reveal and podium animations play smoothly (no stutter). The champion name fits on screen
      (a long team name like "Team Scrunchie" overflowed at 1920px in testing).
- [ ] Unplug the MacBook charger for 1 min: no sleep or dimming. Plug it back in.

## 4. Failure drills (do these once with everyone watching)

- [ ] **Server restart mid-round:** in terminal 1 press Ctrl+C during captioning, then run `npm run party` again
      (**without** `RESET_STATE`). Same room code, same PIN, phones reconnect by themselves, scores kept, the timer gets ~20s of grace.
      Reload the TV page if it doesn't recover by itself.
- [ ] **Tunnel drop:** Ctrl+C in terminal 2 for 20s, then `npm run tunnel` again. Phones reconnect.
- [ ] **LAN fallback (no internet):** turn on the phone hotspot, connect the MacBook and 2 phones to it, then run
      `npm run build && npm run start` (no `PUBLIC_URL`). The TV QR now shows `http://<laptop-ip>:3000/play?room=…`.
      Join from a phone on the hotspot.
- [ ] the host's phone dies: open `/host` on your own phone with the same PIN. Both can host at once.

---

## 5. Game-day launch runbook (Sun Nov 29)

**At home before leaving**
1. `git tag game-day` on the version that passed Saturday.
2. Put the real photos in `data/photos/` (named `01 - anything.jpg`, `02 - ….jpg`… to set the order), or plan for the host to
   upload them at the venue. JPEG/PNG/WebP only. HEIC files in the folder are skipped, but HEIC uploaded from the iPhone is fine.
3. Charge everything. Pack: MacBook + charger, HDMI cable/adapter, phone for the hotspot, printed QR/URL card.

**At the venue (arrive ~30 min early)**
1. Connect HDMI, set audio output to the TV, check that the venue internet works.
2. Terminal 1: `RESET_STATE=1 npm run party`
   (builds, then serves on :3000 with `PUBLIC_URL=https://party.jpatrickbeal.com`).
   `RESET_STATE=1` starts a **fresh** game. Use it only for this first start, never after a crash (see below).
   Optional: `HOST_PIN=123456 ROOM_CODE=FAMS RESET_STATE=1 npm run party` to choose the PIN and room code yourself.
3. Terminal 2: `npm run tunnel` (named Cloudflare tunnel `party` → localhost:3000).
4. Terminal 3: `caffeinate -dis`
5. Chrome on the MacBook: `http://localhost:3000/tv`, then fullscreen and click "Click to start the party!".
6. Write down from terminal 1:
   - **Room code:** `____`
   - **Host PIN:** `______`
   - Player URL: `https://party.jpatrickbeal.com/play?room=<CODE>` (it's what the QR on the TV encodes)
   - Host URL: `https://party.jpatrickbeal.com/host`
7. Test-join with one phone on wifi and one on cellular. the host logs in on her iPhone and uploads or checks the photos.
8. Check that teams look right (5 teams by default), then **Start game**.

**If something goes wrong**

| Problem | Do this |
|---|---|
| Server crashed or got closed | `npm run party` again, **without** `RESET_STATE`. Same room code, PIN, players, scores. |
| Phones can't reach the site | Check terminal 2 (tunnel). Restart it with `npm run tunnel`. Test `https://party.jpatrickbeal.com/api/health`. |
| Venue internet is down | LAN fallback: hotspot → `npm run build && npm run start` → everyone joins the hotspot and scans the new QR. |
| A phone shows the wrong screen | Refresh that phone. It rejoins as the same player. |
| The TV is stuck or blank | Reload `localhost:3000/tv` and click the start overlay again. |
| the host is locked out ("Too many tries") | Wait 1 minute. The PIN is printed in terminal 1. |
| Want a brand-new game after the final | Host → New game (keeps players and teams, zeroes scores, photos unused). |

---

## Problems found

| # | Device / browser | What happened | Steps to reproduce | Fixed? |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
