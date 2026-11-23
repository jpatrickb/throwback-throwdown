# Build log

This folder is the behind-the-scenes record of how Throwback Throwdown was built with
[Claude Code](https://claude.com/claude-code) in about two days, a few days before a real family party.
It's kept as written at the time (lightly edited for privacy), so some paths and plans are out of date.

| File | What it is |
|---|---|
| [PLAN.md](PLAN.md) | The original plan: hosting choice, architecture, state machine, workstreams, milestones, and the decisions made along the way |
| [TEAM.md](TEAM.md) | Rules for the agent team: file ownership, ports, git etiquette, how to coordinate |
| [team/briefs/](team/briefs/) | The brief each agent received (engine, phones, tv, audio, plus later ones for team mode and the settings/audio seam) |
| [team/engine.md](team/engine.md), [phones.md](team/phones.md), [tv.md](team/tv.md), [audio.md](team/audio.md) | Each agent's running status log: what it built, how it verified it, and open questions |

## How the team worked

1. A **lead** agent wrote the plan, scaffolded the repo, and defined the shared contract (`shared/types.ts`)
   plus mock data for every screen, so no one had to wait on anyone else.
2. Four **teammate** agents worked in parallel, each owning its own files:
   - **engine:** the pure game-state reducer, timers, persistence, photo upload, load-testing bots, Playwright end-to-end tests
   - **phones:** the player and host phone screens
   - **tv:** the visual theme and every animated TV screen
   - **audio:** a MIDI composer that renders the soundtrack and effects in Soundcraft, plus the phase-aware audio engine
3. The lead integrated their work, ran the build, tests and end-to-end tests at each check-in, and relayed
   playtest feedback ("use teams of five", "no game text on the photo", "music shouldn't play over sound effects").

Commits are prefixed with the agent that made them (`[engine]`, `[phones]`, `[tv]`, `[audio]`, `[qa]`).
