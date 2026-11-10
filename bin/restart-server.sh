#!/usr/bin/env bash
# Restart the Jarvis server safely:  npm run restart   (or: bash bin/restart-server.sh)
# - port = $JARVIS_PORT or 4777 (if you set JARVIS_PORT in .env.local, pass it here too:
#   JARVIS_PORT=4780 npm run restart)
# - stops ONLY the Jarvis server LISTENING on that port (never a browser or other client), and only
#   if it really is this project's server.mjs
# - starts `npm start` in the background (survives this terminal closing); output goes to logs/server.log
# - waits up to 15 seconds for http://127.0.0.1:<port>/api/voice and prints the result
# Note: stopping the server also stops any Manager run that is in progress.
set -euo pipefail

# The project root is the folder above this script, wherever the project was cloned.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$ROOT"

port="${JARVIS_PORT:-4777}"
if [[ ! "$port" =~ ^[0-9]{1,5}$ ]] || (( port < 1 || port > 65535 )); then
  echo "restart: JARVIS_PORT must be a port number, not \"$port\"." >&2
  exit 2
fi
command -v lsof >/dev/null 2>&1 || { echo "restart: needs the lsof command." >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "restart: needs the curl command." >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "restart: npm is not on PATH." >&2; exit 1; }

listeners() { lsof -nP -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | sort -u || true; }
proc_cwd() { lsof -a -nP -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1; }

# 1. Stop the old server: only the process LISTENING on the port, and only if it is our server.mjs.
pids="$(listeners)"
for pid in $pids; do
  cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  cwd="$(proc_cwd "$pid")"
  if [[ "$cmd" != *server.mjs* ]] || [[ "$cwd" != "$ROOT" && "$cmd" != *"$ROOT/server.mjs"* ]]; then
    if [[ "$cmd" == *server.mjs* ]]; then
      echo "restart: port $port is used by a server from another folder (pid $pid, folder ${cwd:-unknown}), not this project's Jarvis server." >&2
    else
      echo "restart: port $port is used by another program (pid $pid: ${cmd:-unknown}), not this Jarvis server." >&2
    fi
    echo "restart: nothing was stopped. Free the port or use another one: JARVIS_PORT=4780 npm run restart" >&2
    exit 1
  fi
done
if [[ -n "$pids" ]]; then
  echo "Stopping the Jarvis server on port $port (pid $(echo $pids))..."
  kill -TERM $pids 2>/dev/null || true
  for _ in $(seq 1 50); do
    [[ -z "$(listeners)" ]] && break
    sleep 0.2
  done
  if [[ -n "$(listeners)" ]]; then
    echo "restart: the server did not stop within 10 seconds; forcing it." >&2
    kill -KILL $pids 2>/dev/null || true
    sleep 0.5
  fi
  if [[ -n "$(listeners)" ]]; then
    echo "restart: port $port is still busy; not starting a second server." >&2
    exit 1
  fi
else
  echo "No Jarvis server was running on port $port."
fi

# 2. Start a new one in the background. Claude Code session variables are removed first: when the
# Mission Control agent runs this script, the new server (and the claude runs it starts) must not
# look like part of that session.
unset CLAUDECODE CLAUDE_CODE_ENTRYPOINT CLAUDE_CODE_SESSION_ID CLAUDE_CODE_CHILD_SESSION \
  CLAUDE_CODE_SESSION_ATTENDED CLAUDE_CODE_MESSAGING_SOCKET CLAUDE_CODE_MESSAGING_TOKEN \
  CLAUDE_CODE_BRIDGE_SESSION_ID CLAUDE_CODE_EXECPATH CLAUDE_CODE_SSE_PORT CLAUDE_PID CLAUDE_JOB_DIR \
  CLAUDE_EFFORT 2>/dev/null || true
export JARVIS_PORT="$port"
mkdir -p logs
printf '\n=== %s npm start (bin/restart-server.sh, port %s)\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$port" >> logs/server.log
set -m # own process group: the server keeps running when the shell that ran this script goes away
nohup npm start >> logs/server.log 2>&1 < /dev/null &
newpid=$!
set +m
disown "$newpid" 2>/dev/null || true

# 3. Wait for it to answer.
url="http://127.0.0.1:${port}"
for _ in $(seq 1 30); do
  if voice="$(curl -fsS --max-time 2 "$url/api/voice" 2>/dev/null)"; then
    echo "Jarvis server is running: $url/  (npm pid $newpid, log: logs/server.log)"
    echo "Voice: $voice"
    exit 0
  fi
  if ! kill -0 "$newpid" 2>/dev/null; then break; fi
  sleep 0.5
done
echo "restart: the server did not answer on $url/api/voice within 15 seconds. Last lines of logs/server.log:" >&2
tail -n 20 logs/server.log >&2 || true
exit 1
