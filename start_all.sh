#!/bin/bash
# One-command startup: backend + frontend
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

if [ ! -f ".env" ]; then
  echo "⚠  No .env file found. Copying from .env.example..."
  cp .env.example .env
  echo "✏  Please edit .env and set your API key, then re-run."
  exit 1
fi

if [ ! -d "venv" ]; then
  echo "Creating Python virtual environment..."
  python3 -m venv venv
fi

echo "Installing Python dependencies..."
source venv/bin/activate
pip install -q -r requirements.txt
deactivate || true

if [ ! -d "frontend/node_modules" ]; then
  echo "Installing frontend dependencies..."
  (cd frontend && npm install)
fi

cleanup() {
  if [ -n "${BACKEND_PID:-}" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo
    echo "Stopping backend (PID: $BACKEND_PID)..."
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

echo "Starting backend on http://localhost:${BACKEND_PORT}"
(
  source venv/bin/activate
  exec uvicorn backend.main:app --host 0.0.0.0 --port "$BACKEND_PORT" --reload
) &
BACKEND_PID=$!

sleep 1
if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
  echo "Backend failed to start. Check logs above."
  exit 1
fi

echo "Starting frontend on http://localhost:${FRONTEND_PORT}"
echo "Press Ctrl+C to stop both services."
(cd frontend && exec npm run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT")
