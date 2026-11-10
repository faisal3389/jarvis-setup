#!/usr/bin/env bash
# The Mission Control agent: an interactive Claude Code session in this project, with full tools, that
# asks before every change (--permission-mode manual). The owner types to it to change Jarvis itself:
# the page, the server, the Manager, the workers and workers.json. Its instructions: MISSION-CONTROL-AGENT.md.
#
# Start it with:  npm run agent          (or: bash bin/agent.sh)
# or say "Jarvis, launch mission control agent" (on a Mac the server opens it in a new Terminal window).
# Extra arguments go to claude, e.g.  npm run agent -- --continue
#
# It uses the owner's normal Claude Code settings and login. Never change the permission mode here:
# "manual" (ask before every edit and command) is the owner's explicit choice.
set -euo pipefail

# The project root is the folder above this script, wherever the project was cloned.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$ROOT"

if ! command -v claude >/dev/null 2>&1; then
  echo "agent.sh: Claude Code (the 'claude' command) is not on your PATH." >&2
  echo "agent.sh: install it from https://claude.com/claude-code, run 'claude' once to log in, then run 'npm run agent' again." >&2
  exit 127
fi
if [[ ! -f MISSION-CONTROL-AGENT.md ]]; then
  echo "agent.sh: MISSION-CONTROL-AGENT.md is missing from $ROOT; the agent cannot start without its instructions." >&2
  exit 1
fi

exec claude --name "Mission Control agent" --permission-mode manual \
  --append-system-prompt-file MISSION-CONTROL-AGENT.md "$@"
