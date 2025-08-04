#!/bin/bash

# Alternative local development script using Node.js directly
# Bypasses SAM/Docker mounting issues entirely

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

echo -e "${PURPLE}🚀 Starting OrderNimbus (Node.js Direct Mode)${NC}"
echo "=================================================="

# Cleanup function
cleanup() {
    echo -e "${YELLOW}🛑 Shutting down services...${NC}"
    pkill -f "node server.js" 2>/dev/null || true
    pkill -f "react-scripts" 2>/dev/null || true
    docker-compose down 2>/dev/null || true
    echo -e "${GREEN}✅ Cleanup complete${NC}"
    exit 0
}

trap cleanup EXIT INT TERM

# Start Docker services (without SAM)
echo -e "${BLUE}🐳 Starting Docker services...${NC}"
docker-compose up -d

# Wait for services
echo -e "${BLUE}⏳ Waiting for services...${NC}"
sleep 5

# Configure AWS
export AWS_ACCESS_KEY_ID=local
export AWS_SECRET_ACCESS_KEY=local
export AWS_DEFAULT_REGION=us-east-1

# Create DynamoDB tables
echo -e "${BLUE}📊 Creating DynamoDB tables...${NC}"
tables=(
    "ordernimbus-local-sales"
    "ordernimbus-local-inventory"
    "ordernimbus-local-stores"
    "ordernimbus-local-products"
    "ordernimbus-local-aggregates"
    "ordernimbus-local-password-reset-tokens"
    "ordernimbus-local-user-sessions"
    "ordernimbus-local-conversations"
    "ordernimbus-local-forecasts"
    "ordernimbus-local-data-uploads"
    "ordernimbus-local-oauth-states"
)

for table in "${tables[@]}"; do
    aws dynamodb describe-table --table-name $table --endpoint-url http://localhost:8000 >/dev/null 2>&1 || \
    aws dynamodb create-table \
        --table-name $table \
        --attribute-definitions AttributeName=id,AttributeType=S \
        --key-schema AttributeName=id,KeyType=HASH \
        --billing-mode PAY_PER_REQUEST \
        --endpoint-url http://localhost:8000 \
        --no-cli-pager >/dev/null 2>&1 && echo "  ✓ $table created" || echo "  • $table exists"
done

# Create Node.js API server
echo -e "${BLUE}📦 Creating Node.js API server...${NC}"
cat > server.js << 'EOF'
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Import Lambda handlers
const handlers = {
  '/api/stores': require('./lambda/store-management'),
  '/api/shopify/connect': require('./lambda/shopify-oauth'),
  '/api/shopify/callback': require('./lambda/shopify-oauth'),
  '/api/shopify/sync': require('./lambda/shopify-integration'),
  '/api/data/ingest': require('./lambda/data-ingestion'),
  '/api/forecast': require('./lambda/forecast-api'),
  '/api/auth/reset-password': require('./lambda/password-reset'),
  '/api/data/analyze': require('./lambda/data-analysis-engine')
};

// Set environment variables
process.env.ENVIRONMENT = 'local';
process.env.DYNAMODB_ENDPOINT = 'http://localhost:8000';
process.env.TABLE_PREFIX = 'ordernimbus-local';

// Route all API calls to Lambda handlers
Object.keys(handlers).forEach(path => {
  app.all(path, async (req, res) => {
    try {
      const event = {
        httpMethod: req.method,
        path: req.path,
        headers: req.headers,
        body: JSON.stringify(req.body),
        queryStringParameters: req.query,
        pathParameters: req.params
      };
      
      const result = await handlers[path].handler(event);
      
      res.status(result.statusCode || 200);
      Object.keys(result.headers || {}).forEach(key => {
        res.setHeader(key, result.headers[key]);
      });
      res.send(result.body ? JSON.parse(result.body) : '');
    } catch (error) {
      console.error('Handler error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

app.listen(3001, '0.0.0.0', () => {
  console.log('API server running on http://localhost:3001');
});
EOF

# Install dependencies
echo -e "${BLUE}📦 Installing dependencies...${NC}"
npm install express cors 2>/dev/null || true

# Start the Node.js server
echo -e "${BLUE}⚡ Starting API server...${NC}"
node server.js &

# Start React frontend
echo -e "${BLUE}🌐 Starting React frontend...${NC}"
cd app/frontend
npm start &
cd ../..

echo ""
echo -e "${GREEN}=========================================="
echo -e "🎉 Local Environment Ready!"
echo -e "==========================================${NC}"
echo ""
echo -e "${BLUE}📍 Service URLs:${NC}"
echo "  • Frontend:       http://localhost:3000"
echo "  • API:           http://localhost:3001"
echo "  • DynamoDB Admin: http://localhost:8001"
echo "  • MailHog:       http://localhost:8025"
echo ""
echo -e "${GREEN}Happy coding! 🚀${NC}"

wait