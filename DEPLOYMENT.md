# OrderNimbus Deployment Guide

## Overview

OrderNimbus now supports configurable deployments for both local development and AWS production environments.

## Configuration

Configuration is managed through `config.json`:

```json
{
  "environments": {
    "local": {
      "APP_URL": "http://localhost:3000",
      "API_URL": "http://localhost:3001",
      "CLOUDFRONT_ENABLED": false
    },
    "aws": {
      "APP_URL": "https://app.ordernimbus.com", 
      "API_URL": "https://vawl88ehne.execute-api.us-west-1.amazonaws.com/production",
      "CLOUDFRONT_ENABLED": true
    }
  }
}
```

## Local Development

### Deploy Locally
```bash
./deploy-local-simple.sh
```

### Start Services
```bash
node local-server.js
```

### Cleanup
```bash
./destroy-local-simple.sh
```

## AWS Production

### Deploy to AWS
```bash
./deploy-aws-simple.sh
```

### Cleanup AWS
```bash
./destroy-aws-simple.sh
```

## URLs

**Local:**
- Frontend: http://localhost:3001
- API: http://localhost:3001/api

**AWS:**
- Frontend: https://app.ordernimbus.com
- API: https://vawl88ehne.execute-api.us-west-1.amazonaws.com/production
EOF < /dev/null