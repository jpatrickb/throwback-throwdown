# Team rules — read before touching anything

Read `PLAN.md` first (§2 architecture, §7 team). This file is how we keep
four agents working in one repo without stepping on each other.

## Who's who
| Session | tmux window | Ports (vite / api) |
|---|---|---|
| **lead** (session name `cousin-party`) | 1 | 5173 / 3000 |
| **engine** | `engine` | — / 3100 |
| **phones** | `phones` | 5201 / 3201 |
| **tv** | `tv` | 5301 / 3301 |
| **audio** | `audio` | 5401 / 3401 |

Run your dev server on your own ports: `VITE_PORT=5201 API_PORT=3201 npm run dev`
(engine: `PORT=3100 npx tsx watch server/index.ts`). Never kill processes you
didn't start. Never use ports 3000/5173.

## File ownership
Only edit files you own (see PLAN.md §7). If you need a change in someone
else's file, message them (or the lead). Shared files owned by the lead:
`shared/types.ts`, `client/src/socket.ts`, `client/src/main.tsx`,
`client/src/dev/fixtures.ts`, `client/src/brand.ts`, `package.json`,
`vite.config.ts`, `tsconfig.json`, `PLAN.md`, `TEAM.md`.

- **Contract changes** (`shared/types.ts`): message the lead with the exact change. Don't edit it yourself.
- **New npm packages:** already installed: `motion`, `canvas-confetti`, `howler`, `multer`, `@playwright/test`. Need something else? Ask the lead. Never run `npm install` yourself.

## Git
- Commit small and often, **only your own files**: `git add <explicit paths>`. Never `git add -A` / `git add .`, never `git commit -a`.
- Message prefix: `[engine]`, `[phones]`, `[tv]`, `[audio]`. End with the `Co-Authored-By` trailer from your system instructions.
- Before committing: `npm run typecheck` must pass. Don't run `npm run build` (it shares `dist/`), because the lead does builds.
- No branches, no rebases, no pushes. If `git commit` fails because of the index lock, wait a few seconds and retry.

## Talking to each other
- Use `SendMessage` to the session name (`cousin-party` for the lead, or `engine`, `phones`, `tv`, `audio`). Use `ListAgents` if a name doesn't resolve.
- Message the lead when you finish a milestone, get blocked, or need a contract change. Keep messages short.
- Keep a running status in `docs/team/<your-name>.md`: what's done, what's next, open questions for Patrick. The lead reads these.
- **Patrick is away in meetings.** Don't wait on him. Make a sensible, easy-to-change choice and write the question in your status file under "Questions for Patrick".

## Design principles (Patrick's ask: "modular and easy to change")
- Brand name and copy come from `client/src/brand.ts`. Never hardcode the game name.
- Colors, fonts, radii and timings live in theme tokens (CSS custom properties in `client/src/theme/`), not inline in components.
- Art and audio go in a manifest: one file that maps cue/asset keys to file paths, so swapping in Patrick's real art or music is a one-line change.
- Placeholders are fine and expected. Missing assets must never break the game.

## UI dev without a server
Every screen supports `?mock=<PHASE>` (LOBBY, PHOTO_REVEAL, CAPTIONING,
VOTING, RESULTS, SCOREBOARD, FINAL) using `client/src/dev/fixtures.ts`.
`/play?mock=VOTING&mockme=p3` picks which player "you" are.
Use the browser tools (Playwright MCP or the agent-browser skill) to screenshot
your work. TV at 1920×1080, phones at 390×844.
