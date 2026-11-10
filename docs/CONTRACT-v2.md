# Jarvis v2 — Manager + workers + task board (shared build contract)

> Background (v2). Kept for reference; the current contract is `docs/CONTRACT-v3.md`.

Read `CONTRACT.md` first (v1: folder, mock data, safety rules, role files). This file ADDS v2.
`$J` = the project root (the cwd of every Claude run); paths are relative to it.
Do not edit CONTRACT.md or this file.

## The design (3 layers, owner talks only to Jarvis)
```
YOU ─voice/text─► JARVIS (page + server.mjs: ears & mouth, no thinking)
                    │ POST /api/ask            ▲ spoken notes from the board
                    ▼                          │
                 MANAGER (headless `claude -p`, instructions in $J/MANAGER.md)
                    │ plans tasks, dispatches workers (Agent tool), reviews, reports
                    ▼
             TASK BOARD  $J/data/tasks.json (+ tasks.js for the page) — only via bin/board.py
                    │
     SCOUT · OPERATOR · DEVELOPER · RESEARCHER   ($J/.claude/agents/<name>.md subagents)
CLOCK (cron) ─POST /api/ask {from:"clock"}─► MANAGER   (same door as the owner)
```
Rules: only the Manager assigns work and decides "done". Workers never talk to each other. Every
status lives on the board. Anything that sends, spends, publishes, merges or deletes stops at
`needs_you` until the owner says "Jarvis, approve <task>". Everything stays SIMULATED (v1 rules).

## Board file `$J/data/tasks.json` (and `$J/data/tasks.js`)
`tasks.js` = `window.JARVIS = window.JARVIS || {};\nwindow.JARVIS.board = <same JSON>;` (rewritten atomically on every write)
```json
{
 "updatedAt": "2026-11-09T21:40:00-05:00",
 "nextRequest": 4, "nextTask": 7, "nextNote": 12,
 "requests": [
  {"id": 3, "text": "find why signups jumped and draft a tweet about it", "from": "voice",
   "status": "working", "reply": null, "taskIds": [4, 5],
   "createdAt": "…", "updatedAt": "…"}
 ],
 "tasks": [
  {"id": 4, "requestId": 3, "title": "Find why signups jumped on Nov 8", "detail": "full instructions…",
   "worker": "scout", "status": "done", "dependsOn": [],
   "result": "Signups +37.8% (151 vs 109.6 avg); timing matches UGC-Testimonial-v3 spend.", "files": ["outbox/analysis/task-4.md"],
   "approval": null, "log": [{"t": "…", "msg": "Reading traffic export"}], "createdAt": "…", "updatedAt": "…"},
  {"id": 5, "requestId": 3, "title": "Draft a tweet about the signup jump", "detail": "…", "worker": "operator",
   "status": "needs_you", "dependsOn": [4], "result": "Tweet drafted.", "files": ["outbox/drafts/task-5.md"],
   "approval": {"action": "Publish the tweet to X", "decision": null, "decidedAt": null, "note": null},
   "log": [], "createdAt": "…", "updatedAt": "…"}
 ],
 "notes": [
  {"id": 11, "t": "…", "text": "Task 5 needs you. Approve publishing the tweet?", "requestId": 3, "taskId": 5, "spoken": false}
 ]
}
```
- workers: `scout` | `operator` | `developer` | `researcher`
- request.status: `queued` | `planning` | `working` | `needs_you` | `done` | `failed` | `cancelled`
- task.status: `queued` | `working` | `review` | `needs_you` | `approved` | `done` | `failed` | `cancelled`
  Flow: queued → working (worker) → review (worker finished) → done | needs_you | failed (Manager decides).
  needs_you → approved (owner) → working → review → done. needs_you → cancelled (owner rejects).
- `notes` = things Jarvis should SAY. Keep the last 50. `spoken` flips when the page has said it.
- Request ids and task ids are separate counters. Owners say "approve 5" = task 5.

## bin/board.py CLI (Builder 1 implements; everyone else uses) — Python 3 stdlib, prints JSON, exit 2 + {"error":…} on bad input
```
python3 $J/bin/board.py request-add --text "…" --from voice|text|clock      -> {"id":3}
python3 $J/bin/board.py request-set <rid> [--status S] [--reply "…"]
python3 $J/bin/board.py task-add --request <rid> --worker W --title "…" [--detail "…"] [--depends 4,5]   -> {"id":6}
python3 $J/bin/board.py task-set <tid> [--status S] [--result "…"] [--file PATH ...] [--needs-approval "action"]
python3 $J/bin/board.py task-log <tid> "message"
python3 $J/bin/board.py approve <tid> [--note "…"]     # only from needs_you → approved
python3 $J/bin/board.py reject  <tid> [--note "…"]     # only from needs_you → cancelled (decision rejected)
python3 $J/bin/board.py cancel  <tid> | cancel --request <rid>   # anything not done → cancelled
python3 $J/bin/board.py clear-done                     # move done/failed/cancelled tasks + finished requests to data/tasks-archive.json
python3 $J/bin/board.py notify "text" [--request rid] [--task tid]
python3 $J/bin/board.py mark-spoken <noteId> [...]
python3 $J/bin/board.py show [--open] [--task tid] [--request rid]
python3 $J/bin/board.py summary                         # one short spoken-style paragraph about the board
python3 $J/bin/board.py reset                           # empty board, counters back to 1
```
`--needs-approval` stores `approval.action` (decision null). Setting a request to a terminal status
does not touch its tasks. File lock (fcntl) around every read-modify-write; atomic replace.

