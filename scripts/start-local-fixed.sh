#!/bin/bash

# OrderNimbus Local Development Startup Script - Fixed for macOS Docker Issues
# Uses SAM with container reuse and proper Docker configuration

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${PURPLE}🚀 Starting OrderNimbus Local Development Environment (Fixed)${NC}"
echo "=================================================="

# Function to check if command exists
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}❌ $1 is not installed. Please install it first.${NC}"
        exit 1
    fi
}

# Function to check and kill process on port
kill_port() {
    local port=$1
    local service=$2
    echo -e "${BLUE}🔍 Checking port $port for $service...${NC}"
    
    # Find process using the port
    local pid=$(lsof -ti:$port 2>/dev/null || true)
    
    if [ ! -z "$pid" ]; then
        echo -e "${YELLOW}⚠️  Port $port is in use by PID $pid. Killing process...${NC}"
        kill -9 $pid 2>/dev/null || true
        sleep 2
        echo -e "${GREEN}✅ Port $port cleared${NC}"
    else
        echo -e "${GREEN}✅ Port $port is available${NC}"
    fi
}

# Cleanup function
cleanup() {
    echo ""
    echo -e "${YELLOW}🛑 Shutting down services...${NC}"
    
    # Kill React process if running
    if [ ! -z "$REACT_PID" ] && kill -0 $REACT_PID 2>/dev/null; then
        echo -e "${BLUE}Stopping React frontend (PID: $REACT_PID)...${NC}"
        kill -TERM $REACT_PID 2>/dev/null || true
    fi
    
    # Kill SAM process if running
    if [ ! -z "$SAM_PID" ] && kill -0 $SAM_PID 2>/dev/null; then
        echo -e "${BLUE}Stopping SAM API (PID: $SAM_PID)...${NC}"
        kill -TERM $SAM_PID 2>/dev/null || true
    fi
    
    # Kill any remaining processes on our ports
    kill_port 3000 "React Frontend"
    kill_port 3001 "SAM API"
    
    # Also kill any orphaned node processes for React
    pkill -f "react-scripts/scripts/start.js" 2>/dev/null || true
    
    # Kill any orphaned SAM processes
    pkill -f "sam local start-api" 2>/dev/null || true
    
    echo -e "${GREEN}✅ Cleanup complete${NC}"
    exit 0
}

# Set up trap for cleanup on exit
trap cleanup EXIT INT TERM

# Function to wait for service
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
check_command lsof

# Clean up any existing processes on our ports
echo -e "${BLUE}🧹 Cleaning up existing processes...${NC}"
kill_port 3000 "React Frontend"
kill_port 3001 "SAM API"

# Also kill any orphaned processes
pkill -f "react-scripts/scripts/start.js" 2>/dev/null || true
pkill -f "sam local start-api" 2>/dev/null || true

# Fix Docker Desktop settings for macOS
echo -e "${BLUE}🔧 Fixing Docker Desktop settings...${NC}"

# Reset Docker to factory defaults if having persistent issues
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo -e "${YELLOW}Detected macOS - applying Docker Desktop fixes...${NC}"
    
    # Ensure Docker is running
    if ! docker system info > /dev/null 2>&1; then
        echo -e "${BLUE}Starting Docker Desktop...${NC}"
        open -a Docker
        sleep 10
        
        # Wait for Docker to be ready
        while ! docker system info > /dev/null 2>&1; do
            echo "Waiting for Docker to start..."
            sleep 2
        done
    fi
fi

# Ensure network exists
echo -e "${BLUE}🔧 Setting up Docker network...${NC}"
docker network create ordernimbus-network 2>/dev/null || true

# Clean up any existing containers
echo -e "${BLUE}🧹 Cleaning up existing Docker containers...${NC}"
docker-compose down 2>/dev/null || true
docker stop $(docker ps -aq --filter name=ordernimbus) 2>/dev/null || true
docker rm $(docker ps -aq --filter name=ordernimbus) 2>/dev/null || true

# Start Docker services
echo -e "${BLUE}🐳 Starting Docker services...${NC}"
docker-compose up -d --force-recreate --remove-orphans

# Wait for services to be ready
wait_for_service "DynamoDB" 8000
wait_for_service "LocalStack" 4566
wait_for_service "MailHog" 1025
wait_for_service "Redis" 6379

# Configure AWS CLI for local development
echo -e "${BLUE}🔧 Configuring AWS CLI for local development...${NC}"
export AWS_ACCESS_KEY_ID=local
export AWS_SECRET_ACCESS_KEY=local
export AWS_DEFAULT_REGION=us-east-1

# Create DynamoDB tables
echo -e "${BLUE}📊 Creating DynamoDB tables...${NC}"

