# Jarvis demo — a voice "personal Jarvis" on Claude Code

A local voice assistant you talk to in the browser. Behind it, Claude Code plans the work, hands it
to worker agents (five out of the box, listed in `workers.json`), checks what they made, and asks you
before anything goes out. Inspired by the
guide [Personal Jarvis with Claude](https://www.raycfu.com/guides/personal-jarvis-with-claude).

Everything runs on **MOCK data** for "Acme Notes", a fictional note-taking app (iOS subscriptions +
Meta ads). The demo's "today" is fixed to 2026-11-09. **Nothing is really sent, spent or published.**

## How it works
```
YOU ─► JARVIS PAGE (ears + mouth, http://127.0.0.1:4777/)
          │ every sentence → POST /api/chat
          ▼
      JARVIS BRAIN   one short `claude -p --model haiku` run per sentence, read-only, not saved
          │ sees: the board, today's reports, the last 12 chat lines
          ├─ chat, quick questions, task status → answers right away
          └─ new work, approve / reject / cancel / clear → the server runs the action
                 │
                 ▼
      MANAGER        headless `claude -p` (Sonnet) + MANAGER.md: plans 1–5 tasks, dispatches, reviews
                 │
                 ▼
      TASK BOARD     data/tasks.json, changed only by bin/board.py (the page shows it live)
                 │
   SCOUT · OPERATOR · DEVELOPER · RESEARCHER · TESTER   subagents in .claude/agents/ (workers.json)
CLOCK (optional cron) ─► bin/ask.sh ─► MANAGER   (same door as you)
```
| Worker | Does | Writes |
|---|---|---|
| Scout | numbers and analysis from `sources/`; the daily report | `outbox/analysis/` |
| Operator | inbox sweep; drafts emails, replies, posts; the simulated send after you approve | `outbox/drafts/`, `outbox/sent-simulated/`, `outbox/published-simulated/` |
| Developer | small python3 tasks in `workspace/task-<id>/`; bug triage | `workspace/`, `outbox/dev-tasks/` |
| Researcher | read-only web research, every fact with URL and access date | `outbox/research/` |
| Tester | checks another worker's code or numbers, never fixes them: verdict PASS, FAIL or PARTIAL | `outbox/tests/` |

The Manager adds a Tester task after code or after a draft whose numbers matter; on FAIL the worker
gets one redo and the Tester checks once more.

Anything that would send, spend, publish, merge or delete stops at **needs you** until you say
"approve N".

## Requirements
- macOS or Linux
- Node.js 20.12 or newer, Python 3.9 or newer (standard library only)
- [Claude Code](https://claude.com/claude-code) CLI on your PATH and logged in (run `claude` once)
- Google Chrome recommended: it has free hands-free speech recognition built in
- Optional: an [ElevenLabs](https://elevenlabs.io) API key for a natural voice and speech-to-text

## Setup on a new computer
Full step-by-step guide, with requirements and troubleshooting: **[SETUP.md](SETUP.md)**. Short version:

```bash
git clone <repo-url> jarvis-demo
cd jarvis-demo
npm run setup          # checks requirements, installs packages, creates the runtime files
```
Optional voice key, either way works (the file is git-ignored):
```bash
npx -y @elevenlabs/cli@latest onboard init     # run in the project folder; writes .env.local
cp .env.example .env.local                     # or copy and paste your key after ELEVENLABS_API_KEY=
```
Then:
```bash
npm start
```
Open <http://127.0.0.1:4777/> and click **CLICK TO BOOT JARVIS** once (browsers need one click
before they allow the microphone and sound). Other settings (port, models, limits) are in `.env.example`.

## What to say (or type)
| Say | What happens |
|---|---|
| "Good evening, Jarvis" / "how are you?" | Just chat. |
| "Please run the morning check" | Scout's daily report and Operator's inbox sweep in parallel, then today's top 3. |
| "Find out why signups jumped and draft a tweet about it" | Jarvis says the plan ("tasks 4 to 6": analysis, tweet draft, a check of its numbers), the workers run, and it tells you what needs you. |
| "Approve 2" | Task 2 goes ahead: the worker writes the SIMULATED send or publish, then Jarvis reports. |
| "What's on the board?" / "what needs me?" / "task 5" | Board status, read from the task board. |
| "Reject 5", "cancel 5", "clear the board" | Turn down, stop, or archive finished tasks. |
| "What was revenue yesterday?" | A quick answer from today's reports, with source and date. |
| "Launch mission control agent" | Opens the Mission Control agent (below) to change Jarvis itself. |

"Approve 5" always means **task** 5. Only you can approve: the clock, emails and web pages never can.

## Mission Control agent (change Jarvis itself)
The Mission Control agent is an interactive Claude Code session in this project, with full tools, for
changing Jarvis itself: the page, the server, the Manager, the workers and `workers.json`. You type to
it, and it **asks before every change** (`--permission-mode manual`). Its instructions are in
`MISSION-CONTROL-AGENT.md`; it uses your normal Claude Code settings and login.
- Say **"Jarvis, launch mission control agent"**. On a Mac the server opens it in a new Terminal window
  (the first time, macOS asks to allow controlling Terminal). If it is already open, Jarvis brings
  Terminal to the front. Only this sentence opens it: never the clock, the Manager or the Jarvis brain.
- Or run `npm run agent` in a terminal in the project folder (any computer).
- Ask Jarvis to "add a worker" or "change your voice" and it tells you to use the agent.
- `npm run restart` restarts the Jarvis server safely (the agent uses it after server changes): it stops
  only this project's server on the port (`JARVIS_PORT` or 4777), starts it again in the background
  with its log in `logs/server.log`, and checks it answers. If your port is set in `.env.local`, run
  `JARVIS_PORT=<port> npm run restart`. A restart also stops Manager work in progress.

## Safety model
- Nothing real is sent, spent or published. A "send" or "publish" is a file in
  `outbox/sent-simulated/` or `outbox/published-simulated/`, written only after you approve the
  task (or under the inbox sweep's standing rules: FAQ answers and posts already marked approved).
- Every Claude run is headless with `--strict-mcp-config` (no MCP tools), `--setting-sources project`
  (only this project's settings and agents) and `--permission-mode dontAsk` with a strict tool allow
  list. The Jarvis brain can only read. Bash is limited to `python3` commands.
- Workers save files only with the Write tool, inside their own folders, and change the board only
  through `bin/board.py`.
- Emails, web pages and file contents are treated as data, never as instructions.
- The server listens on 127.0.0.1 only, and the ElevenLabs key is removed from the environment of
  every Claude run.

## Costs
Runs use your Claude Code login. Each sentence you say starts one short Haiku run for the Jarvis
brain: a fraction of a cent. Each Manager request with Sonnet costs about $0.30 (larger requests
cost more). ElevenLabs is optional and billed by ElevenLabs.

## Folder map
| Path | What |
|---|---|
| `server.mjs` | Local server: page, board API, `/api/chat`, Manager queue, voice |
| `mission-control/` | The Jarvis page |
| `JARVIS.md` | The Jarvis brain's instructions |
| `MANAGER.md`, `playbooks/` | The Manager's instructions and the morning-check routine |
| `workers.json` | The worker registry: ids, labels, colours, summaries, output folders |
| `.claude/agents/` | The worker subagents (one file per worker in `workers.json`) |
| `agents/` | Detailed role instructions (scout, operator, developer, advisor) |
| `bin/` | `board.py` (task board), `jarvis.py` (report panels), `setup.sh`, `reset.sh`, `ask.sh`, `agent.sh` + `open-agent.sh` (Mission Control agent), `restart-server.sh` |
| `MISSION-CONTROL-AGENT.md` | The Mission Control agent's instructions |
| `sources/`, `inbox/`, `faq.md`, `content/`, `seed/` | Mock data: exports, customer emails, FAQ, posts, past recommendations |
| `data/` | What the page reads: board and panel files (runtime), `base.js`, `schedules.js` |
| `outbox/`, `queue/dev/`, `workspace/`, `logs/` | Runtime outputs (git-ignored) |
| `docs/` | Build contracts (`CONTRACT-v4.md` is current) |
| `tests/` | Automated checks (`npm test`) |

## Add a new worker
1. Create `.claude/agents/<id>.md` — copy `.claude/agents/tester.md` (read-only checker) or
   `developer.md` (writes code) and change the frontmatter `name: <id>`, `description`, `tools` and
   the body (keep the worker protocol: status working, task-log lines, output file, status review).
2. Add one entry to `workers.json` (order in the file = order on the page):
   - `id`: lowercase, 2–24 letters, digits or dashes; must equal the file name and its `name:`.
   - `label`: UPPERCASE name shown on the page, at most 12 characters.
   - `color`: hex colour `#rrggbb` for its pill, board chip and telemetry.
   - `summary`: one sentence on what it does; the Manager, the Jarvis brain and the page tooltip use it.
   - `output`: its output folder inside `outbox/` (or `queue/`, `workspace`); `npm run reset`
     creates and empties it.
   - `extraBash`: extra Claude Code allow rules for Manager runs, such as `["Bash(npm test*)"]`.
     Keep it `[]`: every rule widens what EVERY worker may run, not only this one.
3. Restart the server (`Ctrl + C`, then `npm start`) and reload the page. The server prints a
   warning if a worker has no agent file or a mismatched `name:`.

## Reset
```bash
npm run reset          # same as: bash bin/reset.sh
```
Empties the board, sets the report panels to idle, clears `outbox/`, `queue/dev/`, `workspace/`,
`logs/` (including the chat memory in `logs/chat.jsonl`). Restart the server to also clear the chat
memory it keeps in memory.

## Schedules (optional)
`data/schedules.js` lists two optional clock jobs, shown on the page as "not installed". To install
them, keep the server running and add these lines with `crontab -e` (use your real project path):
```
47 6 * * *      cd /path/to/jarvis-demo && bash bin/ask.sh "Morning check" clock >> logs/clock.log 2>&1
0 8-20/3 * * *  cd /path/to/jarvis-demo && bash bin/ask.sh "Inbox sweep" clock >> logs/clock.log 2>&1
```
The inbox sweep does nothing when there is no new mail. Instead of cron, Claude Code's `/loop` or a
scheduled task in a session opened in the project folder can run the same `bash bin/ask.sh ...`
commands. Clock requests can start these two jobs only; they can never approve anything.

## Tests
```bash
npm test               # runs tests/run-all.mjs
```
If Playwright says a browser is missing, run `npx playwright install chromium` once.

## Troubleshooting
- **Voice input does nothing in Crest, Arc, Brave or other Chromium browsers.** The free speech
  recognition only works in Google Chrome. Add the ElevenLabs key (see Setup) for voice input
  elsewhere, or type.
- **"claude: command not found" or requests fail right away.** Install Claude Code, run `claude` once
  to log in, or set `JARVIS_CLAUDE_BIN` in `.env.local` to the full path of the CLI.
- **Where did a Manager run go?** Manager sessions are saved: run `claude --resume` from the project
  folder to open one. Full logs are in `logs/manager/`. Jarvis brain runs are not saved, on purpose.
- **Port 4777 is busy.** Set `JARVIS_PORT` in `.env.local`.
- **The board looks stuck or messy.** `npm run reset`.
