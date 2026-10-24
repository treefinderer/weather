#!/bin/bash
# PostToolUse hook for Edit/Write: parse-checks an edited .js file with the Mac's JavaScript engine.
# Exit 2 reports the syntax error back to Claude right away.

file=$(python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("tool_input",{}).get("file_path") or d.get("tool_response",{}).get("filePath") or "")')
case "$file" in *.js) ;; *) exit 0 ;; esac
[ -f "$file" ] || exit 0
case "$file" in */.claude/hooks/*) exit 0 ;; esac  # the checker itself uses JXA-only globals

root="${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"
if ! out=$(osascript -l JavaScript "$root/.claude/hooks/parse_check.js" "$file" 2>&1); then
  echo "Syntax error in $file:" >&2
  echo "$out" | tail -3 >&2
  exit 2
fi
exit 0