# Create tables with error suppression for existing ones
tables=(
    "ordernimbus-local-sales:userId,S:id,S"
    "ordernimbus-local-inventory:userId,S:id,S"
    "ordernimbus-local-stores:userId,S:id,S"
    "ordernimbus-local-products:userId,S:id,S"
    "ordernimbus-local-aggregates:userId,S:id,S"
    "ordernimbus-local-password-reset-tokens:email,S:token,S"
    "ordernimbus-local-user-sessions:userId,S:sessionId,S"
    "ordernimbus-local-conversations:userId,S:timestamp,N"
    "ordernimbus-local-forecasts:userId,S:forecastId,S"
    "ordernimbus-local-data-uploads:userId,S:uploadId,S"
    "ordernimbus-local-oauth-states:state,S"
)

for table_info in "${tables[@]}"; do
    IFS=':' read -r table_name key1 type1 key2 type2 <<< "$table_info"
    
    if [ -z "$key2" ]; then
        # Single key table
        aws dynamodb create-table --no-cli-pager \
            --table-name $table_name \
            --attribute-definitions AttributeName=$key1,AttributeType=$type1 \
            --key-schema AttributeName=$key1,KeyType=HASH \
            --billing-mode PAY_PER_REQUEST \
            --endpoint-url http://localhost:8000 \
            >/dev/null 2>&1 && echo "  ✓ $table_name created" || echo "  • $table_name already exists"
    else
        # Composite key table
        aws dynamodb create-table --no-cli-pager \
            --table-name $table_name \
            --attribute-definitions \
                AttributeName=$key1,AttributeType=$type1 \
                AttributeName=$key2,AttributeType=$type2 \
            --key-schema \
                AttributeName=$key1,KeyType=HASH \
                AttributeName=$key2,KeyType=RANGE \
            --billing-mode PAY_PER_REQUEST \
            --endpoint-url http://localhost:8000 \
            >/dev/null 2>&1 && echo "  ✓ $table_name created" || echo "  • $table_name already exists"
    fi
done

echo -e "${GREEN}✅ DynamoDB tables ready${NC}"

# Create S3 buckets in LocalStack
echo -e "${BLUE}🪣 Creating S3 buckets in LocalStack...${NC}"
aws s3 mb s3://ordernimbus-local-data-uploads --no-cli-pager --endpoint-url http://localhost:4566 >/dev/null 2>&1 && echo "  ✓ Data uploads bucket created" || echo "  • Data uploads bucket already exists"
aws s3 mb s3://ordernimbus-local-user-data --no-cli-pager --endpoint-url http://localhost:4566 >/dev/null 2>&1 && echo "  ✓ User data bucket created" || echo "  • User data bucket already exists"
aws s3 mb s3://ordernimbus-local-frontend --no-cli-pager --endpoint-url http://localhost:4566 >/dev/null 2>&1 && echo "  ✓ Frontend bucket created" || echo "  • Frontend bucket already exists"
echo -e "${GREEN}✅ S3 buckets ready${NC}"

# Build SAM application with container to avoid mount issues
echo -e "${BLUE}🏗️  Building SAM application (using container build)...${NC}"

# Clean build directory first
rm -rf .aws-sam/build

# Build with --use-container flag to avoid mount issues
sam build --use-container --cached

# Start SAM Local API with warm containers
echo -e "${BLUE}⚡ Starting SAM Local API with warm containers...${NC}"
sam local start-api \
    --env-vars env.json \
    --docker-network ordernimbus-network \
    --port 3001 \
    --warm-containers EAGER \
    --host 0.0.0.0 &

SAM_PID=$!
echo "SAM Local API PID: $SAM_PID"

# Wait for SAM API to be ready
sleep 10
wait_for_service "SAM API" 3001

# Start React frontend
echo -e "${BLUE}🌐 Starting React frontend...${NC}"
if [ -d "app/frontend" ]; then
    cd app/frontend
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        echo -e "${BLUE}📦 Installing frontend dependencies...${NC}"
        npm install
    fi
    
    # Create .env.local file for React
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
    
    # Set PORT environment variable to avoid conflicts
    export PORT=3000
    
    # Start React app
    npm start &
    REACT_PID=$!
    echo "React frontend PID: $REACT_PID"
    
    cd ../..
fi

# Display service URLs
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
echo -e "${YELLOW}📝 Tips:${NC}"
echo "  • API endpoints are available at http://127.0.0.1:3001/api/*"
echo "  • View emails sent by the app at http://localhost:8025"
echo "  • Browse DynamoDB tables at http://localhost:8001"
echo "  • Use 'sam logs -f' to tail Lambda logs"
echo "  • Use 'docker-compose logs -f' to tail service logs"
echo ""
echo -e "${YELLOW}⚠️  To stop all services:${NC}"
echo "  • Press Ctrl+C (services will be cleaned up automatically)"
echo "  • Or run: ./scripts/stop-local.sh"
echo ""
echo -e "${GREEN}Happy coding! 🚀${NC}"

# Keep script running and wait for both processes
wait $SAM_PID $REACT_PID