#!/bin/sh
PORT=${1:-3000}
export PORT
echo "Starting server on port $PORT..."
node server.js &
SERVER_PID=$!
TIMEOUT=30
STARTED_AT=$(date +%s)
READY=0
while [ $(( $(date +%s) - STARTED_AT )) -lt "$TIMEOUT" ]; do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    wait "$SERVER_PID"
    STATUS=$?
    echo "Server exited before becoming ready (status $STATUS)." >&2
    exit "${STATUS:-1}"
  fi
  if command -v curl >/dev/null 2>&1; then
    curl -fsS "http://localhost:$PORT/" >/dev/null 2>&1 && READY=1
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O /dev/null "http://localhost:$PORT/" && READY=1
  else
    echo "curl or wget is required to check server readiness." >&2
    exit 1
  fi
  [ "$READY" -eq 1 ] && break
  sleep 0.25
done
if [ "$READY" -ne 1 ]; then
  echo "Server did not become ready on port $PORT within ${TIMEOUT}s." >&2
  exit 1
fi
# attempt to open browser (Linux/WSL/mac) only after readiness
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:$PORT" >/dev/null 2>&1 || true
elif command -v open >/dev/null 2>&1; then
  open "http://localhost:$PORT" >/dev/null 2>&1 || true
fi
