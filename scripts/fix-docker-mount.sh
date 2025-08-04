#!/bin/bash

# Fix for Docker Desktop mount issues on macOS
# This script resets Docker's file sharing configuration

echo "🔧 Fixing Docker Desktop mount issues..."

# Stop Docker Desktop
echo "Stopping Docker Desktop..."
osascript -e 'quit app "Docker"' 2>/dev/null || true
sleep 5

# Clear Docker's cached settings
echo "Clearing Docker settings cache..."
rm -rf ~/Library/Group\ Containers/group.com.docker/settings.json 2>/dev/null || true
rm -rf ~/Library/Containers/com.docker.docker/Data/vms 2>/dev/null || true

# Restart Docker Desktop
echo "Starting Docker Desktop..."
open -a Docker

# Wait for Docker to be ready
echo "Waiting for Docker to be ready..."
while ! docker system info > /dev/null 2>&1; do
    echo -n "."
    sleep 2
done
echo ""

echo "✅ Docker Desktop has been reset!"
echo ""
echo "Docker should now work properly with SAM."
echo "Run './scripts/start-local-fixed.sh' to start your development environment."