#!/bin/sh
# Runs the test suite (tests/index.html) in headless Chrome, and prints the results.
# Exits 0 when both pass, 1 otherwise. Set CHROME to use another Chrome binary.
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
PORT=$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')
PROFILE=$(mktemp -d "${TMPDIR:-/tmp}/weather-chrome.XXXXXX")

python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT" >/dev/null 2>&1 &
SERVER=$!
cleanup() { kill "$SERVER" 2>/dev/null || true; rm -rf "$PROFILE"; }
trap cleanup EXIT
trap 'exit 1' INT TERM

# Wait up to 5 seconds for the server.
python3 - "$PORT" <<'EOF'
import socket, sys, time
for _ in range(50):
    try:
        socket.create_connection(("127.0.0.1", int(sys.argv[1])), 0.2).close()
        sys.exit(0)
    except OSError:
        time.sleep(0.1)
sys.exit("Test server didn't start")
EOF

# Virtual time fast-forwards the suite's timers; the budget only has to exceed its total waits.
DOM=$("$CHROME" --headless=new --disable-gpu --no-first-run --no-default-browser-check \
  --user-data-dir="$PROFILE" --window-size=1400,1000 --virtual-time-budget=120000 \
  --dump-dom "http://127.0.0.1:$PORT/tests/" 2>/dev/null) || true

printf '%s' "$DOM" | python3 -c '
import html, re, sys
m = re.search(r"<pre id=\"test-results\"[^>]*>(.*?)</pre>", sys.stdin.read(), re.S)
text = html.unescape(m.group(1)).strip() if m else ""
lines = text.splitlines()
if not lines or not lines[-1].startswith("RESULT: "):
    print(text)
    print("RESULT: FAIL (the suite did not finish; open /tests/ in a browser to see why)")
    sys.exit(1)
print(text)
sys.exit(0 if lines[-1].startswith("RESULT: PASS") else 1)
'
