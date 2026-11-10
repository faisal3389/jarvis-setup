# Setup guide — run Jarvis on a new computer

This guide takes you from a fresh computer to talking with Jarvis. It takes about 10 minutes.
All data in this project is MOCK data for a fictional app. Nothing real is sent, spent or published.

## 1. What you need

### Must have
| Item | Why | Check it |
|---|---|---|
| macOS or Linux | The scripts use bash. Windows is not supported as-is. | — |
| Git | To download the project. | `git --version` |
| Node.js 20.12 or newer | Runs the Jarvis server and the page. | `node --version` |
| Python 3.9 or newer | Runs the task board. No extra packages. | `python3 --version` |
| Claude Code, installed and logged in | The Jarvis brain, the Manager and the workers all run on it and use your Claude plan. | `claude --version`, then run `claude` once to log in |
| Google Chrome | Free hands-free speech-to-text is built in. | — |
| A microphone | You talk to Jarvis. Allow it when Chrome asks. | — |

### Optional
| Item | Why |
|---|---|
| An ElevenLabs API key | A natural voice (George, British) and voice input in browsers other than Chrome. Without a key, Jarvis uses the computer's built-in voice. The key is never in this repo — make one on each computer. |
| The two clock jobs | A daily "morning check" and an "inbox sweep". They do not move with the repo. See step 7. |

## 2. Download the project
```bash
git clone https://github.com/faisal3389/jarvis-setup.git jarvis-demo
cd jarvis-demo
```

## 3. Install everything
```bash
npm run setup
```
This checks Node, Python and Claude Code, installs the Node packages, and creates the runtime
files (task board, logs, output folders). It is safe to run again.

## 4. Optional: add the ElevenLabs voice
Pick one way. Both write the key to `.env.local`, which git ignores.
```bash
npx -y @elevenlabs/cli@latest onboard init     # signs you in, makes a key, writes .env.local
```
or
```bash
cp .env.example .env.local                     # then paste your key after ELEVENLABS_API_KEY=
```
Never paste the key into a chat, and never commit `.env.local`.

## 5. Start Jarvis
```bash
npm start
```
Leave this terminal open. Then open **http://127.0.0.1:4777/** in Chrome.

## 6. Talk to Jarvis
1. Click **CLICK TO BOOT JARVIS**. This is the only click. Hands-free turns on.
2. Allow the microphone.
3. Wait until Jarvis stops talking. Then say **"Jarvis, …"**:

| Say | What happens |
|---|---|
| "Jarvis, hello" | Jarvis answers by itself in about 2 seconds. |
| "Jarvis, please run the morning check." | The Manager runs Scout and Operator, then gives you the top 3. Start with this one. |
| "Jarvis, find out why signups jumped and draft a tweet about it." | Three tasks go on the board: the analysis, the tweet, and a check of its numbers. The tweet waits for you. |
| "Jarvis, approve 2" | Finishes a waiting task. Use the real task number. |
| "Jarvis, what's on the board?" | Jarvis answers from the board. |
| "Jarvis, cancel 3" / "reject 2" / "clear the board" | Changes the board. |

Small questions are answered by the Jarvis brain (Claude Haiku). Real work goes to the Manager
(Claude Sonnet), which gives tasks to the workers. Work takes 1 to 3 minutes; Jarvis tells you
out loud when a task is done or needs you.

## 7. Optional: turn on the clock jobs
Keep the server running, then add these lines with `crontab -e` (use your real project path):
```
47 6 * * *      cd /path/to/jarvis-demo && bash bin/ask.sh "Morning check" clock >> logs/clock.log 2>&1
0 8-20/3 * * *  cd /path/to/jarvis-demo && bash bin/ask.sh "Inbox sweep" clock >> logs/clock.log 2>&1
```
To turn them off, remove the lines with `crontab -e`.

