# Local Authentication Guide

## Quick Start

To start the OrderNimbus platform with authentication support:

```bash
./simple-start.sh
```

## Test Credentials

Default test user:
- **Email**: test@ordernimbus.com
- **Password**: Test123!

## Authentication Endpoints

The local development server now includes full authentication support:

### Login
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@ordernimbus.com","password":"Test123!"}'
```

### Register New User
```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email":"user@example.com",
    "password":"SecurePass123",
    "companyName":"My Company",
    "firstName":"John",
    "lastName":"Doe"
  }'
```

### Forgot Password
```bash
curl -X POST http://localhost:3001/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}'
```

### Refresh Token
```bash
curl -X POST http://localhost:3001/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"your-refresh-token-here"}'
```

## How It Works

1. **Local Auth Handler**: A mock authentication handler (`lambda/local-auth-handler.js`) simulates Cognito authentication for local development.

2. **JWT Tokens**: The system generates mock JWT tokens that work with the frontend authentication flow.

3. **User Storage**: Users are stored in memory during the session. Restarting the server will reset to default users.

4. **Frontend Integration**: The React frontend at http://localhost:3000 fully integrates with these authentication endpoints.

## Troubleshooting

### Authentication not working?
1. Ensure the backend server is running: `curl http://localhost:3001/api/auth/login`
2. Check server logs: `tail -f local-server.log`
3. Restart the environment: `./stop-local-env.sh && ./simple-start.sh`

### Frontend can't connect?
1. Verify the API URL in frontend: Should be `http://127.0.0.1:3001` for local development
2. Check CORS is enabled (it is by default in local-test-server.js)
3. Clear browser cache and cookies

### Need to reset users?
Simply restart the server to reset all users to defaults:
```bash
./stop-local-env.sh
./simple-start.sh
```

## Production vs Local

- **Local**: Uses mock authentication with in-memory user storage
- **Production**: Uses AWS Cognito with proper user pools and JWT validation
- **Configuration**: The frontend automatically detects the environment and uses the appropriate endpoints