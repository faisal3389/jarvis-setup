#!/usr/bin/env bash
# Open the Mission Control agent (bin/agent.sh) in a new terminal window.
# server.mjs runs this ONLY when the owner says "launch mission control agent" in /api/chat.
#
# Prints ONE line of JSON:
#   {"status":"already_open"}   an agent session is already running (Terminal is brought to the front)
#   {"status":"opened"}         a new terminal window is running bash bin/agent.sh in this project
#   {"status":"manual","hint":"..."}   no way to open a window here: the owner runs npm run agent himself
#   {"status":"error","error":"..."}   failed (exit code 1)
set -uo pipefail

# The project root is the folder above this script, wherever the project was cloned.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
HINT="Open a terminal in the project folder and run npm run agent"

# A JSON string: quotes and backslashes escaped, control characters turned into spaces.
json_str() {
  local s
  s="$(printf '%s' "$1" | tr '\n\r\t' '   ' | tr -d '\000-\037')"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  printf '"%s"' "$s"
}
say_status() { printf '{"status":"%s"}\n' "$1"; }
fail() { printf '{"status":"error","error":%s}\n' "$(json_str "$1")"; exit 1; }
manual() { printf '{"status":"manual","hint":%s}\n' "$(json_str "$HINT")"; exit 0; }

# An agent session = a process started by bin/agent.sh, i.e. with MISSION-CONTROL-AGENT.md as its
# appended system prompt. (Matching the flag too keeps "vim MISSION-CONTROL-AGENT.md" from counting.)
AGENT_RE='append-system-prompt-file[= ]([^ ]*/)?MISSION-CONTROL-AGENT\.md'
agent_running() {
  if command -v pgrep >/dev/null 2>&1; then
    pgrep -f "$AGENT_RE" >/dev/null 2>&1
  else
    ps -A -o args= 2>/dev/null | grep -Eq "$AGENT_RE"
  fi
}

[[ -f "$ROOT/bin/agent.sh" ]] || fail "bin/agent.sh is missing."
[[ -f "$ROOT/MISSION-CONTROL-AGENT.md" ]] || fail "MISSION-CONTROL-AGENT.md is missing."

os="$(uname -s 2>/dev/null || echo unknown)"

if agent_running; then
  # Bring Terminal to the front, but never launch it just for that (that would open an empty window).
  if [[ "$os" == "Darwin" ]] && pgrep -x Terminal >/dev/null 2>&1; then
    osascript -e 'tell application "Terminal" to activate' >/dev/null 2>&1 || true
  fi
  say_status already_open
  exit 0
fi

case "$os" in
  Darwin)
    # The project path is passed as an argument (argv), never pasted into the script text, and
    # `quoted form of` makes it one safe shell word in the new window.
    read -r -d '' APPLESCRIPT <<'APPLESCRIPT'
on run argv
	set cmd to "cd " & quoted form of (item 1 of argv) & " && bash bin/agent.sh"
	set wasRunning to application "Terminal" is running
	tell application "Terminal"
		if wasRunning then
			do script cmd
		else
			-- Terminal opens its default window when it starts: use that one instead of a second window.
			activate
			set waited to 0
			repeat while (count of windows) is 0 and waited < 50
				delay 0.1
				set waited to waited + 1
			end repeat
			if (count of windows) > 0 then
				do script cmd in window 1
			else
				do script cmd
			end if
		end if
		activate
	end tell
end run
APPLESCRIPT
    if ! out="$(osascript -e "$APPLESCRIPT" "$ROOT" 2>&1 >/dev/null)"; then
      if [[ "$out" == *"-1743"* || "$out" == *"ot authori"* || "$out" == *"ot allowed"* ]]; then
        fail "macOS did not allow Jarvis to control Terminal. Allow it in System Settings > Privacy & Security > Automation, then try again. ($out)"
      fi
      fail "Could not open a Terminal window: ${out:-osascript failed}"
    fi
    say_status opened
    ;;
  Linux)
    [[ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]] || manual
    # The project path is "$1" of the inner bash (an argument, never pasted into the command).
    # `exec bash` keeps the window open after the agent exits, so any error stays readable.
    inner='cd "$1" && bash bin/agent.sh; exec bash'
    for term in x-terminal-emulator gnome-terminal konsole; do
      command -v "$term" >/dev/null 2>&1 || continue
      case "$term" in
        gnome-terminal) nohup gnome-terminal -- bash -c "$inner" bash "$ROOT" </dev/null >/dev/null 2>&1 & ;;
        *)              nohup "$term" -e bash -c "$inner" bash "$ROOT" </dev/null >/dev/null 2>&1 & ;;
      esac
      pid=$!
      sleep 1
      # Still running (the window is open) or exited cleanly (handed the window to a terminal server).
      if kill -0 "$pid" 2>/dev/null || wait "$pid"; then
        say_status opened
        exit 0
      fi
    done
    manual
    ;;
  *)
    manual
    ;;
esac
