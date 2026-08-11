#!/bin/sh
PORT=${1:-3000}
export PORT
echo "Starting server on port $PORT..."
node server.js &
# attempt to open browser (Linux/WSL/mac)
sleep 0.6
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:$PORT" >/dev/null 2>&1 || true
elif command -v open >/dev/null 2>&1; then
  open "http://localhost:$PORT" >/dev/null 2>&1 || true
fi
