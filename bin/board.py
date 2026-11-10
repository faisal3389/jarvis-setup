#!/usr/bin/env python3
"""board.py — the only writer of data/tasks.json and data/tasks.js (Jarvis v2 task board).

Stdlib only. See ../docs/CONTRACT-v2.md. Prints JSON. Bad input: exit 2 and {"error": "..."}.

  request-add --text "..." --from voice|text|clock
  request-set <rid> [--status S] [--reply "..."]
  task-add --request <rid> --worker W --title "..." [--detail "..."] [--depends 4,5]
  task-set <tid> [--status S] [--result "..."] [--file PATH ...] [--needs-approval "action"]
  task-log <tid> "message"
  approve <tid> [--note "..."]
  reject  <tid> [--note "..."]
  cancel  <tid> | cancel --request <rid>
  clear-done
  notify "text" [--request rid] [--task tid]
  mark-spoken <noteId> [...]
  show [--open] [--task tid] [--request rid]
  summary
  reset
"""
import argparse
import fcntl
import json
import os
import sys
import tempfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
BOARD_JSON = DATA / "tasks.json"
BOARD_JS = DATA / "tasks.js"
ARCHIVE = DATA / "tasks-archive.json"
LOCK = DATA / "tasks.lock"
BASELINE = DATA / "baseline" / "tasks.json"

WORKERS = ("scout", "operator", "developer", "researcher")
FROMS = ("voice", "text", "clock")
REQUEST_STATUSES = ("queued", "planning", "working", "needs_you", "done", "failed", "cancelled")
TASK_STATUSES = ("queued", "working", "review", "needs_you", "approved", "done", "failed", "cancelled")
TERMINAL = ("done", "failed", "cancelled")
SAY_STATUS = {"review": "in review", "needs_you": "waiting for you"}
MAX_NOTES = 50
MAX_TASK_LOG = 40
MAX_TEXT = 4000

USAGE = __doc__.split("\n\n", 2)[2].rstrip()


def rel_to_root(f):
    """Board files are stored relative to the project root (absolute paths inside it are converted)."""
    if f and os.path.isabs(f):
        try:
            return Path(f).resolve().relative_to(ROOT).as_posix()
        except ValueError:
            return f
    return f


class CliError(Exception):
    """User-facing error. kind: bad_input | not_found | conflict (server maps to 400/404/409)."""

    def __init__(self, msg, kind="bad_input"):
        super().__init__(msg)
        self.kind = kind


def now():
    return datetime.now().astimezone().isoformat(timespec="seconds")


def empty_board():
    return {"updatedAt": None, "nextRequest": 1, "nextTask": 1, "nextNote": 1,
            "requests": [], "tasks": [], "notes": []}


# ---------------------------------------------------------------- storage

def atomic_write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=".board-tmp-" + path.name + ".")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(text)
            fh.flush()
            os.fsync(fh.fileno())
        os.chmod(tmp, 0o644)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def normalise(obj):
    board = empty_board()
    if isinstance(obj, dict):
        board.update(obj)
    for key in ("requests", "tasks", "notes"):
        if not isinstance(board.get(key), list):
            board[key] = []
    # Counters never go backwards, even if the file was hand-edited.
    for key, items in (("nextRequest", "requests"), ("nextTask", "tasks"), ("nextNote", "notes")):
        top = max([i.get("id", 0) for i in board[items] if isinstance(i, dict)] + [0])
        if not isinstance(board.get(key), int) or board[key] <= top:
            board[key] = top + 1
    return board


def load_baseline():
    try:
        return normalise(json.loads(BASELINE.read_text(encoding="utf-8")))
    except (OSError, ValueError):
        return empty_board()


def load_board():
    try:
        return normalise(json.loads(BOARD_JSON.read_text(encoding="utf-8")))
    except FileNotFoundError:
        return load_baseline()
    except (OSError, ValueError) as exc:
        print("warning: %s unreadable (%s); starting from an empty board" % (BOARD_JSON, exc), file=sys.stderr)
        return load_baseline()


def js_text(board):
    body = json.dumps(board, ensure_ascii=False, indent=2)
    # U+2028/2029 are valid in JSON but break older JS parsers.
    body = body.replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    return "window.JARVIS = window.JARVIS || {};\nwindow.JARVIS.board = %s;\n" % body


def save_board(board):
    board["notes"] = board["notes"][-MAX_NOTES:]
    for t in board["tasks"]:
        t["log"] = t.get("log", [])[-MAX_TASK_LOG:]
    board["updatedAt"] = now()
    atomic_write(BOARD_JSON, json.dumps(board, ensure_ascii=False, indent=2) + "\n")
    atomic_write(BOARD_JS, js_text(board))


