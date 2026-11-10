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
| "Jarvis, find out why signups jumped and draft a tweet about it." | Two tasks go on the board. The tweet waits for you. |
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

## Costs
- Each sentence to the Jarvis brain (Haiku): a fraction of a cent.
- Each work request to the Manager (Sonnet): about $0.30.
- ElevenLabs: a few credits per spoken reply.

## Start over, stop, remove
| Goal | Command |
|---|---|
| Clear the board and all results | `npm run reset` |
| Stop Jarvis | press `Ctrl + C` in the `npm start` terminal |
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
