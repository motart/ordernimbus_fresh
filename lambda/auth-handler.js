// Authentication Lambda Handler for OrderNimbus
// Handles login, register, forgot password, and token refresh

const AWS = require('aws-sdk');
const cognito = new AWS.CognitoIdentityServiceProvider();
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  console.log('Auth Event:', JSON.stringify(event));
  
  // Whitelist of allowed origins
  const allowedOrigins = [
    'https://app.ordernimbus.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ];
  
  // Get the origin from the request
  const origin = event.headers?.origin || event.headers?.Origin || '';
  
  // Check if origin is allowed
  const allowOrigin = allowedOrigins.includes(origin) ? origin : 'https://app.ordernimbus.com';
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json'
  };
  
  // Handle OPTIONS for CORS
  if (event.httpMethod === 'OPTIONS' || event.requestContext?.http?.method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }
  
  const path = event.path || event.rawPath || '/';
  const method = event.httpMethod || event.requestContext?.http?.method || 'GET';
  const body = JSON.parse(event.body || '{}');
  
  // Extract auth action from path (e.g., /api/auth/login -> login)
  const pathParts = path.split('/').filter(p => p);
  const authAction = pathParts[pathParts.length - 1];
  
  try {
    let response;
    
    switch (authAction) {
      case 'login':
        response = await handleLogin(body);
        break;
        
      case 'register':
        response = await handleRegister(body);
        break;
        
      case 'forgot-password':
        response = await handleForgotPassword(body);
        break;
        
      case 'refresh':
        response = await handleRefreshToken(body);
        break;
        
      default:
        response = {
          statusCode: 200,
          body: {
            message: 'OrderNimbus Authentication API',
            endpoints: [
              '/api/auth/login',
              '/api/auth/register',
              '/api/auth/forgot-password',
              '/api/auth/refresh'
            ]
          }
        };
    }
    
    return {
      statusCode: response.statusCode || 200,
      headers: corsHeaders,
      body: JSON.stringify(response.body)
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

// Input validation helper
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  // Remove any potential script tags or SQL injection attempts
  return input.replace(/<script[^>]*>.*?<\/script>/gi, '')
              .replace(/[<>"']/g, '')
              .trim()
              .substring(0, 500); // Limit length
}

async function handleLogin(body) {
  const { email, password } = body;
  
  if (!email || !password) {
    return {
      statusCode: 400,
      body: {
        success: false,
        error: 'Email and password are required'
      }
    };
  }
  
  // Validate and sanitize inputs
  const sanitizedEmail = sanitizeInput(email).toLowerCase();
  if (!validateEmail(sanitizedEmail)) {
    return {
      statusCode: 400,
      body: {
        success: false,
        error: 'Invalid email format'
      }
    };
  }
  
  // Password length check
  if (password.length < 8 || password.length > 128) {
    return {
      statusCode: 400,
      body: {
        success: false,
        error: 'Invalid password'
      }
    };
  }
  
  try {
    const authResult = await cognito.adminInitiateAuth({
      UserPoolId: process.env.USER_POOL_ID,
      ClientId: process.env.USER_POOL_CLIENT_ID,
      AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
      AuthParameters: {
        USERNAME: sanitizedEmail,
        PASSWORD: password
      }
    }).promise();
    
    return {
      statusCode: 200,
      body: {
        success: true,
        tokens: {
          AccessToken: authResult.AuthenticationResult.AccessToken,
          RefreshToken: authResult.AuthenticationResult.RefreshToken,
          IdToken: authResult.AuthenticationResult.IdToken,
          ExpiresIn: authResult.AuthenticationResult.ExpiresIn,
          TokenType: authResult.AuthenticationResult.TokenType
        }
      }
    };
  } catch (error) {
    console.error('Login error:', error);
    return {
      statusCode: 401,
      body: {
        success: false,
        error: error.code === 'NotAuthorizedException' ? 'Invalid credentials' : 'Login failed'
      }
    };
  }
}

async function handleRegister(body) {
  const { email, password, companyName, firstName, lastName } = body;
  
  if (!email || !password || !companyName) {
    return {
      statusCode: 400,
      body: {
        success: false,
        error: 'Email, password, and company name are required'
      }
    };
  }
  
  // Validate and sanitize inputs
  const sanitizedEmail = sanitizeInput(email).toLowerCase();
  const sanitizedCompanyName = sanitizeInput(companyName);
  const sanitizedFirstName = firstName ? sanitizeInput(firstName) : '';
  const sanitizedLastName = lastName ? sanitizeInput(lastName) : '';
  
  if (!validateEmail(sanitizedEmail)) {
    return {
      statusCode: 400,
      body: {
        success: false,
        error: 'Invalid email format'
      }
    };
  }
  
  if (sanitizedCompanyName.length < 2 || sanitizedCompanyName.length > 100) {
    return {
      statusCode: 400,
      body: {
        success: false,
        error: 'Company name must be between 2 and 100 characters'
      }
    };
  }
  
  // Validate password strength
  if (password.length < 8) {
    return {
      statusCode: 400,
      body: {
        success: false,
        error: 'Password must be at least 8 characters long'
      }
    };
  }
  
  if (!/[A-Z]/.test(password)) {
    return {
      statusCode: 400,
      body: {
        success: false,
        error: 'Password must contain at least one uppercase letter'
      }
    };
  }
  
  if (!/[a-z]/.test(password)) {
    return {
      statusCode: 400,
      body: {
        success: false,
        error: 'Password must contain at least one lowercase letter'
      }
    };
  }
  
  if (!/[0-9]/.test(password)) {
    return {
      statusCode: 400,
      body: {
        success: false,
        error: 'Password must contain at least one number'
      }
    };
  }
  
  try {
    // Generate unique company ID
    const companyId = 'company-' + Date.now() + '-' + Math.random().toString(36).substring(7);
    
    // Create user in Cognito
    const createUserResult = await cognito.adminCreateUser({
      UserPoolId: process.env.USER_POOL_ID,
      Username: sanitizedEmail,
      UserAttributes: [
        { Name: 'email', Value: sanitizedEmail },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'custom:company_id', Value: companyId },
        { Name: 'custom:company_name', Value: sanitizedCompanyName },
        { Name: 'custom:role', Value: 'admin' }
      ],
      TemporaryPassword: password,
      MessageAction: 'SUPPRESS'
    }).promise();
    
    // Set permanent password
    await cognito.adminSetUserPassword({
      UserPoolId: process.env.USER_POOL_ID,
      Username: sanitizedEmail,
      Password: password,
      Permanent: true
    }).promise();
    
    // Store company info in DynamoDB
    if (process.env.TABLE_NAME) {
      await dynamodb.put({
        TableName: process.env.TABLE_NAME,
        Item: {
          pk: `company_${companyId}`,
          sk: 'metadata',
          companyName: sanitizedCompanyName,
          adminEmail: sanitizedEmail,
          firstName: sanitizedFirstName,
          lastName: sanitizedLastName,
          createdAt: new Date().toISOString()
        }
      }).promise();
    }
    
    return {
      statusCode: 200,
      body: {
        success: true,
        message: 'Registration successful',
        userId: createUserResult.User.Username,
        companyId: companyId,
        companyName: sanitizedCompanyName
      }
    };
  } catch (error) {
    console.error('Registration error:', error);
    return {
      statusCode: 400,
      body: {
        success: false,
        error: error.code === 'UsernameExistsException' ? 'User already exists' : 'Registration failed: ' + error.message
      }
    };
  }
}

async function handleForgotPassword(body) {
  const { email } = body;
  
  if (!email) {
    return {
      statusCode: 400,
      body: {
        success: false,
        error: 'Email is required'
      }
    };
  }
  
  // Validate and sanitize email
  const sanitizedEmail = sanitizeInput(email).toLowerCase();
  if (!validateEmail(sanitizedEmail)) {
    // Don't reveal if email is invalid to prevent enumeration
    return {
      statusCode: 200,
      body: {
        success: true,
        message: 'If the email exists, a password reset link has been sent'
      }
    };
  }
  
  try {
    await cognito.forgotPassword({
      ClientId: process.env.USER_POOL_CLIENT_ID,
      Username: sanitizedEmail
    }).promise();
    
    return {
      statusCode: 200,
      body: {
        success: true,
        message: 'Password reset email sent'
      }
    };
  } catch (error) {
    console.error('Forgot password error:', error);
    // Always return success to avoid user enumeration
    return {
      statusCode: 200,
      body: {
        success: true,
        message: 'If the email exists, a password reset link has been sent'
      }
    };
  }
}

async function handleRefreshToken(body) {
  const { refreshToken } = body;
  
  if (!refreshToken) {
    return {
      statusCode: 400,
      body: {
        success: false,
        error: 'Refresh token is required'
      }
    };
  }
  
  try {
    const authResult = await cognito.adminInitiateAuth({
      UserPoolId: process.env.USER_POOL_ID,
      ClientId: process.env.USER_POOL_CLIENT_ID,
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      AuthParameters: {
        REFRESH_TOKEN: refreshToken
      }
    }).promise();
    
    return {
      statusCode: 200,
      body: {
        success: true,
        tokens: {
          AccessToken: authResult.AuthenticationResult.AccessToken,
          IdToken: authResult.AuthenticationResult.IdToken,
          ExpiresIn: authResult.AuthenticationResult.ExpiresIn,
          TokenType: authResult.AuthenticationResult.TokenType
        }
      }
    };
  } catch (error) {
    console.error('Refresh token error:', error);
    return {
      statusCode: 401,
      body: {
        success: false,
        error: 'Invalid refresh token'
      }
    };
  }
}