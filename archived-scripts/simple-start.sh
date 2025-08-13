#!/bin/bash

echo "🚀 Starting OrderNimbus Local Development Environment..."
echo "============================================"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Docker is running
echo -e "\n${YELLOW}1. Checking Docker...${NC}"
if ! docker info > /dev/null 2>&1; then
  echo -e "${RED}❌ Docker is not running. Please start Docker Desktop first.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Docker is running${NC}"

# Start Docker containers
echo -e "\n${YELLOW}2. Starting Docker containers...${NC}"
docker-compose up -d
echo -e "${GREEN}✓ Docker containers started${NC}"

# Wait for containers to be ready
echo -e "\n${YELLOW}3. Waiting for services to be ready...${NC}"
sleep 10

# Check DynamoDB tables
echo -e "\n${YELLOW}4. Checking DynamoDB tables...${NC}"
TABLES=$(aws dynamodb list-tables --endpoint-url http://localhost:8000 --region us-west-1 2>/dev/null | jq -r '.TableNames | length')
if [ "$TABLES" -eq "0" ] || [ -z "$TABLES" ]; then
  echo "   Creating DynamoDB tables..."
  ./scripts/utilities/create-tables.sh
else
  echo -e "${GREEN}✓ Tables already exist (${TABLES} tables found)${NC}"
fi

# Kill any existing backend server
echo -e "\n${YELLOW}5. Starting backend API server...${NC}"
pkill -f "node local-test-server" || true
sleep 2

# Set environment variables and start server
export DYNAMODB_ENDPOINT=http://localhost:8000
export TABLE_PREFIX=ordernimbus-local
export AWS_REGION=us-west-1
export AWS_ACCESS_KEY_ID=local
export AWS_SECRET_ACCESS_KEY=local

# Start the backend server in the background
nohup node local-test-server.js > local-server.log 2>&1 &
BACKEND_PID=$!
echo -e "${GREEN}✓ Backend server started (PID: $BACKEND_PID)${NC}"

# Start frontend
echo -e "\n${YELLOW}6. Starting React frontend...${NC}"
# Kill any existing frontend process
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
sleep 2

# Start frontend
cd app/frontend
nohup npm start > ../../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ../..
echo -e "${GREEN}✓ Frontend started (PID: $FRONTEND_PID)${NC}"

# Wait for services to start
echo -e "\n${YELLOW}7. Waiting for services to initialize...${NC}"
for i in {1..15}; do
  echo -n "."
  sleep 1
done
echo ""

# Check if services are running
echo -e "\n${YELLOW}8. Verifying services...${NC}"
echo "-----------------------------------"

# Check Docker containers
echo -n "Docker containers: "
CONTAINER_COUNT=$(docker ps --format "table {{.Names}}" | grep ordernimbus | wc -l)
if [ "$CONTAINER_COUNT" -gt "0" ]; then
  echo -e "${GREEN}✓ $CONTAINER_COUNT running${NC}"
else
  echo -e "${RED}✗ Not running${NC}"
fi

# Check Backend API
echo -n "Backend API (port 3001): "
if curl -s http://localhost:3001/api/stores -H "userId: test-user" > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Running${NC}"
else
  echo -e "${RED}✗ Not responding${NC}"
fi

# Check Authentication endpoint
echo -n "Authentication API: "
AUTH_RESPONSE=$(curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test@ordernimbus.com\",\"password\":\"Test123!\"}" \
  -s 2>/dev/null | jq -r '.success' 2>/dev/null)

if [ "$AUTH_RESPONSE" = "true" ]; then
  echo -e "${GREEN}✓ Working${NC}"
else
  echo -e "${RED}✗ Not working${NC}"
fi

# Check Frontend
echo -n "Frontend (port 3000): "
if curl -s http://localhost:3000 > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Running${NC}"
else
  echo -e "${YELLOW}⏳ Still starting...${NC}"
fi

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}🎉 OrderNimbus is ready!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "📍 Access Points:"
echo "   Frontend:       http://localhost:3000"
echo "   Backend API:    http://localhost:3001"
echo "   DynamoDB Admin: http://localhost:8001"
echo ""
echo "🔐 Test Credentials:"
echo "   Email:    test@ordernimbus.com"
echo "   Password: Test123!"
echo ""
echo "📝 Additional Users:"
echo "   You can register new users through the signup page"
echo ""
echo "🛑 To stop all services, run: ./stop-local-env.sh"
echo ""
echo -e "${YELLOW}Note: If the frontend is still loading, wait a moment and refresh${NC}"