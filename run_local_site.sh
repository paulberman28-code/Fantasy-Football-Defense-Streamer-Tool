#!/bin/bash
# Local development server for Fantasy Football D/ST Streamer Tool
PORT=8000
echo "=========================================================="
echo " Starting Fantasy Football D/ST Streamer Tool locally..."
echo " Opening Safari at http://localhost:$PORT"
echo "=========================================================="

python3 -m http.server $PORT &
SERVER_PID=$!

sleep 1
open -a Safari "http://localhost:$PORT"

echo "Server running (PID: $SERVER_PID)."
echo "Press Ctrl+C to stop the server."

trap "kill $SERVER_PID 2>/dev/null; exit 0" SIGINT SIGTERM
wait $SERVER_PID
