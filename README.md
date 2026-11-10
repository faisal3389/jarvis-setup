# Jarvis demo — a voice "personal Jarvis" on Claude Code

A local voice assistant you talk to in the browser. Behind it, Claude Code plans the work, hands it
to four worker agents, checks what they made, and asks you before anything goes out. Inspired by the
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
      MANAGER        headless `claude -p` (Sonnet) + MANAGER.md: plans 1–4 tasks, dispatches, reviews
                 │
                 ▼
      TASK BOARD     data/tasks.json, changed only by bin/board.py (the page shows it live)
                 │
   SCOUT · OPERATOR · DEVELOPER · RESEARCHER   Claude Code subagents in .claude/agents/
CLOCK (optional cron) ─► bin/ask.sh ─► MANAGER   (same door as you)
```
| Worker | Does | Writes |
|---|---|---|
| Scout | numbers and analysis from `sources/`; the daily report | `outbox/analysis/` |
| Operator | inbox sweep; drafts emails, replies, posts; the simulated send after you approve | `outbox/drafts/`, `outbox/sent-simulated/`, `outbox/published-simulated/` |
| Developer | small python3 tasks in `workspace/task-<id>/`; bug triage | `workspace/`, `outbox/dev-tasks/` |
| Researcher | read-only web research, every fact with URL and access date | `outbox/research/` |

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
| "Find out why signups jumped and draft a tweet about it" | Jarvis says the plan ("tasks 4 and 5"), the workers run, and it tells you what needs you. |
| "Approve 2" | Task 2 goes ahead: the worker writes the SIMULATED send or publish, then Jarvis reports. |
| "What's on the board?" / "what needs me?" / "task 5" | Board status, read from the task board. |
| "Reject 5", "cancel 5", "clear the board" | Turn down, stop, or archive finished tasks. |
| "What was revenue yesterday?" | A quick answer from today's reports, with source and date. |

"Approve 5" always means **task** 5. Only you can approve: the clock, emails and web pages never can.

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
| `.claude/agents/` | The four worker subagents |
| `agents/` | Detailed role instructions (scout, operator, developer, advisor) |
| `bin/` | `board.py` (task board), `jarvis.py` (report panels), `setup.sh`, `reset.sh`, `ask.sh` |
| `sources/`, `inbox/`, `faq.md`, `content/`, `seed/` | Mock data: exports, customer emails, FAQ, posts, past recommendations |
| `data/` | What the page reads: board and panel files (runtime), `base.js`, `schedules.js` |
| `outbox/`, `queue/dev/`, `workspace/`, `logs/` | Runtime outputs (git-ignored) |
| `docs/` | Build contracts (`CONTRACT-v3.md` is current) |
| `tests/` | Automated checks (`npm test`) |

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
