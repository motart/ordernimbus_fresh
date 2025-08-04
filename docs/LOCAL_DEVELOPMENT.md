# Local Development Guide

## Overview

OrderNimbus uses AWS SAM (Serverless Application Model) for local development, providing a production-like environment on your local machine.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Local Machine                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────────┐        ┌──────────────┐          │
│  │ React App    │───────▶│ SAM Local    │          │
│  │ Port: 3000   │        │ Port: 3001   │          │
│  └──────────────┘        └──────┬───────┘          │
│                                  │                   │
│                                  ▼                   │
│  ┌─────────────────────────────────────────┐        │
│  │         Docker Containers               │        │
│  ├─────────────────────────────────────────┤        │
│  │ • DynamoDB Local (8000)                 │        │
│  │ • LocalStack (4566)                     │        │
│  │ • Redis (6379)                          │        │
│  │ • MailHog (1025/8025)                   │        │
│  └─────────────────────────────────────────┘        │
│                                                      │
└─────────────────────────────────────────────────────┘
```

## Setup Instructions

### 1. Install Prerequisites

#### macOS
```bash
# Install Homebrew (if not installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install required tools
brew install awscli
brew install aws-sam-cli
brew install docker
brew install node@18
brew install python@3.9

# Install Docker Desktop
brew install --cask docker
```

#### Linux (Ubuntu/Debian)
```bash
# Update packages
sudo apt update

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install Python
sudo apt install python3.9 python3-pip

# Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Install SAM CLI
pip install aws-sam-cli

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

#### Windows
```powershell
# Install Chocolatey (if not installed)
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install required tools
choco install awscli
choco install aws-sam-cli
choco install docker-desktop
choco install nodejs
choco install python
```

### 2. Clone and Setup Repository

```bash
# Clone repository
git clone https://github.com/yourusername/ordernimbus.git
cd ordernimbus

# Install dependencies
npm install
cd app/frontend && npm install && cd ../..
cd lambda && npm install && cd ..
```

### 3. Configure Local Environment

```bash
# Copy environment template
cp env.json.example env.json

# Edit env.json with your settings
# No AWS credentials needed for local development!
```

## Starting Development Environment

### Automatic Start (Recommended)

```bash
# Start all services with one command
./scripts/start-local.sh
```

This script will:
1. Start Docker containers (DynamoDB, LocalStack, Redis, MailHog)
2. Create DynamoDB tables
3. Create S3 buckets in LocalStack
4. Build SAM application
5. Start SAM Local API
6. Start React frontend

### Manual Start

```bash
# 1. Start Docker services
docker-compose up -d

# 2. Build SAM application
sam build --use-container

# 3. Start SAM Local API
sam local start-api \
  --env-vars env.json \
  --docker-network ordernimbus-network \
  --port 3001

# 4. In another terminal, start React
cd app/frontend
npm start
```

## Development Workflow

### 1. Making Lambda Changes

```bash
# Edit Lambda function
code lambda/chatbot-handler.js

# SAM will auto-reload on save (with --warm-containers EAGER)
# Test your changes immediately
curl -X POST http://127.0.0.1:3001/api/chatbot \
  -H "Content-Type: application/json" \
  -d '{"message":"test"}'
```

### 2. Making Frontend Changes

```bash
# Edit React component
code app/frontend/src/components/ChatBot.tsx

# React hot-reloads automatically
# View changes at http://localhost:3000
```

### 3. Database Operations

#### View DynamoDB Tables
Open http://localhost:8001 in your browser

#### Query DynamoDB via CLI
```bash
aws dynamodb scan \
  --table-name ordernimbus-local-conversations \
  --endpoint-url http://localhost:8000
```

#### Insert Test Data
```bash
aws dynamodb put-item \
  --table-name ordernimbus-local-users \
  --item '{"userId":{"S":"test123"},"email":{"S":"test@example.com"}}' \
  --endpoint-url http://localhost:8000
```

### 4. Testing Email Functionality

All emails are captured by MailHog:
- View emails: http://localhost:8025
- SMTP server: localhost:1025

### 5. S3 Operations (LocalStack)

```bash
# List buckets
aws s3 ls --endpoint-url http://localhost:4566

# Upload file
aws s3 cp test.csv s3://ordernimbus-local-data-uploads/ \
  --endpoint-url http://localhost:4566

# Download file
aws s3 cp s3://ordernimbus-local-data-uploads/test.csv . \
  --endpoint-url http://localhost:4566
```

## Debugging

### VS Code Debugging

1. Install VS Code extensions:
   - AWS Toolkit
   - Docker
   - ESLint