## Server API (Builder 1, in `$J/server.mjs`; all JSON, 127.0.0.1 only; replies always carry `say`)
```
POST /api/ask            {"text":"…","from":"voice|text|clock"}  -> {"ok":true,"requestId":3,"say":"On it. That's request 3."}
POST /api/board/approve  {"task":5,"note":"…"?}  -> {"ok":true,"say":"Approved task 5. I'll finish it."}   (+ starts a Manager approval run)
POST /api/board/reject   {"task":5,"note":"…"?}  -> {"ok":true,"say":"Rejected task 5."}
POST /api/board/cancel   {"task":5} | {"request":3} -> {"ok":true,"say":"Cancelled task 5."}
POST /api/board/clear    {}                      -> {"ok":true,"say":"Cleared 4 finished tasks."}
POST /api/board/spoken   {"ids":[11,12]}         -> {"ok":true}
GET  /api/board                                  -> the board JSON
```
Errors: `{"ok":false,"say":"<plain sentence, e.g. Task 9 does not exist.>"}` with HTTP 400/404/409.
Existing `/api/voice`, `/api/tts`, `/api/stt`, static serving stay as they are.

## Manager runs (Builder 1 spawns, Builder 2 writes MANAGER.md)
Spawn `${JARVIS_CLAUDE_BIN:-claude}` with cwd `$J`, env = process.env minus ELEVENLABS_API_KEY, args:
```
-p "<event prompt>" --model ${JARVIS_MANAGER_MODEL:-sonnet} --output-format json
--append-system-prompt-file $J/MANAGER.md
--permission-mode dontAsk --strict-mcp-config --setting-sources project --no-session-persistence
--allowedTools Read Glob Grep Write Edit Agent Task TodoWrite WebSearch WebFetch "Bash(python3 *)"
```
Event prompts (exact first line, then free text):
- `EVENT: NEW_REQUEST id=<rid> from=<from>` + newline + `Owner said: "<text>"`
- `EVENT: APPROVED task=<tid> request=<rid>` + newline + `Owner note: "<note or none>"`
Max 2 Manager runs at once (`JARVIS_MAX_MANAGERS`), others wait in a FIFO queue (request status `queued`).
Timeout 15 min → kill. Log stdout+stderr to `$J/logs/manager/<request|approval>-<id>.log`.
After exit: if the request is still `queued|planning|working`, set it `failed` (non-zero exit / timeout) or
`done` with reply = first 300 chars of the JSON `result`; always add a note so Jarvis speaks the outcome.

## Workers (Builder 2) — `$J/.claude/agents/<name>.md` with frontmatter name/description/tools/model: sonnet
| worker | does | writes to | tools |
|---|---|---|---|
| scout | numbers & analysis from `$J/sources` (read-only); daily report = follow `$J/agents/scout.md` | `outbox/analysis/task-<id>.md` | Read Glob Grep Bash |
| operator | inbox sweep = follow `$J/agents/operator.md`; drafts emails/posts; SIMULATED send/publish only for `approved` tasks | `outbox/drafts/task-<id>.md`, `outbox/*-simulated/` | Read Glob Grep Write Bash |
| developer | small code tasks, only inside `$J/workspace/task-<id>/` (python3 only); triage `queue/dev` per `$J/agents/developer.md` | `workspace/task-<id>/`, `outbox/dev-tasks/` | Read Glob Grep Write Edit Bash |
| researcher | web research (read-only), cite URLs + dates | `outbox/research/task-<id>.md` | Read Write WebSearch WebFetch Bash |

Worker protocol (every task): `task-set <id> --status working` → 3–8 `task-log` lines → write output
file → `task-set <id> --status review --result "<≤2 sentences>" --file <relative path>` (add
`--needs-approval "<action>"` if finishing needs a send/spend/publish/merge/delete) → reply to the
Manager in ≤80 words. Workers never set done/needs_you/approved and never do real outside actions.

## Morning check (the Advisor moved into the Manager)
Clock request text starts with `Morning check`. Playbook `$J/playbooks/morning-check.md` (Builder 2):
Scout task "daily report" + Operator task "inbox sweep" in parallel → Manager does the Advisor step
itself by following `$J/agents/advisor.md` (publishes the advisor panel) → reply = top 3 in ≤3 sentences.

## Page (Builder 3) — talks to the board only through the API above
Loads `../data/tasks.js` with the other data files (fixtures: `fixtures/tasks.js`). Board panel, worker
pills, spoken notes, voice/text commands: approve/reject/cancel <n>, "what's on the board", "what needs me",
"task <n>", "clear the board"; anything that is work goes to `/api/ask`.
