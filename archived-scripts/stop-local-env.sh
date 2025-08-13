#!/bin/bash

echo "Stopping OrderNimbus Local Development Environment..."

# Stop frontend
echo "1. Stopping React frontend..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Stop backend (both node and nodemon)
echo "2. Stopping backend API..."
pkill -f "node local-test-server" || true
pkill -f "nodemon" || true

# Stop Docker containers
echo "3. Stopping Docker containers..."
docker-compose down

echo "✅ All services stopped"