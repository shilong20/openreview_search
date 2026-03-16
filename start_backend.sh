#!/bin/bash
# Start the FastAPI backend server
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f ".env" ]; then
    echo "⚠  No .env file found. Copying from .env.example..."
    cp .env.example .env
    echo "✏  Please edit .env and set your API key, then re-run."
    exit 1
fi

if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate

echo "Installing Python dependencies..."
pip install -q -r requirements.txt

echo "Starting FastAPI server on http://localhost:8000"
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload \
  --reload-include '*.py' \
  --reload-include '.env'
