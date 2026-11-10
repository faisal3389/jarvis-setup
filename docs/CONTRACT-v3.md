# Jarvis v3 — smart Jarvis brain + standalone project (shared build contract)

Project root (`$P`): the folder that holds `server.mjs` (this repo) — a standalone project that will be
pushed to GitHub and run on other computers. v1/v2 background: `CONTRACT.md` and `CONTRACT-v2.md`
(at the root now; Builder A moves them to `docs/`). Read this file first. Do not edit it.
Never open, print or cat `.env.local` (ElevenLabs key). Never commit or push.

## What changes in v3
```
YOU ─► JARVIS PAGE (ears + mouth)
          │ every sentence → POST /api/chat
          ▼
      JARVIS BRAIN — fresh `claude -p --model haiku` per sentence, no saved session, read-only
          │ gets: compact board + today's digest + last 12 chat lines (server builds the prompt)
          ├─ chat / quick question / task status → answers directly (action "none")
          └─ new work, approve/reject/cancel/clear → server runs the action (Manager as in v2)
```
1. **Jarvis brain** (Builder B): `JARVIS.md` + `POST /api/chat` in `server.mjs`.
2. **Manager sessions are saved**: remove `--no-session-persistence` from Manager runs only.
3. **Page** (Builder C): every utterance goes to `/api/chat`; local keyword router = offline fallback.
4. **Portable project** (Builder A): no absolute paths anywhere; setup script; .gitignore; README; git init.

## Paths rule (everyone)
Every Claude run (Jarvis brain, Manager, workers) has cwd = project root. All prompts, agent files,
playbooks and docs use paths RELATIVE to the project root (`bin/board.py`, `sources/`, `outbox/drafts/`).
No `/Users/...` or `/private/tmp/...` paths in any committed file. Scripts derive the root from their own location.

## POST /api/chat (Builder B implements, Builder C calls)
Request `{"text":"…","from":"voice|text"}` (text 1–1000 chars). Response (always JSON, always `say`):
```json
{"ok":true,"say":"Good evening. Two tasks are running and one needs you: say approve 5 to publish the tweet.",
 "action":{"type":"none"},"requestId":null,"ms":2900}
```
`action.type` ∈ `none` | `new_request` (`text`) | `approve` (`task`, `note`?) | `reject` (`task`, `note`?) |
`cancel` (`task` or `request`) | `clear`. When an action ran, `say` = brain's sentence + the action's own
`say` (e.g. "On it. That's request 4."). Failed action → `ok:false` + plain spoken error. Brain timeout or
unparseable output → `ok:true`, `say` = short fallback ("Sorry, I lost my train of thought. Say that again?")
or the brain's raw text trimmed to 400 chars, action none.

Brain spawn: `${JARVIS_CLAUDE_BIN:-claude} -p "<prompt>" --model ${JARVIS_BRAIN_MODEL:-haiku} --output-format json
--append-system-prompt-file JARVIS.md --permission-mode dontAsk --strict-mcp-config --setting-sources project
--no-session-persistence --allowedTools Read Glob Grep` (add `--bare` only if Builder B measures it faster AND
still working), cwd `$P`, env without ELEVENLABS_API_KEY, timeout `JARVIS_BRAIN_TIMEOUT_MS` (45000), max 3 at
once (`JARVIS_MAX_BRAINS`). Brain must reply with ONLY one JSON object: `{"say":"…","action":{…}}`.

Prompt the server builds (plain text, compact, < 6 KB):
```
NOW: 2026-11-09 21:40 (America/New_York)
BOARD: {open requests, open tasks: id/worker/status/title/result≤160/approval action, last 5 finished tasks, last 5 notes}
TODAY: {scout headline numbers + alerts | "no report yet", operator counts + needs-you items, advisor top 3}
RECENT CHAT (oldest first):
owner: …
jarvis: …
OWNER SAID (voice): "…"
```
Memory: server keeps the last 12 chat lines in memory (owner + jarvis, including spoken board notes when
the page posts `/api/board/spoken`) and appends each line to `logs/chat.jsonl`. `bin/reset.sh` clears it
(and a server restart starts empty).

## Unchanged from v2
Board file + `bin/board.py`, `/api/ask` (clock + fallback), `/api/board/*`, Manager queue (max 2), workers,
`/api/voice`, `/api/tts`, `/api/stt`, static serving of `mission-control/` and `data/` only.

## Env loading (Builder B)
`server.mjs` calls `process.loadEnvFile(".env.local")` when the file exists (Node ≥ 20.12) and runs fine
without it (browser voice, STT disabled). `npm start` = `node server.mjs` (Builder A sets package.json).

## Ownership
- **A (portability):** all `*.md` except `JARVIS.md`/`docs/CONTRACT-v3.md`; `.claude/agents/*`, `agents/*`,
  `playbooks/*`, `MANAGER.md`, `README.md`, `docs/` (moves), `bin/*` (except nothing in server), `package.json`,
  `.gitignore`, `.env.example`, `data/schedules.js`, `data/base.js`, `data/baseline/*`, `.gitkeep` files, `git init`.
- **B (brain):** `server.mjs`, `JARVIS.md`.
- **C (page):** `mission-control/**`, `tests/**`.
