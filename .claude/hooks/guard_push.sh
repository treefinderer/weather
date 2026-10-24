#!/bin/bash
# PreToolUse hook for Bash: blocks force-pushes and deleting main, and runs tests/run.sh before any push to main.
# Exit 2 blocks the command and shows stderr to Claude.

cmd=$(python3 -c 'import sys,json; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))')

# The git push part of the command, also when git gets options first (git -C dir push, git -c k=v push).
push=$(echo "$cmd" | grep -Eo '(^|[;&|[:space:]])git([[:space:]]+-[Cc][[:space:]]+[^[:space:]]+)*[[:space:]]+push([[:space:]][^;&|]*)?' | head -1)
[ -n "$push" ] || exit 0

if echo "$push" | grep -Eq '[[:space:]](--force|--force-with-lease|--force-if-includes|-[A-Za-z]*f[A-Za-z]*)([[:space:]=]|$)|[[:space:]]\+[^[:space:]]'; then
  echo "Blocked by hook: force-pushing is not allowed in this repo (see CLAUDE.md)." >&2
  exit 2
fi

targets_main=0
echo "$push" | grep -Eq '([[:space:]:])main([[:space:]]|$)' && targets_main=1

if echo "$push" | grep -Eq -- '[[:space:]](--delete|-d)([[:space:]]|$)|[[:space:]]:[^[:space:]]'; then
  if [ $targets_main = 1 ]; then
    echo "Blocked by hook: deleting main is not allowed." >&2
    exit 2
  fi
  exit 0  # deleting a feature branch publishes no code
fi

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
branch=$(git -C "$root" branch --show-current 2>/dev/null)

if [ $targets_main = 1 ] || [ "$branch" = "main" ]; then
  if ! out=$("$root/tests/run.sh" 2>&1); then
    echo "Blocked by hook: tests/run.sh failed, so this push to main was stopped." >&2
    echo "$out" | tail -15 >&2
    exit 2
  fi
fi
exit 0
