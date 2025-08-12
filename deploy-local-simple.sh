#!/bin/bash

# OrderNimbus Local Deployment Script
# Deploys to localhost for development and testing

set -e

# Load local configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/scripts/config-helper.sh" local

echo "🚀 Starting OrderNimbus Local Deployment"
echo "========================================"
echo ""

# Validate local environment
validate_environment local

# Create directories if they don't exist
mkdir -p scripts lambda app/frontend

echo "📦 Installing Dependencies..."
echo "-----------------------------"

# Check if frontend dependencies are installed
if [ ! -d "app/frontend/node_modules" ]; then
    echo "Installing frontend dependencies..."
    cd app/frontend
    npm install
    cd ../..
fi

echo "🔧 Setting up Local DynamoDB..."
echo "------------------------------"

# Check if DynamoDB Local is running (if using DynamoDB Local)
if command -v docker &> /dev/null; then
    # Check if DynamoDB Local container is running
    if ! docker ps | grep -q dynamodb-local; then
        echo "Starting DynamoDB Local container..."
        docker run -d --name dynamodb-local -p 8000:8000 amazon/dynamodb-local:latest
    fi
    
    # Set DynamoDB endpoint for local
    export DYNAMODB_ENDPOINT="http://localhost:8000"
    
    # Create local tables
    echo "Creating DynamoDB tables..."
    
    # Main table
    aws dynamodb create-table \
        --table-name "$TABLE_NAME" \
        --attribute-definitions \
            AttributeName=pk,AttributeType=S \
            AttributeName=sk,AttributeType=S \
        --key-schema \
            AttributeName=pk,KeyType=HASH \
            AttributeName=sk,KeyType=RANGE \
        --billing-mode PAY_PER_REQUEST \
        --endpoint-url "$DYNAMODB_ENDPOINT" \
        --region "$AWS_REGION" \
        --no-cli-pager || echo "Table may already exist"
    
    # OAuth states table
    aws dynamodb create-table \
        --table-name "${STACK_PREFIX}-oauth-states" \
        --attribute-definitions AttributeName=state,AttributeType=S \
        --key-schema AttributeName=state,KeyType=HASH \
        --billing-mode PAY_PER_REQUEST \
        --endpoint-url "$DYNAMODB_ENDPOINT" \
        --region "$AWS_REGION" \
        --no-cli-pager || echo "OAuth states table may already exist"
        
else
    echo "⚠️  Docker not found. You'll need to set up DynamoDB Local manually."
    echo "   Or use AWS DynamoDB by configuring AWS credentials."
fi

echo "🌐 Building Frontend..."
echo "---------------------"

# Build frontend with local configuration
cd app/frontend
REACT_APP_API_URL="$API_URL" \
REACT_APP_ENVIRONMENT="local" \
REACT_APP_REGION="$AWS_REGION" \
npm run build

cd ../..

echo "⚡ Starting Local Services..."
echo "----------------------------"

# Create a simple local server script if it doesn't exist
if [ ! -f "local-server.js" ]; then
    cat > local-server.js << 'EOF'
const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

// Enable CORS
app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true
}));

// Parse JSON
app.use(express.json());

// Serve static files from frontend build
app.use(express.static(path.join(__dirname, 'app/frontend/build')));

// API routes (basic implementation for local testing)
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Local OrderNimbus API', timestamp: new Date().toISOString() });
});

app.get('/api/stores', (req, res) => {
    res.json({ stores: [], count: 0, message: 'Local development - no stores yet' });
});

app.get('/api/products', (req, res) => {
    res.json({ products: [], count: 0, storeId: req.query.storeId });
});

app.get('/api/orders', (req, res) => {
    res.json({ orders: [], count: 0, storeId: req.query.storeId });
});

app.get('/api/customers', (req, res) => {
    res.json({ customers: [], count: 0, storeId: req.query.storeId });
});

app.get('/api/inventory', (req, res) => {
    res.json({ inventory: [], count: 0, storeId: req.query.storeId });
});

// Shopify OAuth endpoints
app.post('/api/shopify/connect', (req, res) => {
    const { userId, storeDomain } = req.body;
    console.log('Shopify connect request:', { userId, storeDomain });
    
    // In local mode, return a mock auth URL
    res.json({
        authUrl: `http://localhost:3001/api/shopify/mock-callback?shop=${storeDomain}&userId=${userId}`,
        state: 'mock-local-state'
    });
});

app.get('/api/shopify/mock-callback', (req, res) => {
    const { shop, userId } = req.query;
    
    // Return HTML that posts message back to parent
    res.send(`
        <!DOCTYPE html>
        <html>
            <head><title>Local OAuth Success</title></head>
            <body>
                <div style="padding: 40px; text-align: center; font-family: Arial, sans-serif;">
                    <h2>✅ Local Development Mode</h2>
                    <p>Store: <strong>${shop}</strong></p>
                    <p>This is a mock OAuth callback for local testing.</p>
                </div>
                <script>
                    if (window.opener) {
                        window.opener.postMessage({
                            type: 'shopify-oauth-success',
                            data: {
                                success: true,
                                storeId: 'local-store-' + Date.now(),
                                storeName: '${shop}',
                                userId: '${userId}'
                            }
                        }, '*');
                        setTimeout(() => window.close(), 2000);
                    }
                </script>
            </body>
        </html>
    `);
});

// Catch-all handler for React Router
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'app/frontend/build/index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🚀 OrderNimbus Local Server running on http://localhost:${PORT}`);
    console.log(`📱 Frontend available at: http://localhost:${PORT}`);
    console.log(`🔌 API available at: http://localhost:${PORT}/api`);
    console.log('');
    console.log('To stop the server, press Ctrl+C');
});
EOF
fi

# Install express and cors if not already installed
if [ ! -f "package.json" ]; then
    echo "Initializing local server dependencies..."
    npm init -y
    npm install express cors
fi

echo "✅ Local Deployment Complete!"
echo "============================"
echo ""
echo "🌐 Frontend URL: $APP_URL"
echo "🔌 API URL: $API_URL"
echo "📊 DynamoDB: ${DYNAMODB_ENDPOINT:-AWS}"
echo ""
echo "To start the local server:"
echo "  node local-server.js"
echo ""
echo "To start the React dev server (in another terminal):"
echo "  cd app/frontend && npm start"
echo ""
echo "To stop local services:"
echo "  ./destroy-local-simple.sh"
echo ""
echo "📝 Note: This is a development setup."
echo "   Use deploy-aws-simple.sh for production deployment."