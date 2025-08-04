#!/bin/bash

# OrderNimbus Complete Clean Start Script
# Performs full cleanup and starts all services

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${PURPLE}🚀 OrderNimbus Clean Start - Full Reset & Launch${NC}"
echo "=================================================="

# Function to check if command exists
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}❌ $1 is not installed. Please install it first.${NC}"
        exit 1
    fi
}

# Complete Docker cleanup
docker_cleanup() {
    echo -e "${BLUE}🧹 Performing complete Docker cleanup...${NC}"
    
    # Stop all ordernimbus containers
    echo "  Stopping containers..."
    docker stop $(docker ps -aq --filter name=ordernimbus) 2>/dev/null || true
    
    # Remove all ordernimbus containers
    echo "  Removing containers..."
    docker rm -f $(docker ps -aq --filter name=ordernimbus) 2>/dev/null || true
    
    # Remove volumes
    echo "  Removing volumes..."
    docker volume rm $(docker volume ls -q --filter name=ordernimbus) 2>/dev/null || true
    
    # Clean up docker-compose
    echo "  Running docker-compose down..."
    docker-compose down -v --remove-orphans 2>/dev/null || true
    
    echo -e "${GREEN}✅ Docker cleanup complete${NC}"
}

# Kill processes on port
kill_port() {
    local port=$1
    local service=$2
    echo -e "${BLUE}🔍 Checking port $port for $service...${NC}"
    
    local pid=$(lsof -ti:$port 2>/dev/null || true)
    
    if [ ! -z "$pid" ]; then
        echo -e "${YELLOW}  Killing process on port $port (PID: $pid)...${NC}"
        kill -9 $pid 2>/dev/null || true
        sleep 1
    fi
    echo -e "${GREEN}✅ Port $port is clear${NC}"
}

# Cleanup function for exit
cleanup() {
    echo ""
    echo -e "${YELLOW}🛑 Shutting down services...${NC}"
    
    # Kill React process if running
    if [ ! -z "$REACT_PID" ] && kill -0 $REACT_PID 2>/dev/null; then
        kill -TERM $REACT_PID 2>/dev/null || true
    fi
    
    # Kill SAM process if running
    if [ ! -z "$SAM_PID" ] && kill -0 $SAM_PID 2>/dev/null; then
        kill -TERM $SAM_PID 2>/dev/null || true
    fi
    
    # Clean ports
    kill_port 3000 "React"
    kill_port 3001 "SAM"
    
    # Kill orphaned processes
    pkill -f "react-scripts" 2>/dev/null || true
    pkill -f "sam local" 2>/dev/null || true
    
    echo -e "${GREEN}✅ Cleanup complete${NC}"
    exit 0
}

# Set trap for cleanup
trap cleanup EXIT INT TERM

# Wait for service
wait_for_service() {
    local service_name=$1
    local port=$2
    local max_attempts=30
    local attempt=0
    
    echo -e "${BLUE}⏳ Waiting for $service_name on port $port...${NC}"
    
    while ! nc -z localhost $port 2>/dev/null; do
        attempt=$((attempt + 1))
        if [ $attempt -eq $max_attempts ]; then
            echo -e "${RED}❌ $service_name failed to start${NC}"
            return 1
        fi
        sleep 2
    done
    
    echo -e "${GREEN}✅ $service_name is ready${NC}"
}

# Check prerequisites
echo -e "${BLUE}📋 Checking prerequisites...${NC}"
check_command docker
check_command docker-compose
check_command sam
check_command aws
check_command npm
check_command node

# Complete cleanup
echo -e "${PURPLE}🧹 PHASE 1: Complete Cleanup${NC}"
echo "================================"

# Kill all processes
kill_port 3000 "React Frontend"
kill_port 3001 "SAM API"
kill_port 8000 "DynamoDB"
kill_port 8001 "DynamoDB Admin"
kill_port 4566 "LocalStack"
kill_port 6379 "Redis"
kill_port 1025 "MailHog SMTP"
kill_port 8025 "MailHog UI"

# Kill orphaned processes
pkill -f "react-scripts" 2>/dev/null || true
pkill -f "sam local" 2>/dev/null || true

# Docker cleanup
docker_cleanup

# Network setup
echo -e "${PURPLE}🔧 PHASE 2: Network Setup${NC}"
echo "================================"

# Remove and recreate network
docker network rm ordernimbus-network 2>/dev/null || true
docker network create ordernimbus-network
echo -e "${GREEN}✅ Network created${NC}"

# Start services
echo -e "${PURPLE}🐳 PHASE 3: Starting Docker Services${NC}"
echo "================================"

docker-compose up -d --force-recreate
echo -e "${GREEN}✅ Docker services started${NC}"

# Wait for services
echo -e "${PURPLE}⏳ PHASE 4: Waiting for Services${NC}"
echo "================================"

wait_for_service "DynamoDB" 8000
wait_for_service "LocalStack" 4566
wait_for_service "MailHog" 1025
wait_for_service "Redis" 6379

# Configure AWS
echo -e "${PURPLE}🔧 PHASE 5: AWS Configuration${NC}"
echo "================================"

