# OrderNimbus Local Development Setup

## Quick Start

1. **Start all services:**
   ```bash
   ./start-local-env.sh
   ```

2. **Access the application:**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001
   - DynamoDB Admin: http://localhost:8001

3. **Stop all services:**
   ```bash
   ./stop-local-env.sh
   ```

## Prerequisites

- Docker Desktop installed and running
- Node.js 18+ installed
- AWS CLI installed (for DynamoDB operations)

## Architecture

The local environment consists of:
- **Frontend**: React app on port 3000
- **Backend**: Express server wrapping Lambda functions on port 3001
- **Database**: DynamoDB local in Docker
- **Other services**: Redis, LocalStack, MailHog in Docker

## Testing Shopify Integration

1. Create a Shopify store:
   ```bash
   SHOPIFY_TOKEN=your-shopify-token ./test-shopify-flow.sh
   ```

2. Or use the UI:
   - Click "Connect Shopify" in the Stores page
   - Enter store domain: `ordernimbus-dev`
   - The dev token is automatically used in development mode

## CSV Upload

The CSV upload feature supports:
- Orders
- Products
- Inventory
- Customers

Upload via the "Import Data" button on any store card.

## Troubleshooting

### Frontend compilation errors
If you see module not found errors:
```bash
cd app/frontend
npm install
npm start
```

### Backend not responding
Check the logs:
```bash
tail -f local-server.log
```

### DynamoDB issues
Check if tables exist:
```bash
aws dynamodb list-tables --endpoint-url http://localhost:8000 --region us-west-1
```

Recreate tables if needed:
```bash
./scripts/utilities/create-tables.sh
```

## Manual Service Management

### Start individual services:
```bash
# Docker containers only
docker-compose up -d

# Backend API only
export DYNAMODB_ENDPOINT=http://localhost:8000
export TABLE_PREFIX=ordernimbus-local
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=local
export AWS_SECRET_ACCESS_KEY=local
node local-test-server.js

# Frontend only
cd app/frontend && npm start
```

### Check service status:
```bash
# Docker containers
docker ps

# Backend API
curl http://localhost:3001/api/stores -H "userId: test-user"

# Frontend
curl http://localhost:3000
```

## Development Workflow

1. **Make backend changes**: Edit Lambda functions in `/lambda` directory
2. **Make frontend changes**: Edit React components in `/app/frontend/src`
3. **No rebuild needed**: Changes are reflected immediately
4. **Test API directly**: Use the test script or curl commands

## Environment Variables

The local environment uses these defaults:
- `DYNAMODB_ENDPOINT`: http://localhost:8000
- `TABLE_PREFIX`: ordernimbus-local
- `AWS_REGION`: us-west-1
- `DEFAULT_DEV_TOKEN`: (set your own Shopify dev token)