class Lock:
    """fcntl lock around every read-modify-write of the board."""

    def __enter__(self):
        DATA.mkdir(parents=True, exist_ok=True)
        self.fh = open(LOCK, "a+b")
        fcntl.flock(self.fh.fileno(), fcntl.LOCK_EX)
        return self

    def __exit__(self, *exc):
        fcntl.flock(self.fh.fileno(), fcntl.LOCK_UN)
        self.fh.close()


# ---------------------------------------------------------------- helpers

def find_request(board, rid):
    for r in board["requests"]:
        if r.get("id") == rid:
            return r
    raise CliError("Request %d does not exist." % rid, "not_found")


def find_task(board, tid):
    for t in board["tasks"]:
        if t.get("id") == tid:
            return t
    raise CliError("Task %d does not exist." % tid, "not_found")


def text_arg(value, name, required=True):
    value = (value or "").strip()
    if required and not value:
        raise CliError("%s is empty." % name)
    if len(value) > MAX_TEXT:
        raise CliError("%s is longer than %d characters." % (name, MAX_TEXT))
    return value


def pos_int(value):
    try:
        n = int(str(value).strip().lstrip("#"))
    except ValueError:
        raise argparse.ArgumentTypeError("%r is not a number" % value)
    if n < 1:
        raise argparse.ArgumentTypeError("%r is not a positive id" % value)
    return n


def id_list(value):
    out = []
    for part in str(value).split(","):
        if part.strip():
            out.append(pos_int(part))
    return out


def add_note(board, text, rid=None, tid=None):
    note = {"id": board["nextNote"], "t": now(), "text": text,
            "requestId": rid, "taskId": tid, "spoken": False}
    board["nextNote"] += 1
    board["notes"].append(note)
    return note


def settle_request(board, req):
    """After an owner decision, move a request out of needs_you if nothing else needs the owner."""
    if req.get("status") != "needs_you":
        return
    tasks = [t for t in board["tasks"] if t.get("requestId") == req["id"]]
    if any(t.get("status") == "needs_you" for t in tasks):
        return
    if any(t.get("status") not in TERMINAL for t in tasks):
        req["status"] = "working"
    elif tasks and all(t.get("status") == "cancelled" for t in tasks):
        req["status"] = "cancelled"
    else:
        req["status"] = "done"
    req["updatedAt"] = now()


def spoken_phrase(text):
    """Make a title/action easy to say inside a sentence."""
    s = " ".join(str(text or "").split()).rstrip(".!?:;")
    if len(s) > 1 and s[0].isupper() and s[1].islower():
        s = s[0].lower() + s[1:]
    return s


def plural(n, one, many):
    return "%d %s" % (n, one if n == 1 else many)


# ---------------------------------------------------------------- commands

def cmd_request_add(a):
    text = text_arg(a.text, "Request text")
    with Lock():
        board = load_board()
        ts = now()
        req = {"id": board["nextRequest"], "text": text, "from": a.from_, "status": "queued",
               "reply": None, "taskIds": [], "createdAt": ts, "updatedAt": ts}
        board["nextRequest"] += 1
        board["requests"].append(req)
        save_board(board)
    return {"id": req["id"]}


def cmd_request_set(a):
    if a.status is None and a.reply is None:
        raise CliError("Nothing to change. Give --status and/or --reply.")
    with Lock():
        board = load_board()
        req = find_request(board, a.rid)
        if a.status is not None and req["status"] == "cancelled" and a.status != "cancelled":
            raise CliError("Request %d was cancelled." % a.rid, "conflict")
        if a.status is not None:
            req["status"] = a.status
        if a.reply is not None:
            req["reply"] = text_arg(a.reply, "Reply", required=False) or None
        req["updatedAt"] = now()
        save_board(board)
    return {"ok": True, "request": req}


def cmd_task_add(a):
    title = text_arg(a.title, "Task title")
    detail = text_arg(a.detail, "Task detail", required=False)
    with Lock():
        board = load_board()
        req = find_request(board, a.request)
        depends = list(dict.fromkeys(a.depends or []))
        for d in depends:
            find_task(board, d)
        ts = now()
        task = {"id": board["nextTask"], "requestId": req["id"], "title": title, "detail": detail,
                "worker": a.worker, "status": "queued", "dependsOn": depends,
                "result": None, "files": [], "approval": None, "log": [],
                "createdAt": ts, "updatedAt": ts}
        board["nextTask"] += 1
        board["tasks"].append(task)
        req.setdefault("taskIds", []).append(task["id"])
        req["updatedAt"] = ts
        save_board(board)
    return {"id": task["id"]}