export AWS_ACCESS_KEY_ID=local
export AWS_SECRET_ACCESS_KEY=local
export AWS_DEFAULT_REGION=us-east-1

# Create DynamoDB tables
echo -e "${BLUE}📊 Creating DynamoDB tables...${NC}"

tables=(
    "ordernimbus-local-sales:userId,S:id,S:date,S:DateIndex"
    "ordernimbus-local-inventory:userId,S:id,S"
    "ordernimbus-local-stores:userId,S:id,S"
    "ordernimbus-local-products:userId,S:id,S"
    "ordernimbus-local-aggregates:userId,S:id,S"
    "ordernimbus-local-password-reset-tokens:email,S:token,S:TokenIndex"
    "ordernimbus-local-user-sessions:userId,S:sessionId,S"
    "ordernimbus-local-conversations:userId,S:timestamp,N"
    "ordernimbus-local-forecasts:userId,S:forecastId,S:createdAt,N:CreatedAtIndex"
    "ordernimbus-local-data-uploads:userId,S:uploadId,S:uploadedAt,N:UploadTimeIndex"
)

for table_config in "${tables[@]}"; do
    IFS=':' read -r table_name key1 type1 key2 type2 <<< "$table_config"
    
    if [ -z "$key2" ]; then
        # Single key table
        aws dynamodb create-table \
            --table-name $table_name \
            --attribute-definitions AttributeName=$key1,AttributeType=$type1 \
            --key-schema AttributeName=$key1,KeyType=HASH \
            --billing-mode PAY_PER_REQUEST \
            --endpoint-url http://localhost:8000 \
            2>/dev/null || echo "  Table $table_name already exists"
    else
        # Composite key table
        aws dynamodb create-table \
            --table-name $table_name \
            --attribute-definitions \
                AttributeName=$key1,AttributeType=$type1 \
                AttributeName=$key2,AttributeType=$type2 \
            --key-schema \
                AttributeName=$key1,KeyType=HASH \
                AttributeName=$key2,KeyType=RANGE \
            --billing-mode PAY_PER_REQUEST \
            --endpoint-url http://localhost:8000 \
            2>/dev/null || echo "  Table $table_name already exists"
    fi
done

echo -e "${GREEN}✅ DynamoDB tables ready${NC}"

# Create S3 buckets
echo -e "${BLUE}🪣 Creating S3 buckets...${NC}"
aws s3 mb s3://ordernimbus-local-data-uploads --endpoint-url http://localhost:4566 2>/dev/null || true
aws s3 mb s3://ordernimbus-local-user-data --endpoint-url http://localhost:4566 2>/dev/null || true
aws s3 mb s3://ordernimbus-local-frontend --endpoint-url http://localhost:4566 2>/dev/null || true
echo -e "${GREEN}✅ S3 buckets ready${NC}"

# Build and start SAM
echo -e "${PURPLE}🏗️  PHASE 6: SAM Application${NC}"
echo "================================"

echo -e "${BLUE}Building SAM application...${NC}"
sam build

echo -e "${BLUE}Starting SAM API...${NC}"
sam local start-api \
    --env-vars env.json \
    --port 3001 \
    --host 127.0.0.1 &

SAM_PID=$!
echo "SAM API PID: $SAM_PID"

# Wait for SAM
sleep 5
wait_for_service "SAM API" 3001

# Start React
echo -e "${PURPLE}🌐 PHASE 7: React Frontend${NC}"
echo "================================"

if [ -d "app/frontend" ]; then
    cd app/frontend
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        echo -e "${BLUE}📦 Installing frontend dependencies...${NC}"
        npm install
    fi
    
    # Create .env.local
    cat > .env.local << EOF
REACT_APP_API_URL=http://127.0.0.1:3001
REACT_APP_ENVIRONMENT=local
REACT_APP_USER_POOL_ID=local-user-pool
REACT_APP_CLIENT_ID=local-client-id
REACT_APP_REGION=us-east-1
REACT_APP_ENABLE_DATA_UPLOAD=true
REACT_APP_ENABLE_CHATBOT=true
REACT_APP_ENABLE_PASSWORD_RESET=true
EOF
    
    # Start React
    export PORT=3000
    npm start &
    REACT_PID=$!
    echo "React frontend PID: $REACT_PID"
    
    cd ../..
fi

# Final status
echo ""
echo -e "${GREEN}=========================================="
echo -e "🎉 Local Development Environment Ready!"
echo -e "==========================================${NC}"
echo ""
echo -e "${BLUE}📍 Service URLs:${NC}"
echo "  • Frontend:          http://localhost:3000"
echo "  • API Gateway:       http://127.0.0.1:3001"
echo "  • DynamoDB Admin:    http://localhost:8001"
echo "  • LocalStack:        http://localhost:4566"
echo "  • MailHog UI:        http://localhost:8025"
echo ""
echo -e "${YELLOW}📝 Commands:${NC}"
echo "  • View logs: docker-compose logs -f"
echo "  • Stop all: Press Ctrl+C"
echo ""
echo -e "${GREEN}Happy coding! 🚀${NC}"

# Keep running
wait $SAM_PID $REACT_PID