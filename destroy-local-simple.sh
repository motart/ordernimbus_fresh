#!/bin/bash

# OrderNimbus Local Cleanup Script
# Stops and cleans up local development environment

set -e

# Load local configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/scripts/config-helper.sh" local

echo "🧹 OrderNimbus Local Cleanup"
echo "============================"
echo ""

echo "🛑 Stopping Local Services..."
echo "-----------------------------"

# Stop any running Node.js processes on port 3001
if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null ; then
    echo "Stopping local API server on port 3001..."
    lsof -Pi :3001 -sTCP:LISTEN -t | xargs kill -9 || echo "No process found on port 3001"
fi

# Stop React dev server on port 3000 (if running)
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null ; then
    echo "Stopping React dev server on port 3000..."
    lsof -Pi :3000 -sTCP:LISTEN -t | xargs kill -9 || echo "No process found on port 3000"
fi

echo "🗄️ Cleaning up Local DynamoDB..."
echo "--------------------------------"

# Stop and remove DynamoDB Local container if running
if command -v docker &> /dev/null; then
    if docker ps | grep -q dynamodb-local; then
        echo "Stopping DynamoDB Local container..."
        docker stop dynamodb-local || echo "Container may not be running"
        docker rm dynamodb-local || echo "Container may not exist"
    fi
    
    # Clean up any other OrderNimbus local containers
    docker ps -a | grep ordernimbus-local | awk '{print $1}' | xargs -r docker rm -f || echo "No OrderNimbus local containers found"
fi

# If using AWS DynamoDB for local development, optionally clean up tables
read -p "🤔 Do you want to delete local DynamoDB tables? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Deleting local DynamoDB tables..."
    
    if [ -n "${DYNAMODB_ENDPOINT:-}" ]; then
        # Local DynamoDB
        aws dynamodb delete-table --table-name "$TABLE_NAME" --endpoint-url "$DYNAMODB_ENDPOINT" --region "$AWS_REGION" || echo "Main table may not exist"
        aws dynamodb delete-table --table-name "${STACK_PREFIX}-oauth-states" --endpoint-url "$DYNAMODB_ENDPOINT" --region "$AWS_REGION" || echo "OAuth states table may not exist"
    else
        # AWS DynamoDB (be careful!)
        echo "⚠️  Warning: This will delete AWS DynamoDB tables!"
        read -p "Are you SURE you want to delete AWS tables? (type 'YES' to confirm): " confirm
        if [ "$confirm" = "YES" ]; then
            aws dynamodb delete-table --table-name "$TABLE_NAME" --region "$AWS_REGION" || echo "Main table may not exist"
            aws dynamodb delete-table --table-name "${STACK_PREFIX}-oauth-states" --region "$AWS_REGION" || echo "OAuth states table may not exist"
        else
            echo "Skipping AWS table deletion"
        fi
    fi
fi

echo "📁 Cleaning up Build Files..."
echo "-----------------------------"

# Clean up build directories
if [ -d "app/frontend/build" ]; then
    echo "Removing frontend build directory..."
    rm -rf app/frontend/build
fi

# Clean up local server files
if [ -f "local-server.js" ]; then
    read -p "🤔 Remove local-server.js? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -f local-server.js
        echo "Removed local-server.js"
    fi
fi

# Clean up local package files if they were created by deployment
if [ -f "package.json" ] && grep -q '"name": "ordernimbus"' package.json 2>/dev/null; then
    read -p "🤔 Remove package.json and node_modules created by local deployment? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -f package.json package-lock.json
        rm -rf node_modules
        echo "Removed local deployment npm files"
    fi
fi

echo "🗑️ Cleaning up Temporary Files..."
echo "---------------------------------"

# Clean up any temporary files
rm -rf /tmp/ordernimbus-* 2>/dev/null || true
rm -rf .ordernimbus-local-* 2>/dev/null || true

echo "✅ Local Cleanup Complete!"
echo "========================="
echo ""
echo "🧹 Cleaned up:"
echo "   • Stopped local servers (ports 3000, 3001)"
echo "   • Stopped DynamoDB Local container"
echo "   • Cleaned build directories"
echo "   • Removed temporary files"
echo ""
echo "💡 To start fresh local development:"
echo "   ./deploy-local-simple.sh"
echo ""
echo "🏭 For production deployment:"
echo "   ./deploy-aws-simple.sh"