# API Migration Guide

## Overview
The OrderNimbus backend has been modernized from a basic Express server to a production-ready REST API with enterprise-grade features.

## Key Improvements

### 1. Security Enhancements
- **Helmet.js** for security headers (CSP, HSTS, etc.)
- **Input sanitization** to prevent XSS attacks
- **JWT-based authentication** with refresh tokens
- **AWS Cognito integration** support
- **Rate limiting** per endpoint category
- **CORS configuration** with whitelisted origins

### 2. API Structure
```
/api/v1/
├── /health         # Health check endpoints
├── /auth          # Authentication endpoints
├── /tenants       # Tenant-scoped operations
│   ├── /{id}/forecasts    # Forecast management
│   └── /{id}/data         # Data upload/management
└── /api-docs      # Swagger documentation
```

### 3. Middleware Stack
1. Security (Helmet)
2. CORS
3. Compression
4. Body parsing
5. Logging
6. Input sanitization
7. Rate limiting
8. Authentication
9. Validation
10. Error handling

### 4. Error Handling
- Centralized error handler
- Consistent error format
- Proper HTTP status codes
- Detailed error messages in development
- Safe error messages in production

### 5. Validation
- Request validation using express-validator
- Type checking
- Format validation
- Business rule validation
- Custom validators for complex rules

### 6. Database Integration
- DynamoDB integration
- Connection pooling
- Error recovery
- Transaction support

## Migration Steps

### Step 1: Environment Setup
```bash
# Copy environment template
cp .env.example .env

# Edit .env with your configuration
nano .env
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Database Setup
For local development with DynamoDB Local:
```bash
# Install DynamoDB Local
npm install -g dynamodb-local

# Start DynamoDB Local
dynamodb-local start
```

For AWS DynamoDB:
- Configure AWS credentials
- Create required tables (users, forecasts, data, uploads)

### Step 4: Start the Server
```bash
# Development mode
npm run dev

# Production mode
npm start

# Legacy server (if needed)
npm run start:legacy
```

## API Endpoints

### Authentication

#### POST /api/v1/auth/login
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123"
}
```

#### POST /api/v1/auth/register
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123",
  "confirmPassword": "SecurePassword123",
  "name": "John Doe",
  "organizationName": "Acme Corp"
}
```

#### POST /api/v1/auth/reset-password
```json
{
  "email": "user@example.com"
}
```

#### POST /api/v1/auth/refresh-token
```json
{
  "refreshToken": "your-refresh-token"
}
```

### Forecasts

#### POST /api/v1/tenants/{tenantId}/forecasts
Headers: `Authorization: Bearer {token}`
```json
{
  "productId": "PROD-001",
  "storeId": "STORE-001",
  "forecastPeriod": 30,
  "algorithm": "ensemble",
  "granularity": "daily"
}
```

#### GET /api/v1/tenants/{tenantId}/forecasts
Query params: `?limit=20&offset=0&status=completed&sortBy=createdAt&sortOrder=desc`

#### GET /api/v1/tenants/{tenantId}/forecasts/{forecastId}
Get specific forecast details with results

### Data Management

#### POST /api/v1/tenants/{tenantId}/data/upload
```json
{
  "dataType": "sales",
  "format": "json",
  "data": [
    {
      "date": "2024-01-01",
      "productId": "PROD-001",
      "quantity": 100,
      "price": 29.99
    }
  ]
}
```

#### POST /api/v1/tenants/{tenantId}/data/bulk
```json
{
  "records": [
    {
      "date": "2024-01-01T00:00:00Z",
      "productId": "PROD-001",
      "quantity": 100,
      "price": 29.99
    }
  ]
}
```

## Testing

### Using cURL
```bash
# Health check
curl http://localhost:3000/api/v1/health

# Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123456"}'

# Create forecast (with auth)
curl -X POST http://localhost:3000/api/v1/tenants/{tenantId}/forecasts \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"forecastPeriod":30,"algorithm":"ensemble"}'
```

### Using Postman
1. Import the OpenAPI spec from `/api-docs`
2. Set up environment variables
3. Use the generated collection

## Monitoring

### Health Checks
- `/api/v1/health` - Basic health
- `/api/v1/health/detailed` - Detailed health with database status
- `/api/v1/health/ready` - Readiness probe (k8s/ECS)
- `/api/v1/health/live` - Liveness probe (k8s/ECS)

### Metrics
- Request/response times logged
- Error rates tracked
- Rate limit headers exposed
- Memory usage monitored

## Security Best Practices

1. **Never commit `.env` files**
2. **Rotate JWT secrets regularly**
3. **Use HTTPS in production**
4. **Enable rate limiting**
5. **Validate all inputs**
6. **Sanitize user data**
7. **Use prepared statements**
8. **Implement RBAC**
9. **Audit log sensitive operations**
10. **Regular security updates**

## Troubleshooting

### Common Issues

#### CORS Errors
- Check `ALLOWED_ORIGINS` in `.env`
- Ensure credentials are included in requests

#### Authentication Failures
- Verify JWT_SECRET matches
- Check token expiration
- Ensure Cognito is configured (if using)

#### Rate Limiting
- Check rate limit headers
- Adjust limits in configuration
- Implement retry logic

#### Database Connection
- Verify AWS credentials
- Check table names
- Ensure region is correct

## Support

For issues or questions:
- Check API documentation at `/api-docs`
- Review error messages and logs
- Contact support@ordernimbus.com