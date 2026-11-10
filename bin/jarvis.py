#!/usr/bin/env python3
"""jarvis.py — the only writer of data/<role>.json and data/<role>.js for the Jarvis demo.

Stdlib only. See ../docs/CONTRACT.md for the spec.

  status  <role> <idle|running|done|error> [message]
  log     <role> <message>
  publish <role> <payload.json>
  pending-emails
  mark-processed <email-id> [...]
  reset-role <role>
"""
import fcntl
import json
import os
import sys
import tempfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
BASELINE = DATA / "baseline"
INBOX = ROOT / "inbox"
LOGS = ROOT / "logs"
OPERATOR_STATE = LOGS / "operator-state.json"

ROLES = ("scout", "operator", "advisor")
STATUSES = ("idle", "running", "done", "error")
MAX_LOG = 50

REQUIRED = {
    "scout": ["reportDate", "dataFor", "revenue", "ads", "traffic", "alerts",
              "unavailable", "projections", "reportMarkdown", "wordCount"],
    "operator": ["runAt", "counts", "items", "summaryMarkdown"],
    "advisor": ["date", "routineDay", "recommendations", "unacted7d",
                "skippedUnavailable", "summaryMarkdown"],
}

USAGE = __doc__.split("\n\n", 2)[2].rstrip()


class CliError(Exception):
    """A user-facing error; exits with code 2."""


def now():
    return datetime.now().astimezone().isoformat(timespec="seconds")


def idle(role):
    return {"role": role, "status": "idle", "updatedAt": None, "log": [], "payload": None}


def atomic_write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=".jarvis-tmp-" + path.name + ".")
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


def js_text(role, obj):
    body = json.dumps(obj, ensure_ascii=False, indent=2)
    # U+2028/2029 are valid in JSON but break older JS parsers.
    body = body.replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    return "window.JARVIS = window.JARVIS || {};\nwindow.JARVIS.%s = %s;\n" % (role, body)


def check_role(role):
    if role not in ROLES:
        raise CliError("unknown role %r (expected one of: %s)" % (role, ", ".join(ROLES)))


def load_baseline(role):
    path = BASELINE / (role + ".json")
    try:
        obj = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(obj, dict):
            return obj
    except (OSError, ValueError):
        pass
    return idle(role)


def load_role(role):
    path = DATA / (role + ".json")
    if not path.exists():
        return load_baseline(role)
    try:
        obj = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(obj, dict):
            raise ValueError("not an object")
    except (OSError, ValueError) as exc:
        print("warning: %s is unreadable (%s); starting from baseline" % (path, exc), file=sys.stderr)
        return load_baseline(role)
    base = idle(role)
    base.update(obj)
    if not isinstance(base.get("log"), list):
        base["log"] = []
    base["role"] = role
    return base


def save_role(role, obj):
    obj["log"] = obj.get("log", [])[-MAX_LOG:]
    atomic_write(DATA / (role + ".json"), json.dumps(obj, ensure_ascii=False, indent=2) + "\n")
    atomic_write(DATA / (role + ".js"), js_text(role, obj))


def append_log(obj, msg):
    obj.setdefault("log", []).append({"t": now(), "msg": msg})


class Lock:
    """Serialise writers (e.g. Operator and its Developer both logging to operator)."""

    def __enter__(self):
        self.fh = open(__file__, "rb")
        fcntl.flock(self.fh.fileno(), fcntl.LOCK_EX)
        return self

    def __exit__(self, *exc):
        fcntl.flock(self.fh.fileno(), fcntl.LOCK_UN)
        self.fh.close()


def need(args, n, usage):
    if len(args) < n:
        raise CliError("usage: jarvis.py " + usage)


# ---------------------------------------------------------------- commands

def cmd_status(args):
    need(args, 2, "status <role> <idle|running|done|error> [message]")
    role, status = args[0], args[1]
    check_role(role)
    if status not in STATUSES:
        raise CliError("unknown status %r (expected one of: %s)" % (status, ", ".join(STATUSES)))
    msg = " ".join(args[2:]).strip()
    with Lock():
        obj = load_role(role)
        obj["status"] = status
        obj["updatedAt"] = now()
        if msg:
            append_log(obj, msg)
        save_role(role, obj)
    print("%s: status=%s%s" % (role, status, (" · " + msg) if msg else ""))


def cmd_log(args):
    need(args, 2, "log <role> <message>")
    role = args[0]
    check_role(role)
    msg = " ".join(args[1:]).strip()
    if not msg:
        raise CliError("log message is empty")
    with Lock():
        obj = load_role(role)
        append_log(obj, msg)
        save_role(role, obj)
    print("%s: %s" % (role, msg))


