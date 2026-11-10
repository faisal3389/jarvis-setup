#!/usr/bin/env bash
# Send a request to Jarvis through the running server (same door as the owner's voice).
# Used by scheduled jobs:   bash bin/ask.sh "Morning check" [voice|text|clock]   (default from=clock)
# Prints the server's JSON reply. Exit 1 if the server is not running or refuses the request.
set -euo pipefail

text="${1:-}"
from="${2:-clock}"
port="${JARVIS_PORT:-4777}"
url="http://127.0.0.1:${port}/api/ask"

if [[ -z "${text//[[:space:]]/}" ]]; then
  echo "usage: ask.sh \"text\" [voice|text|clock]" >&2
  exit 2
fi

# Build the JSON body with python3 so any quotes or symbols in the text stay data.
body="$(python3 -c 'import json, sys; print(json.dumps({"text": sys.argv[1], "from": sys.argv[2]}))' "$text" "$from")"

set +e
resp="$(printf '%s' "$body" | curl -sS --max-time 20 -H 'Content-Type: application/json' \
  --data-binary @- -w $'\n%{http_code}' "$url" 2>&1)"
rc=$?
set -e

if [[ $rc -ne 0 ]]; then
  echo "ask.sh: the Jarvis server is not running on 127.0.0.1:${port} (curl: ${resp##*$'\n'})." >&2
  echo "ask.sh: start it with: cd \"$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)\" && npm start" >&2
  exit 1
fi

code="${resp##*$'\n'}"
reply="${resp%$'\n'*}"
echo "$reply"
if [[ ! "$code" =~ ^2 ]]; then
  echo "ask.sh: server answered HTTP $code" >&2
  exit 1
fi
