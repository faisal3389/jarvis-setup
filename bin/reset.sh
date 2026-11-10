#!/usr/bin/env bash
# Restore the Jarvis demo to "before first run". Safe to run repeatedly (npm run reset).
# Touches ONLY: data/{scout,operator,advisor}.{json,js} (via jarvis.py), data/tasks.{json,js} and
# data/tasks-archive.json (via board.py), files inside outbox/*/, queue/dev/, every worker's output
# folder from workers.json (always inside outbox/, queue/ or workspace — board.py checks that),
# logs/ (incl. logs/manager/ and logs/chat.jsonl), and everything inside workspace/.
# Never touches sources/, inbox/, content/, faq.md, seed/, mission-control/, data/base.js,
# data/schedules.js, .env*, node_modules/, workers.json, MANAGER.md, JARVIS.md, playbooks/, .claude/,
# agents/, docs/.
set -euo pipefail

# The project root is the folder above this script, wherever the project was cloned.
J="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"

# Refuse to run anywhere that is not the demo root.
if [[ ! -f "$J/MANAGER.md" || ! -f "$J/server.mjs" || ! -f "$J/bin/jarvis.py" || ! -f "$J/bin/board.py" ]]; then
  echo "reset.sh: refusing to run — $J does not look like the Jarvis demo root" >&2
  exit 1
fi

# Fixed runtime folders (kept in git through their .gitkeep files). Each worker's own output folder
# comes from workers.json (board.py validates the file and prints one folder per line).
FIXED_DIRS=(
  logs logs/manager
  outbox/sent-simulated outbox/published-simulated outbox/dev-tasks
  queue/dev workspace
)
if ! worker_out="$(python3 "$J/bin/board.py" workers --outputs)"; then
  echo "reset.sh: nothing was reset — fix workers.json first: $worker_out" >&2
  exit 1
fi
WORKER_DIRS=()
while IFS= read -r d; do
  if [[ -n "$d" ]]; then WORKER_DIRS+=("$d"); fi
done <<<"$worker_out"
RUNTIME_DIRS=("${FIXED_DIRS[@]}" "${WORKER_DIRS[@]}")

# Delete regular files / symlinks (never folders, never .gitkeep) under the given folders.
clear_files() {
  local dir
  for dir in "$@"; do
    [[ -d "$dir" ]] || continue
    find "$dir" -mindepth 1 \( -type f -o -type l \) ! -name '.gitkeep' ! -name '.env*' -delete
  done
}

# 0. Never follow a symlinked runtime folder (or any folder above it) out of the project.
for d in outbox "${RUNTIME_DIRS[@]}"; do
  p=""
  IFS=/ read -ra parts <<<"$d"
  for part in "${parts[@]}"; do
    p="${p:+$p/}$part"
    if [[ -L "$J/$p" ]]; then
      echo "reset.sh: refusing to run — $J/$p is a symlink" >&2
      exit 1
    fi
  done
done

# 1. Role files back to idle (also regenerates data/<role>.js).
for role in scout operator advisor; do
  python3 "$J/bin/jarvis.py" reset-role "$role"
done
# Leftover temp files from an interrupted jarvis.py write.
find "$J/data" -maxdepth 1 -type f -name '.jarvis-tmp-*' -delete

# 1b. Task board back to empty (counters to 1, archive removed; also regenerates data/tasks.js).
python3 "$J/bin/board.py" reset >/dev/null
find "$J/data" -maxdepth 1 -type f -name '.board-tmp-*' -delete

# 2. Runtime outputs: create the folders, empty them, keep a .gitkeep in each.
for d in "${RUNTIME_DIRS[@]}"; do mkdir -p "$J/$d"; done
clear_files "$J"/outbox/*/ "$J/queue/dev" "$J/logs"
for d in "${WORKER_DIRS[@]}"; do clear_files "$J/$d"; done
rm -f "$J/logs/chat.jsonl"   # Jarvis brain chat memory (already cleared above; kept explicit)
# Developer scratch area: remove everything inside workspace/ except .gitkeep (links not followed).
find "$J/workspace" -mindepth 1 ! -path "$J/workspace/.gitkeep" -delete
for d in "${RUNTIME_DIRS[@]}"; do touch "$J/$d/.gitkeep"; done

# 3. Seed the Advisor's recommendation history (after clearing logs/).
if [[ -f "$J/seed/recommendations-history.json" ]]; then
  cp "$J/seed/recommendations-history.json" "$J/logs/recommendations-history.json"
  echo "logs: seeded recommendations-history.json"
else
  echo "logs: no seed/recommendations-history.json — Advisor will start with an empty history"
fi

echo "Jarvis demo reset: 3 roles idle, task board empty, chat memory cleared, outbox/ queue/dev/ logs/ workspace/ cleared (worker folders: ${WORKER_DIRS[*]})."
