// Local authentication handler for development
// This simulates Cognito authentication for local testing

const crypto = require('crypto');

// Mock user database
const mockUsers = new Map();

// Default test user
mockUsers.set('test@ordernimbus.com', {
  email: 'test@ordernimbus.com',
  password: 'Test123!',
  userId: 'test-user-123',
  companyId: 'test-company-123',
  companyName: 'Test Company',
  role: 'admin'
});

exports.handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  const path = event.path;
  const body = JSON.parse(event.body || '{}');

  try {
    // Handle login
    if (path === '/api/auth/login' && event.httpMethod === 'POST') {
      const { email, password } = body;
      
      const user = mockUsers.get(email);
      
      if (!user || user.password !== password) {
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({
            success: false,
            error: 'Invalid credentials'
          })
        };
      }

      // Generate mock tokens
      const tokens = {
        AccessToken: 'mock-access-token-' + crypto.randomBytes(16).toString('hex'),
        RefreshToken: 'mock-refresh-token-' + crypto.randomBytes(16).toString('hex'),
        IdToken: createMockIdToken(user),
        ExpiresIn: 3600,
        TokenType: 'Bearer'
      };

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          tokens
        })
      };
    }

    // Handle register
    if (path === '/api/auth/register' && event.httpMethod === 'POST') {
      const { email, password, companyName, firstName, lastName } = body;
      
      if (mockUsers.has(email)) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            success: false,
            error: 'User already exists'
          })
        };
      }

      const userId = 'user-' + crypto.randomBytes(8).toString('hex');
      const companyId = 'company-' + crypto.randomBytes(8).toString('hex');
      
      const newUser = {
        email,
        password,
        userId,
        companyId,
        companyName: companyName || 'New Company',
        firstName,
        lastName,
        role: 'admin'
      };

      mockUsers.set(email, newUser);

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          message: 'Registration successful',
          userId,
          companyId,
          companyName: newUser.companyName
        })
      };
    }

    // Handle password reset request
    if (path === '/api/auth/forgot-password' && event.httpMethod === 'POST') {
      const { email } = body;
      
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          message: 'Password reset email sent (mock)'
        })
      };
    }

    // Handle refresh token
    if (path === '/api/auth/refresh' && event.httpMethod === 'POST') {
      const { refreshToken } = body;
      
      // In real implementation, validate the refresh token
      // For local testing, just return new tokens
      const tokens = {
        AccessToken: 'mock-access-token-' + crypto.randomBytes(16).toString('hex'),
        ExpiresIn: 3600,
        TokenType: 'Bearer'
      };

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          tokens
        })
      };
    }

    // Unknown route
    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: 'Route not found'
      })
    };

  } catch (error) {
    console.error('Auth handler error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: 'Internal server error'
      })
    };
  }
};

// Helper function to create a mock ID token (JWT-like structure)
function createMockIdToken(user) {
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };

  const payload = {
    sub: user.userId,
    email: user.email,
    'custom:company_id': user.companyId,
    'custom:company_name': user.companyName,
    'custom:role': user.role,
    'custom:first_name': user.firstName || '',
    'custom:last_name': user.lastName || '',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600
  };

  // Create a mock JWT (not cryptographically signed for local testing)
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mockSignature = 'mock-signature';

  return `${encodedHeader}.${encodedPayload}.${mockSignature}`;
}