def cmd_task_set(a):
    if a.status is None and a.result is None and not a.file and a.needs_approval is None:
        raise CliError("Nothing to change. Give --status, --result, --file or --needs-approval.")
    if a.status == "approved":
        raise CliError("Only the owner can approve. Use: board.py approve %d" % a.tid)
    with Lock():
        board = load_board()
        task = find_task(board, a.tid)
        if a.status is not None and task["status"] == "cancelled" and a.status != "cancelled":
            raise CliError("Task %d was cancelled." % a.tid, "conflict")
        if a.status is not None:
            task["status"] = a.status
        if a.result is not None:
            task["result"] = text_arg(a.result, "Result", required=False) or None
        for f in a.file or []:
            f = rel_to_root(f.strip())
            if f and f not in task["files"]:
                task["files"].append(f)
        if a.needs_approval is not None:
            task["approval"] = {"action": text_arg(a.needs_approval, "Approval action"),
                                "decision": None, "decidedAt": None, "note": None}
        task["updatedAt"] = now()
        save_board(board)
    return {"ok": True, "task": task}


def cmd_task_log(a):
    msg = text_arg(a.message, "Log message")
    with Lock():
        board = load_board()
        task = find_task(board, a.tid)
        task.setdefault("log", []).append({"t": now(), "msg": msg})
        task["updatedAt"] = now()
        save_board(board)
    return {"ok": True}


def decide(a, decision, new_status):
    note = text_arg(a.note, "Note", required=False) or None
    with Lock():
        board = load_board()
        task = find_task(board, a.tid)
        if task["status"] != "needs_you":
            raise CliError("Task %d is not waiting for you. It is %s."
                           % (a.tid, SAY_STATUS.get(task["status"], task["status"])), "conflict")
        ts = now()
        approval = task.get("approval") if isinstance(task.get("approval"), dict) else {"action": None}
        approval.update({"decision": decision, "decidedAt": ts, "note": note})
        task["approval"] = approval
        task["status"] = new_status
        task["updatedAt"] = ts
        req = next((r for r in board["requests"] if r.get("id") == task.get("requestId")), None)
        if req is not None:
            settle_request(board, req)
        save_board(board)
    return {"ok": True, "task": a.tid, "requestId": task.get("requestId"),
            "status": new_status, "requestStatus": req.get("status") if req else None}


def cmd_approve(a):
    return decide(a, "approved", "approved")


def cmd_reject(a):
    return decide(a, "rejected", "cancelled")


def cmd_cancel(a):
    if (a.tid is None) == (a.request is None):
        raise CliError("Give a task id or --request <rid>, not both.")
    with Lock():
        board = load_board()
        ts = now()
        if a.tid is not None:
            task = find_task(board, a.tid)
            if task["status"] == "done":
                raise CliError("Task %d is already done." % a.tid, "conflict")
            task["status"] = "cancelled"
            task["updatedAt"] = ts
            req = next((r for r in board["requests"] if r.get("id") == task.get("requestId")), None)
            if req is not None:
                settle_request(board, req)
            save_board(board)
            return {"ok": True, "task": a.tid, "cancelled": [a.tid]}
        req = find_request(board, a.request)
        if req["status"] == "done":
            raise CliError("Request %d is already done." % a.request, "conflict")
        req["status"] = "cancelled"
        req["updatedAt"] = ts
        cancelled = []
        for t in board["tasks"]:
            if t.get("requestId") == req["id"] and t.get("status") not in ("done", "cancelled"):
                t["status"] = "cancelled"
                t["updatedAt"] = ts
                cancelled.append(t["id"])
        save_board(board)
    return {"ok": True, "request": a.request, "cancelled": cancelled}