2. Start debugging:
   - Press `F5` or go to Run and Debug
   - Select configuration:
     - `Debug SAM Lambda - Chatbot`
     - `Debug React Frontend`
     - `Full Stack Debug`

3. Set breakpoints in your code

### Command Line Debugging

```bash
# Start SAM with debug port
sam local start-api --debug-port 5858

# View Lambda logs
sam logs -f --tail

# View Docker logs
docker-compose logs -f dynamodb-local
```

### Chrome DevTools for Frontend

1. Open http://localhost:3000
2. Press F12 to open DevTools
3. Go to Sources tab
4. Find your source files under webpack://
5. Set breakpoints

## Testing

### Unit Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test
npm test -- --testNamePattern="ChatBot"
```

### Integration Tests

```bash
# Start local environment first
./scripts/start-local.sh

# Run integration tests
npm run test:integration
```

### Load Testing

```bash
# Install k6
brew install k6  # macOS
# or
sudo apt install k6  # Linux

# Run load test
k6 run load-tests/k6-local.js
```

## Common Issues & Solutions

### Issue: Port already in use

```bash
# Find process using port
lsof -i :3001  # macOS/Linux
netstat -ano | findstr :3001  # Windows

# Kill process
kill -9 <PID>  # macOS/Linux
taskkill /PID <PID> /F  # Windows
```

### Issue: Docker containers not starting

```bash
# Reset Docker
docker-compose down -v
docker system prune -a
docker-compose up -d
```

### Issue: SAM build fails

```bash
# Clear cache
sam build --use-container --cached --clear

# Remove .aws-sam directory
rm -rf .aws-sam
sam build
```

### Issue: DynamoDB connection refused

```bash
# Check if container is running
docker ps | grep dynamodb

# Restart container
docker-compose restart dynamodb-local

# Check logs
docker-compose logs dynamodb-local
```

### Issue: Frontend can't connect to API

```bash
# Check API is running
curl http://127.0.0.1:3001

# Check CORS settings in template.yaml
# Ensure REACT_APP_API_URL is set correctly in .env.local
```

## Environment Variables

### Lambda Functions (env.json)

```json
{
  "PasswordResetFunction": {
    "ENVIRONMENT": "local",
    "REGION": "us-east-1",
    "PASSWORD_RESET_TABLE": "ordernimbus-local-password-reset-tokens",
    "USER_POOL_ID": "local-user-pool"
  }
}
```

### React Frontend (.env.local)

```bash
REACT_APP_API_URL=http://127.0.0.1:3001
REACT_APP_ENVIRONMENT=local
REACT_APP_USER_POOL_ID=local-user-pool
REACT_APP_CLIENT_ID=local-client-id
REACT_APP_REGION=us-east-1
```

## Monitoring & Logs

### View All Logs

```bash
# SAM Lambda logs
sam logs -f

# Docker container logs
docker-compose logs -f

# React app logs
# Check browser console (F12)
```

### Performance Monitoring

```bash
# Monitor Docker resources
docker stats

# Monitor Lambda execution
sam local start-api --log-file sam.log
tail -f sam.log | grep "Duration"
```

## Clean Up

### Stop Services

```bash
# Stop everything
./scripts/stop-local.sh

# Or manually
docker-compose down
pkill -f "sam local"
pkill -f "npm start"
```

### Remove All Data

```bash
# Remove containers and volumes
docker-compose down -v

# Remove SAM build artifacts
rm -rf .aws-sam

# Remove node_modules (if needed)
rm -rf node_modules
rm -rf app/frontend/node_modules
rm -rf lambda/node_modules
```

## Tips & Best Practices

1. **Use Environment Variables**: Never hardcode sensitive data
2. **Hot Reload**: SAM and React both support hot reload - use it!
3. **Mock Data**: Use realistic mock data for better testing
4. **Git Hooks**: Set up pre-commit hooks for linting
5. **Docker Resources**: Allocate enough memory to Docker (4GB minimum)
6. **Browser Cache**: Disable cache in Chrome DevTools when debugging
7. **API Testing**: Use Postman or Insomnia for API testing
8. **Database GUI**: Use DynamoDB Admin UI at http://localhost:8001

## Additional Resources

- [AWS SAM Developer Guide](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/)
- [SAM CLI Command Reference](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-command-reference.html)
- [DynamoDB Local Usage Notes](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.UsageNotes.html)
- [LocalStack Documentation](https://docs.localstack.cloud/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)

## Support

For issues or questions:
- Check this guide first
- Search existing GitHub issues
- Create a new issue with:
  - Environment details (OS, versions)
  - Error messages
  - Steps to reproduce
  - Expected vs actual behavior