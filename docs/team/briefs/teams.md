# Brief: TEAM MODE (top priority, all teammates)

the host (the host) wants **teams**: about 25 people in **5 teams**, one photo at a time,
with a vote after each photo. Each team sends **one** caption per photo, so every round has
~5 captions (quick to read and vote on). Individual mode stays as a setting (`settings.teamMode=false`).

## Rules (decided by Patrick)
- **Assignment:** automatic, in join order: the Nth player to join goes to team `N mod teamCount`
  (balanced). Keep this in **one function** (`assignTeam`) because the host may change it to an
  auto-shuffle. The host can move a player (`moveToTeam`) or `shuffleTeams` (random, balanced).
  Rejoining keeps your team. Changing `teamCount` in the lobby rebuilds teams (reassign everyone).
- **Team caption:** any member can submit, and a later submission **replaces** the team's caption.
  `Caption.teamId` = team, `Caption.playerId` = last editor. Every member's phone shows the team's
  current caption and who last edited it (`myCaption`, `myCaptionEditedBy`).
  CAPTIONING auto-advances when every team with ≥1 connected member has a caption (or on timeout).
- **Voting:** everyone votes individually, but **not for their own team's caption** (`myCaptionId`
  is the team caption id, so phones disable it). VOTING auto-advances when every connected player
  who has a votable option has voted.
- **Scoring:** `POINTS_PER_VOTE` per vote goes to the **team** (`Team.score`). `SWEEP_BONUS` if
  ≥2 voters and all eligible voters chose it. Player.score is unused in team mode.
- **Team names:** presets from `TEAM_PRESETS` (name + color). Any member can rename their team
  (`player:renameTeam`, trimmed, ≤24 chars); the host can too (`renameTeam`).
- Moderation, timers, photos, reset (reset keeps teams but zeroes team scores), and persistence all still apply.

## Contract (already committed in shared/types.ts by the lead)
`Team`, `TeamView` (with `memberIds`), `Player.teamId`, `Caption.teamId`,
`ScoredCaption.teamId/teamName`, `RoundView.submittedTeamIds`, `BaseView.teams`,
`PlayerView.myTeam/myCaptionEditedBy`, `Settings.teamMode/teamCount`,
`HostAction` `moveToTeam`/`shuffleTeams`/`renameTeam`, `player:renameTeam`, `TEAM_PRESETS`,
and `DEFAULT_SETTINGS` (teamMode true, 5 teams). Fixtures default to team mode with 25 players
and 5 teams; add `?solo=1` for individual mode.

## Per teammate
- **engine:** implement all of the above in engine.ts (+ tests for assignment, replace-caption,
  own-team vote block, team scoring/sweep, auto-advance, move/shuffle/rename, teamCount change,
  reset, persistence of teams), views.ts (teams, submittedTeamIds, team fields on results,
  myTeam/myCaptionEditedBy/myCaptionId = team caption), validation for the new payloads, and bots
  (bots in team mode: several teammates may submit; fine). Then do a 25-bot, 5-team full game.
  Your QA tasks (e2e spec, DEVICE-CHECKLIST) come after this.
- **tv:** team-first UI. LOBBY shows the 5 teams as columns/cards with members popping into them.
  CAPTIONING shows team chips flipping to ✓. VOTING shows ~5 big cards. RESULTS reveals the
  **team name** as the author (small "written by <last editor>" is optional). SCOREBOARD/FINAL rank
  **teams** (podium = teams, with member names). Add per-team color tokens (`--team-0..7`) matching
  `TEAM_PRESETS` colors. Keep individual mode working (`?solo=1`).
- **phones:** join shows "You're on <Team>" (team color) after joining. A lobby/team card lists
  teammates, with a rename-team action (inline edit). CAPTIONING shows the team's current caption
  ("Written by Maddie, tap to replace"), and submitting replaces it. VOTING disables your team's card
  ("your team"). Results/scoreboard are team-centric ("Your team got 9 votes, +900"). Host: team
  setup section (teams with members; move a player via a team picker per player; Shuffle teams
  with inline confirm; rename team; teamMode toggle + teamCount in Settings, lobby only).
  Status shows "3 of 5 teams have a caption".