def soft_checks(role, payload):
    warn = []
    if role == "scout":
        wc = payload.get("wordCount")
        if isinstance(wc, (int, float)) and wc > 300:
            warn.append("wordCount is %s (> 300)" % wc)
        if payload.get("reportDate") != "2026-11-09":
            warn.append("reportDate is %r, demo today is 2026-11-09" % payload.get("reportDate"))
    elif role == "operator":
        counts = payload.get("counts")
        if isinstance(counts, dict):
            missing = [k for k in ("resolved", "drafted", "escalated", "delegated", "published", "held")
                       if k not in counts]
            if missing:
                warn.append("counts is missing: " + ", ".join(missing))
    elif role == "advisor":
        recs = payload.get("recommendations")
        if isinstance(recs, list) and not payload.get("routineDay") and len(recs) != 3:
            warn.append("%d recommendations (expected exactly 3 unless routineDay)" % len(recs))
    for w in warn:
        print("warning: " + w, file=sys.stderr)


def cmd_publish(args):
    need(args, 2, "publish <role> <payload.json>")
    role, src = args[0], Path(args[1]).expanduser()
    if not src.is_absolute():
        src = ROOT / src  # relative paths are relative to the project root
    check_role(role)
    try:
        text = src.read_text(encoding="utf-8")
    except OSError as exc:
        raise CliError("cannot read payload file %s: %s" % (src, exc))
    try:
        payload = json.loads(text)
    except ValueError as exc:
        raise CliError("payload %s is not valid JSON: %s" % (src, exc))
    if not isinstance(payload, dict):
        raise CliError("payload %s must be a JSON object, got %s" % (src, type(payload).__name__))
    missing = [k for k in REQUIRED[role] if k not in payload]
    if missing:
        raise CliError("%s payload is missing required key(s): %s (required: %s)"
                       % (role, ", ".join(missing), ", ".join(REQUIRED[role])))
    soft_checks(role, payload)
    with Lock():
        obj = load_role(role)
        obj["payload"] = payload
        obj["status"] = "done"
        obj["updatedAt"] = now()
        append_log(obj, "Published report")
        save_role(role, obj)
    print("%s: published %s" % (role, src))


def inbox_ids():
    ids = []
    if not INBOX.is_dir():
        return ids
    for path in sorted(INBOX.glob("*.json")):
        eid = None
        try:
            obj = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(obj, dict) and isinstance(obj.get("id"), (str, int)) and str(obj["id"]).strip():
                eid = str(obj["id"]).strip()
        except (OSError, ValueError):
            print("warning: %s is not valid JSON; using file name as id" % path.name, file=sys.stderr)
        ids.append(eid or path.stem)
    return list(dict.fromkeys(ids))


def load_state():
    try:
        obj = json.loads(OPERATOR_STATE.read_text(encoding="utf-8"))
        processed = obj.get("processed", []) if isinstance(obj, dict) else []
        return [str(x) for x in processed if isinstance(x, (str, int))]
    except FileNotFoundError:
        return []
    except (OSError, ValueError) as exc:
        print("warning: %s unreadable (%s); treating as empty" % (OPERATOR_STATE, exc), file=sys.stderr)
        return []


def cmd_pending_emails(args):
    done = set(load_state())
    ids = [i for i in inbox_ids() if i not in done]
    print(json.dumps({"count": len(ids), "ids": ids}))


def cmd_mark_processed(args):
    need(args, 1, "mark-processed <email-id> [...]")
    with Lock():
        processed = load_state()
        added = [a for a in dict.fromkeys(args) if a not in processed]
        processed.extend(added)
        atomic_write(OPERATOR_STATE, json.dumps({"processed": processed}, indent=2) + "\n")
    print(json.dumps({"added": added, "processedTotal": len(processed)}))


def cmd_reset_role(args):
    need(args, 1, "reset-role <role>")
    role = args[0]
    check_role(role)
    with Lock():
        obj = load_baseline(role)
        obj["role"] = role
        save_role(role, obj)
    print("%s: reset to baseline (status=%s)" % (role, obj.get("status")))


COMMANDS = {
    "status": cmd_status,
    "log": cmd_log,
    "publish": cmd_publish,
    "pending-emails": cmd_pending_emails,
    "mark-processed": cmd_mark_processed,
    "reset-role": cmd_reset_role,
}


def main(argv):
    if not argv or argv[0] in ("-h", "--help", "help"):
        print(USAGE)
        return 0 if argv else 2
    fn = COMMANDS.get(argv[0])
    if fn is None:
        print("error: unknown command %r\n%s" % (argv[0], USAGE), file=sys.stderr)
        return 2
    try:
        fn(argv[1:])
    except CliError as exc:
        print("error: %s" % exc, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
