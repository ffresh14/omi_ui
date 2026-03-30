#!/bin/bash

echo "Starting ECG Diagnostic Web App..."

# Get the directory of the script to ensure paths are relative
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$script_dir"

# Define cleanup function to kill background processes on exit
cleanup() {
    echo -e "\nShutting down servers..."
    kill $API_PID $FRONTEND_PID 2>/dev/null || true
    # Wait a moment to ensure they terminate
    sleep 1
    exit 0
}

# Handle exit signals
trap cleanup SIGINT SIGTERM EXIT

# Check if .venv exists and activate
if [ -d ".venv" ]; then
    echo "Activating virtual environment..."
    source .venv/bin/activate
else
    echo "Warning: .venv not found. Running with system Python."
fi

# 1. Launch the API
echo "Starting FastAPI backend (port 8000)..."
cd api
python main.py &
API_PID=$!

# Wait briefly down to let the API start before launching the frontend
sleep 2
cd ..

# 2. Launch the frontend
echo "Starting Frontend server (port 8080)..."
cd frontend
python -m http.server 8080 &
FRONTEND_PID=$!

echo "============================================================"
echo "Backend API is running at:  http://localhost:8000"
echo "Frontend App is running at: http://localhost:8080"
echo ""
echo "You can open http://localhost:8080 in your web browser."
echo "Press Ctrl+C to stop both servers."
echo "============================================================"

# Keep script running and wait for background processes
wait $API_PID $FRONTEND_PID
