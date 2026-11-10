#!/usr/bin/env bash
# One-time setup on a new computer (npm run setup). Safe to re-run.
# Checks Node, Python and the Claude Code CLI, creates the runtime folders, installs npm packages,
# and runs bin/reset.sh to create the runtime data files (empty board, idle roles).
set -euo pipefail

# The project root is the folder above this script, wherever the project was cloned.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$ROOT"

ok()   { printf '  ok    %s\n' "$*"; }
warn() { printf '  WARN  %s\n' "$*" >&2; }
fail() { printf '  FAIL  %s\n' "$*" >&2; exit 1; }

# version_ge "20.12.0" "20.12" -> true when $1 >= $2 (numeric, dot separated)
version_ge() {
  local IFS=.
  local -a a=($1) b=($2)
  local i
  for ((i = 0; i < 3; i++)); do
    local x=${a[i]:-0} y=${b[i]:-0}
    ((10#$x > 10#$y)) && return 0
    ((10#$x < 10#$y)) && return 1
  done
  return 0
}

echo "Jarvis demo setup in $ROOT"
echo
echo "1. Checking requirements"

# Node >= 20.12 (process.loadEnvFile, used to read .env.local)
command -v node >/dev/null 2>&1 || fail "Node.js is not installed. Install Node 20.12 or newer from https://nodejs.org/ and run this again."
node_v="$(node -p 'process.versions.node')"
version_ge "$node_v" "20.12" || fail "Node $node_v is too old. Install Node 20.12 or newer and run this again."
ok "node $node_v"
command -v npm >/dev/null 2>&1 || fail "npm is not on PATH (it ships with Node.js)."
ok "npm $(npm -v)"

# Python >= 3.9 (bin/board.py and bin/jarvis.py, standard library only)
command -v python3 >/dev/null 2>&1 || fail "python3 is not installed. Install Python 3.9 or newer and run this again."
py_v="$(python3 -c 'import sys; print("%d.%d.%d" % sys.version_info[:3])')"
version_ge "$py_v" "3.9" || fail "python3 $py_v is too old. Install Python 3.9 or newer and run this again."
ok "python3 $py_v"

# Claude Code CLI (the Manager, the workers and the Jarvis brain are headless Claude Code runs)
claude_bin="${JARVIS_CLAUDE_BIN:-claude}"
if command -v "$claude_bin" >/dev/null 2>&1; then
  ok "claude CLI: $(command -v "$claude_bin") ($("$claude_bin" --version 2>/dev/null | head -n 1 || echo 'version unknown'))"
else
  warn "The '$claude_bin' CLI is not on PATH. The Manager and the Jarvis brain need Claude Code"
  warn "installed and logged in: https://claude.com/claude-code (then run 'claude' once to log in)."
  warn "The page still opens without it, but requests will fail."
fi

command -v curl >/dev/null 2>&1 && ok "curl (used by bin/ask.sh for schedules)" || warn "curl not found: only bin/ask.sh (optional schedules) needs it."

echo
echo "2. Creating runtime folders"
for d in logs logs/manager \
         outbox/analysis outbox/research outbox/drafts outbox/sent-simulated outbox/published-simulated outbox/dev-tasks \
         queue/dev workspace; do
  mkdir -p "$d"
  [[ -e "$d/.gitkeep" ]] || touch "$d/.gitkeep"
done
ok "logs/ outbox/ queue/dev/ workspace/"

echo
echo "3. Installing npm packages"
npm install --no-fund --no-audit
ok "node_modules/"

echo
echo "4. Creating runtime data (empty board, idle roles)"
bash bin/reset.sh

echo
if [[ -f .env.local ]]; then
  key_note=".env.local found: ElevenLabs voice will be used."
else
  key_note="No .env.local: the page uses the browser's own voice (works with no key)."
fi

cat <<NEXT

Setup done. $key_note

Next steps
  1. Optional, for the ElevenLabs voice and speech-to-text (needed for voice input in non-Chrome browsers):
       npx -y @elevenlabs/cli@latest onboard init      (run it in this folder)
     or copy .env.example to .env.local and paste your key after ELEVENLABS_API_KEY=
  2. Start the server:   npm start
  3. Open http://127.0.0.1:4777/ (Chrome recommended) and click CLICK TO BOOT JARVIS once.
  Reset the demo any time with: npm run reset
NEXT
