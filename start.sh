#!/usr/bin/env bash
# One command to run the whole thing:
#   1. build the React client if it hasn't been built yet
#   2. start the Node/Express server (serves API + UI on one port)
#   3. open a free Cloudflare quick tunnel so others can reach it
#
# Ctrl+C stops both the tunnel and the server.
set -euo pipefail

cd "$(dirname "$0")"

PORT="$(grep -E '^PORT=' .env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')"
PORT="${PORT:-8787}"

# 1. Build the client if the static bundle is missing.
if [ ! -f server/public/index.html ]; then
  echo "→ Building the web app (first run)…"
  npm run build
fi

# 2. Start the server in the background.
echo "→ Starting the server on http://localhost:${PORT} …"
node server/index.js &
SERVER_PID=$!

# Make sure we tear the server down on exit / Ctrl+C.
cleanup() {
  echo ""
  echo "→ Shutting down…"
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# 3. Wait for the server to answer before opening the tunnel.
echo -n "→ Waiting for the server to be ready"
for _ in $(seq 1 40); do
  if curl -fsS "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then
    echo " ✓"
    break
  fi
  echo -n "."
  sleep 0.5
done

if ! curl -fsS "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then
  echo ""
  echo "✗ Server didn't come up. Check the output above."
  exit 1
fi

# 4. Open the Cloudflare quick tunnel. The public https URL is printed by
#    cloudflared (look for "trycloudflare.com"). Share that link with the pool.
echo ""
echo "→ Opening a public Cloudflare quick tunnel…"
echo "  Look for the https://<random>.trycloudflare.com URL below — that's the"
echo "  link to share. It stays live until you press Ctrl+C."
echo ""
exec ./bin/cloudflared tunnel --no-autoupdate --url "http://localhost:${PORT}"