## 8. Check that it works
```bash
npm test          # page tests, all calls mocked, no tokens used
```
On a Mac without Playwright's own browser, point the tests at a Chromium build:
`PLAYWRIGHT_CHROMIUM_PATH="/path/to/Chromium" npm test`, or run `npx playwright install chromium` once.

## Add a new worker
The workers are listed in `workers.json` (scout, operator, developer, researcher, tester). To add one:
1. Create `.claude/agents/<id>.md`. Copy `.claude/agents/tester.md` (a read-only checker) or
   `.claude/agents/developer.md` (writes code), then change `name: <id>`, `description`, `tools`
   and the body. Keep the worker protocol: status working, task-log lines, output file, status review.
2. Add one entry to `workers.json`. The order in the file is the order on the page.
   - `id`: lowercase, 2 to 24 letters, digits or dashes. Must equal the file name and its `name:`.
   - `label`: the UPPERCASE name on the page, at most 12 characters.
   - `color`: a hex colour `#rrggbb` for its pill, board chip and telemetry.
   - `summary`: one sentence on what it does. The Manager, the Jarvis brain and the page tooltip read it.
   - `output`: its output folder inside `outbox/` (or `queue/`, `workspace`). `npm run reset` creates and empties it.
   - `extraBash`: extra allow rules for Manager runs, for example `["Bash(npm test*)"]`.
     Keep it `[]`. **Every rule widens what every worker may run**, not only the new one.
3. Restart the server (`Ctrl + C`, then `npm start`) and reload the page. The terminal warns if a
   worker has no agent file or its `name:` does not match.

## Mission Control agent: change Jarvis itself
To change Jarvis (the page, its voice, the server, the workers), use the Mission Control agent: a
Claude Code session in the project folder that **asks before every change**.
- Say **"Jarvis, launch mission control agent"**. On a Mac a new Terminal window opens with the agent.
  The first time, macOS asks whether the server may control Terminal: click **Allow**. If the agent is
  already open, Jarvis brings Terminal to the front.
- Or open a terminal in the project folder and run `npm run agent` (works on any computer).
- Type what you want changed. The agent says its plan, asks before each edit or command, and checks
  its work.
- After server changes it runs `npm run restart`, which restarts the Jarvis server safely. The server
  then runs in the background and writes to `logs/server.log` (your `npm start` terminal stops). If you
  use another port, run `JARVIS_PORT=4780 npm run restart`.

## Costs
- Each sentence to the Jarvis brain (Haiku): a fraction of a cent.
- Each work request to the Manager (Sonnet): about $0.30.
- ElevenLabs: a few credits per spoken reply.

## Start over, stop, remove
| Goal | Command |
|---|---|
| Clear the board and all results | `npm run reset` |
| Restart Jarvis (after a change) | `npm run restart` |
| Stop Jarvis | press `Ctrl + C` in the `npm start` terminal (after `npm run restart` it runs in the background: `kill $(lsof -ti tcp:4777 -sTCP:LISTEN)`) |
| See past Manager runs | `claude --resume` in the project folder |
| Remove everything | stop Jarvis, remove the clock lines, delete your ElevenLabs key in ElevenLabs → Settings → API Keys, then delete the folder |

## Troubleshooting
| Problem | Fix |
|---|---|
| "VOICE INPUT ERROR (NETWORK)" | You are not in Google Chrome. Use Chrome, or add an ElevenLabs key (step 4). |
| Jarvis does not hear you | Allow the microphone for 127.0.0.1 in the browser settings, then reload and boot again. |
| "Tasks need the Jarvis server" | You opened the HTML file directly. Run `npm start` and use http://127.0.0.1:4777/. |
| Work requests fail at once | Claude Code is not installed or not logged in. Run `claude` once in a terminal. |
| Port 4777 is busy | `JARVIS_PORT=4780 npm start`, then open http://127.0.0.1:4780/. |
| Jarvis speaks with a robot voice | No ElevenLabs key, or the key is wrong. Run `npx -y @elevenlabs/cli@latest onboard check --env-path .env.local` in the project folder. |
