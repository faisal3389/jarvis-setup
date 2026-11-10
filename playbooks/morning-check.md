# Playbook — Morning check (the Manager follows this)

Trigger: a NEW_REQUEST whose text starts with `Morning check` (normally `from=clock`, ~6:47 AM).
Shape: exactly 2 tasks, run in parallel — Scout "Daily report" and Operator "Inbox sweep" — then
YOU do the Advisor step yourself (it is not a task), then reply with today's top 3.
Everything in `MANAGER.md` still applies (review rules, spoken style, hard rules).
All paths are relative to the project root, which is your working directory (cwd). Today = 2026-11-09.

## 1. Plan
1. `python3 bin/board.py request-set R --status planning`
2. Add the two tasks (no `--depends`), note both ids (call them A and B):
   - A: `python3 bin/board.py task-add --request R --worker scout --title "Daily report" --detail "<A detail>"`
     A detail: `Mode: daily report. Goal: yesterday's verified numbers for the morning brief. Inputs:
     agents/scout.md (follow it exactly) and sources/. Output:
     logs/scout-report-2026-11-09.md and the Scout panel via jarvis.py publish scout. Done when:
     data/scout.json has status done and payload.reportDate 2026-11-09; the report is under 300
     words with urgent items first; every number has a source and date; Stripe is UNAVAILABLE.`
   - B: `python3 bin/board.py task-add --request R --worker operator --title "Inbox sweep" --detail "<B detail>"`
     B detail: `Mode: inbox sweep. Goal: handle new customer email and the content queue. Inputs:
     agents/operator.md (follow it exactly), faq.md, inbox/, content/.
     Output: logs/operator-log.md, files in outbox/ and queue/dev/, the Operator
     panel via jarvis.py publish operator. Done when: data/operator.json payload.runAt is on
     2026-11-09; every pending email has an outcome and a file; counts match the items; reply drafts
     are listed for approval; nothing was really sent.`
3. `python3 bin/board.py notify "Morning check started. Scout is on the daily report and Operator is sweeping the inbox." --request R`
4. `python3 bin/board.py request-set R --status working`

## 2. Dispatch both at once
ONE message with two Agent calls: `subagent_type: scout` for task A and `subagent_type: operator` for
task B, each with the dispatch prompt from MANAGER.md (mode `daily report` / `inbox sweep`).

## 3. Review (rules in MANAGER.md, one redo max per task)
- A (Scout): Read `data/scout.json` (status `done`, `payload.reportDate` = `2026-11-09`) and
  `logs/scout-report-2026-11-09.md`. Good → `task-set A --status done --result "..."`.
- B (Operator): Read `data/operator.json` (`payload.runAt` on 2026-11-09),
  `logs/operator-log.md` and the files its items point to. If it wrote reply drafts
  (`outbox/drafts/<email-id>.md`, not the `-escalation` files) →
  `task-set B --status needs_you --needs-approval "Send the N drafted replies, simulated: <email ids>"`.
  Otherwise → `task-set B --status done`. Mention escalations (questions only the owner can answer)
  in the result.
- A task that is still not good after its redo → `failed` with the reason.

## 4. Advisor step (you, not a worker — no task for it)
- If A is `done`: Read `agents/advisor.md` and follow it exactly. It reads Scout's and
  Operator's results, writes `logs/advisor-2026-11-09.md` and the history file, and publishes
  the Advisor panel with `python3 bin/jarvis.py publish advisor ...`. If B failed, it runs on
  Scout only (advisor.md covers that).
- If A failed: skip the Advisor (it needs today's Scout report). Run
  `python3 bin/jarvis.py status advisor error "Scout report missing"`.

## 5. Finish
- Status: `needs_you` if A or B needs_you; otherwise `done`; `failed` only if both A and B failed.
- Reply = today's top 3 in at most 3 short spoken sentences, rank 1 first, taken from
  `data/advisor.json` `payload.recommendations` (the action in plain words, plus one number
  with its source and date when it fits). If a task needs you, say it inside the sentence it fits
  ("... say approve 6 to send the drafted replies"); if no sentence fits, make the last sentence
  "Task 6 needs you: say approve 6 to send the drafted replies." If `routineDay` is true, start
  with "Today looks routine." If the Advisor was skipped, say the report failed and what did work.
- `python3 bin/board.py request-set R --status <status> --reply "<reply>"`
- `python3 bin/board.py notify "<reply>" --request R`
- Your final message is that same reply text.
