#!/bin/bash

echo "Starting OrderNimbus Local Development Environment..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker is not running. Please start Docker Desktop first."
  exit 1
fi

# Start Docker containers
echo "1. Starting Docker containers..."
docker-compose up -d

# Wait for containers to be ready
echo "2. Waiting for services to be ready..."
sleep 10

# Create DynamoDB tables if needed
echo "3. Checking DynamoDB tables..."
TABLES=$(aws dynamodb list-tables --endpoint-url http://localhost:8000 --region us-west-1 2>/dev/null | jq -r '.TableNames | length')
if [ "$TABLES" -eq "0" ]; then
  echo "   Creating DynamoDB tables..."
  ./scripts/utilities/create-tables.sh
else
  echo "   Tables already exist"
fi

# Start backend API
echo "4. Starting backend API server..."
# Kill any existing process
pkill -f "node local-test-server" || true
sleep 2

# Set environment variables and start server with nodemon for hot reload
export DYNAMODB_ENDPOINT=http://localhost:8000
export TABLE_PREFIX=ordernimbus-local
export AWS_REGION=us-west-1
export AWS_ACCESS_KEY_ID=local
export AWS_SECRET_ACCESS_KEY=local
nohup npx nodemon local-test-server.js > local-server.log 2>&1 &

# Start frontend
echo "5. Starting React frontend..."
# Kill any existing process
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
sleep 2

# Start frontend
cd app/frontend && nohup npm start > ../../frontend.log 2>&1 &
cd ../..

# Wait for services to start
echo "6. Waiting for services to start..."
sleep 15

# Check if services are running
echo -e "\n✅ Checking service status..."
echo -n "   Docker containers: "
docker ps --format "table {{.Names}}" | grep ordernimbus | wc -l | xargs echo "running"

echo -n "   Backend API (port 3001): "
if curl -s http://localhost:3001/api/stores -H "userId: test-user" > /dev/null 2>&1; then
  echo "✅ Running"
else
  echo "❌ Not responding"
fi

echo -n "   Frontend (port 3000): "
if curl -s http://localhost:3000 > /dev/null 2>&1; then
  echo "✅ Running"
else
  echo "❌ Not responding"
fi

echo -e "\n🚀 OrderNimbus is ready!"
echo "   Frontend: http://localhost:3000"
echo "   Backend API: http://localhost:3001"
echo "   DynamoDB Admin: http://localhost:8001"
echo ""
echo "To stop all services, run: ./stop-local-env.sh"