def cmd_clear_done(a):
    with Lock():
        board = load_board()
        finished_reqs = {r["id"] for r in board["requests"] if r.get("status") in TERMINAL}
        live_reqs = {r["id"] for r in board["requests"]} - finished_reqs
        # A finished task goes once its request is finished (or gone); tasks of a live request stay
        # so the Manager keeps their results while it works on the rest.
        move_tasks = [t for t in board["tasks"]
                      if t.get("status") in TERMINAL and t.get("requestId") not in live_reqs]
        moved_ids = {t["id"] for t in move_tasks}
        open_by_req = {t.get("requestId") for t in board["tasks"] if t["id"] not in moved_ids}
        move_reqs = [r for r in board["requests"]
                     if r["id"] in finished_reqs and r["id"] not in open_by_req]
        if move_tasks or move_reqs:
            try:
                archive = json.loads(ARCHIVE.read_text(encoding="utf-8"))
                if not isinstance(archive, dict):
                    raise ValueError
            except (OSError, ValueError):
                archive = {}
            archive.setdefault("requests", [])
            archive.setdefault("tasks", [])
            ts = now()
            archive["requests"].extend(dict(r, archivedAt=ts) for r in move_reqs)
            archive["tasks"].extend(dict(t, archivedAt=ts) for t in move_tasks)
            archive["updatedAt"] = ts
            atomic_write(ARCHIVE, json.dumps(archive, ensure_ascii=False, indent=2) + "\n")
            req_ids = {r["id"] for r in move_reqs}
            board["tasks"] = [t for t in board["tasks"] if t["id"] not in moved_ids]
            board["requests"] = [r for r in board["requests"] if r["id"] not in req_ids]
            save_board(board)
    return {"ok": True, "tasks": len(move_tasks), "requests": len(move_reqs),
            "taskIds": sorted(moved_ids), "requestIds": sorted(r["id"] for r in move_reqs)}


def cmd_notify(a):
    text = text_arg(a.text, "Note text")
    with Lock():
        board = load_board()
        if a.request is not None:
            find_request(board, a.request)
        rid = a.request
        if a.task is not None:
            task = find_task(board, a.task)
            if rid is None:
                rid = task.get("requestId")
        note = add_note(board, text, rid, a.task)
        save_board(board)
    return {"id": note["id"]}


def cmd_mark_spoken(a):
    with Lock():
        board = load_board()
        wanted = set(a.ids)
        marked = []
        for n in board["notes"]:
            if n.get("id") in wanted:
                n["spoken"] = True
                marked.append(n["id"])
        unknown = sorted(wanted - set(marked))
        if not marked:
            raise CliError("No such note: %s." % ", ".join(str(i) for i in unknown), "not_found")
        save_board(board)
    return {"ok": True, "marked": sorted(marked), "unknown": unknown}


def cmd_show(a):
    board = load_board()
    if a.task is not None:
        return find_task(board, a.task)
    is_open_req = lambda r: r.get("status") not in TERMINAL
    is_open_task = lambda t: t.get("status") not in TERMINAL
    if a.request is not None:
        req = find_request(board, a.request)
        tasks = [t for t in board["tasks"] if t.get("requestId") == a.request]
        if a.open:
            tasks = [t for t in tasks if is_open_task(t)]
        return {"request": req, "tasks": tasks}
    if a.open:
        return dict(board,
                    requests=[r for r in board["requests"] if is_open_req(r)],
                    tasks=[t for t in board["tasks"] if is_open_task(t)],
                    notes=[n for n in board["notes"] if not n.get("spoken")])
    return board


def cmd_summary(a):
    board = load_board()
    tasks = board["tasks"]
    today = datetime.now().astimezone().date().isoformat()
    working = [t for t in tasks if t.get("status") in ("working", "review", "approved")]
    queued = [t for t in tasks if t.get("status") == "queued"]
    needs = [t for t in tasks if t.get("status") == "needs_you"]
    failed = [t for t in tasks if t.get("status") == "failed"]
    done_today = [t for t in tasks if t.get("status") == "done"
                  and str(t.get("updatedAt") or "").startswith(today)]
    with_tasks = {t.get("requestId") for t in tasks if t.get("status") not in TERMINAL}
    planning = [r for r in board["requests"] if r.get("status") in ("planning", "working")
                and r["id"] not in with_tasks]
    waiting = [r for r in board["requests"] if r.get("status") == "queued"]

    parts = []
    if working:
        parts.append(plural(len(working), "task in progress", "tasks in progress"))
    if queued:
        parts.append(plural(len(queued), "task queued", "tasks queued"))
    if planning:
        parts.append(plural(len(planning), "request being planned", "requests being planned"))
    if waiting:
        parts.append(plural(len(waiting), "request waiting to start", "requests waiting to start"))
    sentences = []
    if parts:
        sentences.append(", ".join(parts))
    if needs:
        items = []
        for t in needs[:3]:
            what = (t.get("approval") or {}).get("action") or t.get("title")
            items.append("task %d, %s" % (t["id"], spoken_phrase(what)))
        more = len(needs) - len(items)
        phrase = "; ".join(items) + ("; and %d more" % more if more > 0 else "")
        sentences.append("%d %s you: %s" % (len(needs), "needs" if len(needs) == 1 else "need", phrase))
    if failed:
        sentences.append(plural(len(failed), "task failed", "tasks failed"))
    if done_today:
        sentences.append("%d done today" % len(done_today))
    if not sentences:
        return {"text": "The board is clear. Nothing is in progress and nothing needs you."}
    text = ". ".join(s[0].upper() + s[1:] for s in sentences) + "."
    return {"text": text}


