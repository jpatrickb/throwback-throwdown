# engine (+ qa) — status

SendMessage to team-lead / phones / tv / cousin-party keeps failing ("Failed to write to inbox"), so everything is in this file.

## ✅ Resolved by lead in 015becb (was: needs the lead, client/src/socket.ts)
**On WebKit / iPhone Safari, `/host` can stay stuck on a disabled "Connecting…" button even though the socket is connected.**
`useConnected()` misses a `connect` event that fires between `useState(socket.connected)` and the effect subscribing.
WebKit reliably hits that window, so this would block the host on their iPhone. Fix (verified in WebKit, then reverted because it's your file):

```diff
     socket.on('connect', on);
     socket.on('disconnect', off);
+    setConnected(socket.connected); // catch a connect that happened before this effect subscribed
     return () => {
```
Until this lands, the `webkit-iphone-host` e2e project fails at the PIN screen (that's the test doing its job). With the fix, both projects pass.

Also for the lead: add `test-results/` (or `tests/test-results/`) to `.gitignore`, and optionally `"e2e": "playwright test -c tests"` to package.json.
I installed the Playwright chromium headless shell v1255 (`npx playwright install chromium`, a browser download, not an npm package), which @playwright/test 1.65.1 needed.

## Team mode — done (530a644)
- `engine.ts`: `assignTeam` (one function: smallest team, ties to the lowest team number, which equals join-order round-robin and stays balanced after kicks),
  rebuild on teamCount/teamMode change (lobby only; surviving teams keep names and scores), shared team caption (a later submit replaces it,
  `playerId` = last editor), own-team vote block, CAPTIONING auto-advances when every team with a connected member has a caption,
  VOTING waits for every connected player who has something to vote for, team scoring + sweep (≥2 votes and every eligible voter chose it),
  `moveToTeam` (drops a vote that now targets your own team), `shuffleTeams` (seeded and balanced; LOBBY/RESULTS/SCOREBOARD/FINAL only), `renameTeam` (host) and
  `player:renameTeam` (member), ≤24 chars. Reset keeps teams and zeroes team scores. `normalizeState` upgrades old state.json files.
- `adjustScore` in team mode goes to the team: `playerId` may be a **team id** or a member's id. (phones: ±100 per team is possible without a contract change.)
- Views: `teams` (score desc, members in join order), `submittedTeamIds`, team fields on results, `myTeam`, `myCaption`/`myCaptionId` = team caption,
  `myCaptionEditedBy`. Player ids are now `p` + 7 hex characters, so object key order = join order.
- Individual mode still works (`settings.teamMode=false`, bots `--solo`).
- 57 engine tests (19 team). 25 bots / 5 teams / 4 rounds on a production build: 5 captions per round, 0 errors, ack p95 15ms.

## Stress test (prod build, own port + DATA_DIR) — a94ade9
| Run | Result |
|---|---|
| 25 bots, 3 rounds | 0 errors, ack p50 7ms / p95 21ms, RSS ~94MB, CPU peak 7% |
| 30 bots, 10 rounds | 671 acks, 0 errors, p95 13ms, RSS ≤87MB (flat), CPU peak 18% |
| 30 bots, 20% idle (timer path), reconnect churn, 12s/8s timers, 10 rounds | all rounds ended on the timer as expected; RSS ≤107MB; 148 recoverable errors ("Join first" from emits buffered while offline, "Voting is closed" from late votes); bots retried and finished |
| 25 bots, 5 teams | 0 errors after fixing a bot-side double-vote race |

No server changes were needed for load. Bots changed: stats at FINAL, `--lazy F`, `--churn`, `--timers C,V`, `--solo`, `--teams N`, `--quiet`;
stale-action guard; the host waits only for *connected* players, tops up photos, and resets a finished game. Player cap raised to 80 (it counts disconnected players).
Server: `CLIENT_DIST` env serves a build from another folder (so QA never touches `dist/`).

**Phones, take note:** after a reconnect, Socket.IO sends emits buffered while offline *before* your `player:join` rejoin,
so they get "Join first". If a caption/vote ack says "Join first", rejoin and resend.

## QA deliverables
- `tests/e2e.spec.ts` + `tests/playwright.config.ts` (ceeb961): own servers on :3120/:5120 with a temp DATA_DIR. TV at 1920×1080. Host on a
  Pixel 7 (chromium) and an iPhone 13 (webkit): wrong PIN shows an error, right PIN logs in, uploads 2 photos through the real file picker
  (client resize + POST). Then bots (8, 3 teams) play and drive the host. Asserts that captioning → voting → results → FINAL each show on the TV, the bots exit 0, and there are no page errors.
  Screenshots go to `tests/test-results/`. Run: `npx playwright test -c tests`.
- `docs/DEVICE-CHECKLIST.md` (bb55be5): iPhone host, iPhone/Android players, TV, failure drills, game-day runbook.
- Host PIN now survives restarts (7e1e47a): it's saved in state.json and reused unless `HOST_PIN` or `RESET_STATE=1` is set, so a mid-game crash
  doesn't log the host out.

## For tv
- On the FINAL screen at 1920px, "Champion: Team Scrunchie" runs off the right edge (seen in the e2e screenshot).
- `reaction` events go to TV sockets only, rate-limited to 6 per 3s per player.

## Running instances
- :3100: my dev server (`tsx watch`), room ENGN, PIN 123456, data in my scratchpad.

## Questions for Patrick (resolved)

_Answered by Patrick on Nov 23. See PLAN.md "Decisions": berry theme stays the default, LAN URL only in settings, music waits for stingers, join-order teams with shuffle/move._
- "Per-photo mode" (Nov 23 note) was superseded by teams. Individual mode still works if he wants it back.
- Should teams be auto-shuffled at the start instead of assigned in join order? It's a one-function change (`assignTeam` in server/engine.ts).
