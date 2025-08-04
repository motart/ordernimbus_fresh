#!/bin/bash

# OrderNimbus Local Development Stop Script
# Stops all services and cleans up ports

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🛑 Stopping OrderNimbus Local Development Environment${NC}"
echo "=================================================="

# Function to kill process on port
kill_port() {
    local port=$1
    local service=$2
    echo -e "${BLUE}🔍 Checking port $port for $service...${NC}"
    
    # Find process using the port
    local pid=$(lsof -ti:$port 2>/dev/null || true)
    
    if [ ! -z "$pid" ]; then
        echo -e "${YELLOW}Killing $service process (PID: $pid)...${NC}"
        kill -9 $pid 2>/dev/null || true
        sleep 1
        echo -e "${GREEN}✅ Port $port cleared${NC}"
    else
        echo -e "${GREEN}✅ Port $port is already free${NC}"
    fi
}

# Stop React frontend
echo -e "${BLUE}Stopping React frontend...${NC}"
pkill -f "react-scripts/scripts/start.js" 2>/dev/null || true
kill_port 3000 "React Frontend"

# Stop SAM API
echo -e "${BLUE}Stopping SAM Local API...${NC}"
pkill -f "sam local start-api" 2>/dev/null || true
kill_port 3001 "SAM API"

# Stop Docker services
echo -e "${BLUE}🐳 Stopping Docker services...${NC}"
docker-compose down 2>/dev/null || true

# Clean up any remaining processes
echo -e "${BLUE}🧹 Final cleanup...${NC}"
pkill -f "node.*ordernimbus" 2>/dev/null || true
pkill -f "sam.*ordernimbus" 2>/dev/null || true

echo ""
echo -e "${GREEN}=========================================="
echo -e "✅ All services stopped successfully!"
echo -e "==========================================${NC}"
echo ""
echo -e "${BLUE}To restart the development environment, run:${NC}"
echo "  ./scripts/start-local.sh"
echo ""