def cmd_reset(a):
    with Lock():
        board = load_baseline()
        board.update(empty_board())
        atomic_write(BOARD_JSON, json.dumps(board, ensure_ascii=False, indent=2) + "\n")
        atomic_write(BOARD_JS, js_text(board))
        try:
            ARCHIVE.unlink()  # counters restart at 1, so old archived ids would collide
        except FileNotFoundError:
            pass
    return {"ok": True}


# ---------------------------------------------------------------- CLI

class Parser(argparse.ArgumentParser):
    def error(self, message):
        raise CliError(message)

    def exit(self, status=0, message=None):
        if status:
            raise CliError((message or "bad arguments").strip())
        sys.exit(status)


def build_parser():
    p = Parser(prog="board.py", add_help=False)
    sub = p.add_subparsers(dest="cmd", parser_class=Parser)

    s = sub.add_parser("request-add", add_help=False)
    s.add_argument("--text", required=True)
    s.add_argument("--from", dest="from_", required=True, choices=FROMS)
    s.set_defaults(fn=cmd_request_add)

    s = sub.add_parser("request-set", add_help=False)
    s.add_argument("rid", type=pos_int)
    s.add_argument("--status", choices=REQUEST_STATUSES)
    s.add_argument("--reply")
    s.set_defaults(fn=cmd_request_set)

    s = sub.add_parser("task-add", add_help=False)
    s.add_argument("--request", type=pos_int, required=True)
    s.add_argument("--worker", required=True, choices=WORKERS)
    s.add_argument("--title", required=True)
    s.add_argument("--detail")
    s.add_argument("--depends", type=id_list)
    s.set_defaults(fn=cmd_task_add)

    s = sub.add_parser("task-set", add_help=False)
    s.add_argument("tid", type=pos_int)
    s.add_argument("--status", choices=TASK_STATUSES)
    s.add_argument("--result")
    s.add_argument("--file", nargs="+", action="extend")
    s.add_argument("--needs-approval", dest="needs_approval")
    s.set_defaults(fn=cmd_task_set)

    s = sub.add_parser("task-log", add_help=False)
    s.add_argument("tid", type=pos_int)
    s.add_argument("message", nargs="+")
    s.set_defaults(fn=cmd_task_log)

    for name, fn in (("approve", cmd_approve), ("reject", cmd_reject)):
        s = sub.add_parser(name, add_help=False)
        s.add_argument("tid", type=pos_int)
        s.add_argument("--note")
        s.set_defaults(fn=fn)

    s = sub.add_parser("cancel", add_help=False)
    s.add_argument("tid", type=pos_int, nargs="?")
    s.add_argument("--request", type=pos_int)
    s.set_defaults(fn=cmd_cancel)

    s = sub.add_parser("clear-done", add_help=False)
    s.set_defaults(fn=cmd_clear_done)

    s = sub.add_parser("notify", add_help=False)
    s.add_argument("text")
    s.add_argument("--request", type=pos_int)
    s.add_argument("--task", type=pos_int)
    s.set_defaults(fn=cmd_notify)

    s = sub.add_parser("mark-spoken", add_help=False)
    s.add_argument("ids", type=pos_int, nargs="+")
    s.set_defaults(fn=cmd_mark_spoken)

    s = sub.add_parser("show", add_help=False)
    s.add_argument("--open", action="store_true")
    s.add_argument("--task", type=pos_int)
    s.add_argument("--request", type=pos_int)
    s.set_defaults(fn=cmd_show)

    s = sub.add_parser("summary", add_help=False)
    s.set_defaults(fn=cmd_summary)

    s = sub.add_parser("reset", add_help=False)
    s.set_defaults(fn=cmd_reset)
    return p


def main(argv):
    if not argv or argv[0] in ("-h", "--help", "help"):
        print(USAGE)
        return 0 if argv else 2
    try:
        args = build_parser().parse_args(argv)
        if not getattr(args, "fn", None):
            raise CliError("Unknown command. Run board.py --help.")
        if getattr(args, "message", None) is not None:
            args.message = " ".join(args.message)
        out = args.fn(args)
    except CliError as exc:
        print(json.dumps({"error": str(exc), "kind": exc.kind}))
        return 2
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
