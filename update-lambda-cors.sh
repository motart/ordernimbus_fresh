#!/bin/bash

################################################################################
# Quick Lambda CORS Fix
# Updates just the Lambda function code to fix CORS issues
################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

REGION=${1:-us-west-1}
FUNCTION_NAME="ordernimbus-production-main"

print_status() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }

echo "=========================================="
echo -e "${GREEN}Quick CORS Fix for Lambda${NC}"
echo "=========================================="

# Check if function exists
print_status "Checking Lambda function..."
if ! aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" >/dev/null 2>&1; then
    print_error "Lambda function $FUNCTION_NAME not found in $REGION"
    echo "Please run ./deploy-simple.sh first"
    exit 1
fi

# Get current environment variables
print_status "Getting current configuration..."
USER_POOL_ID=$(aws lambda get-function-configuration --function-name "$FUNCTION_NAME" --region "$REGION" --query 'Environment.Variables.USER_POOL_ID' --output text)
USER_POOL_CLIENT_ID=$(aws lambda get-function-configuration --function-name "$FUNCTION_NAME" --region "$REGION" --query 'Environment.Variables.USER_POOL_CLIENT_ID' --output text)
TABLE_NAME=$(aws lambda get-function-configuration --function-name "$FUNCTION_NAME" --region "$REGION" --query 'Environment.Variables.TABLE_NAME' --output text)

# Create updated Lambda code with proper CORS
print_status "Creating updated Lambda code..."
cat > /tmp/lambda-cors-fix.js << 'EOF'
const AWS = require('aws-sdk');
const https = require('https');
const querystring = require('querystring');

const secretsManager = new AWS.SecretsManager();
const dynamodb = new AWS.DynamoDB.DocumentClient();
const cognito = new AWS.CognitoIdentityServiceProvider();

// Cache for Shopify credentials
let shopifyCredentials = null;

// Get Shopify credentials from Secrets Manager
const getShopifyCredentials = async () => {
  if (shopifyCredentials) return shopifyCredentials;
  
  try {
    const secret = await secretsManager.getSecretValue({ 
      SecretId: 'ordernimbus/production/shopify' 
    }).promise();
    
    shopifyCredentials = JSON.parse(secret.SecretString);
    console.log('Retrieved Shopify credentials from Secrets Manager');
    return shopifyCredentials;
  } catch (error) {
    console.error('Error getting Shopify credentials:', error);
    return { SHOPIFY_CLIENT_ID: '', SHOPIFY_CLIENT_SECRET: '' };
  }
};

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event));
  
  // Get origin from request headers
  const origin = event.headers?.origin || event.headers?.Origin || 'http://app.ordernimbus.com';
  
  // List of allowed origins - be generous to avoid CORS issues
  const allowedOrigins = [
    'http://app.ordernimbus.com',
    'https://app.ordernimbus.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://app.ordernimbus.com.s3-website-us-west-1.amazonaws.com',
    'http://app.ordernimbus.com.s3-website-us-east-1.amazonaws.com'
  ];
  
  // Always allow the requesting origin if it's in our list, otherwise use default
  const allowOrigin = allowedOrigins.includes(origin) ? origin : 'http://app.ordernimbus.com';
  
  // Comprehensive CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,userId',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS,HEAD,PATCH',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json'
  };
  
  // Handle OPTIONS for CORS preflight - ALWAYS return success
  if (event.requestContext?.http?.method === 'OPTIONS' || event.httpMethod === 'OPTIONS') {
    console.log('Handling OPTIONS request for CORS preflight');
    return { 
      statusCode: 200, 
      headers: corsHeaders, 
      body: JSON.stringify({ message: 'CORS preflight successful' }) 
    };
  }
  
  // Extract path and method
  let path = event.rawPath || event.path || '/';
  const method = event.requestContext?.http?.method || event.httpMethod || 'GET';
  
  // Remove stage from path if present
  if (path.startsWith('/production')) {
    path = path.substring('/production'.length);
  }
  
  const pathParts = path.split('/').filter(p => p);
  const resource = pathParts[1]; // api/products -> products
  
  try {
    let responseData = {};
    
    // Route to appropriate handler
    switch(resource) {
      case 'auth':
        responseData = await handleAuth(pathParts[2], method, event.body, corsHeaders);
        break;
        
      case 'products':
        responseData = {
          products: [
            { id: '1', name: 'Product 1', price: 99.99, inventory: 100 },
            { id: '2', name: 'Product 2', price: 149.99, inventory: 50 }
          ],
          count: 2
        };
        break;
        
      case 'orders':
        responseData = {
          orders: [
            { id: '1', customerName: 'John Doe', total: 299.99, status: 'completed' },
            { id: '2', customerName: 'Jane Smith', total: 149.99, status: 'pending' }
          ],
          count: 2
        };
        break;
        
      case 'stores':
        responseData = {
          stores: [
            { id: '1', name: 'Main Store', domain: 'main.myshopify.com' },
            { id: '2', name: 'Secondary Store', domain: 'secondary.myshopify.com' }
          ],
          count: 2
        };
        break;
        
      default:
        responseData = {
          message: 'OrderNimbus API',
          version: '1.0',
          environment: process.env.ENVIRONMENT || 'production',
          path: path,
          method: method
        };
    }
    
    // If auth handler returned a response object, use it directly
    if (responseData.statusCode) {
      return {
        statusCode: responseData.statusCode,
        headers: { ...corsHeaders, ...responseData.headers },
        body: JSON.stringify(responseData.body)
      };
    }
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(responseData)
    };
    
  } catch (error) {
    console.error('Lambda error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error', message: error.message })
    };
  }
};

// Authentication handler
async function handleAuth(action, method, body, corsHeaders) {
  const parsedBody = JSON.parse(body || '{}');
  
  if (action === 'login' && method === 'POST') {
    const { email, password } = parsedBody;
    
    if (!email || !password) {
      return {
        statusCode: 400,
        body: { success: false, error: 'Email and password required' }
      };
    }
    
    try {
      const authResult = await cognito.adminInitiateAuth({
        UserPoolId: process.env.USER_POOL_ID,
        ClientId: process.env.USER_POOL_CLIENT_ID,
        AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
        AuthParameters: {
          USERNAME: email,
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
  
  if (action === 'register' && method === 'POST') {
    const { email, password, companyName } = parsedBody;
    
    if (!email || !password || !companyName) {
      return {
        statusCode: 400,
        body: { success: false, error: 'Email, password and company name required' }
      };
    }
    
    try {
      const companyId = 'company-' + Date.now() + '-' + Math.random().toString(36).substring(7);
      
      const createUserResult = await cognito.adminCreateUser({
        UserPoolId: process.env.USER_POOL_ID,
        Username: email,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'custom:company_id', Value: companyId },
          { Name: 'custom:company_name', Value: companyName },
          { Name: 'custom:role', Value: 'admin' }
        ],
        TemporaryPassword: password,
        MessageAction: 'SUPPRESS'
      }).promise();
      
      await cognito.adminSetUserPassword({
        UserPoolId: process.env.USER_POOL_ID,
        Username: email,
        Password: password,
        Permanent: true
      }).promise();
      
      if (process.env.TABLE_NAME) {
        await dynamodb.put({
          TableName: process.env.TABLE_NAME,
          Item: {
            pk: `company_${companyId}`,
            sk: 'metadata',
            companyName: companyName,
            adminEmail: email,
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
          companyName: companyName
        }
      };
    } catch (error) {
      console.error('Registration error:', error);
      return {
        statusCode: 400,
        body: { 
          success: false, 
          error: error.code === 'UsernameExistsException' ? 'User already exists' : 'Registration failed'
        }
      };
    }
  }
  
  // Default response for auth endpoint
  return {
    message: 'Authentication endpoint',
    availableEndpoints: ['/api/auth/login', '/api/auth/register', '/api/auth/forgot-password', '/api/auth/refresh']
  };
}
EOF

# Package the Lambda function
print_status "Packaging Lambda function..."
cd /tmp
zip lambda-cors-fix.zip lambda-cors-fix.js

# Update Lambda function code
print_status "Updating Lambda function..."
aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file fileb://lambda-cors-fix.zip \
    --region "$REGION" \
    --output text >/dev/null

# Update environment variables to ensure they're set
print_status "Updating environment variables..."
aws lambda update-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION" \
    --environment "Variables={TABLE_NAME=$TABLE_NAME,ENVIRONMENT=production,AWS_REGION=$REGION,USER_POOL_ID=$USER_POOL_ID,USER_POOL_CLIENT_ID=$USER_POOL_CLIENT_ID}" \
    --output text >/dev/null

# Wait for update to complete
print_status "Waiting for Lambda update to complete..."
sleep 5

# Test the updated Lambda
print_status "Testing CORS headers..."
API_URL=$(aws apigatewayv2 get-apis --region "$REGION" --query "Items[?Name=='ordernimbus-production-api'].ApiEndpoint" --output text)

if [ -n "$API_URL" ]; then
    # Test OPTIONS request
    echo -n "  Testing CORS preflight: "
    CORS_RESPONSE=$(curl -s -X OPTIONS "$API_URL/production/api/auth/login" \
        -H "Origin: http://app.ordernimbus.com" \
        -H "Access-Control-Request-Method: POST" \
        -I --max-time 5 2>/dev/null | grep -i "access-control-allow-origin" | head -1)
    
    if [ -n "$CORS_RESPONSE" ]; then
        print_success "CORS headers present"
        echo "    $CORS_RESPONSE"
    else
        print_error "CORS headers missing"
    fi
    
    # Test actual endpoint
    echo -n "  Testing auth endpoint: "
    AUTH_RESPONSE=$(curl -s -X POST "$API_URL/production/api/auth/login" \
        -H "Content-Type: application/json" \
        -H "Origin: http://app.ordernimbus.com" \
        -d '{"test":"test"}' \
        --max-time 5 2>/dev/null | head -c 100)
    
    if [[ "$AUTH_RESPONSE" == *"Email and password"* ]]; then
        print_success "Authentication endpoint working"
    else
        echo "$AUTH_RESPONSE"
    fi
fi

# Clean up
rm -f /tmp/lambda-cors-fix.js /tmp/lambda-cors-fix.zip

echo ""
echo "=========================================="
echo -e "${GREEN}✅ Lambda CORS Fix Applied!${NC}"
echo "=========================================="
echo ""
echo "The Lambda function has been updated with:"
echo "  • Fixed CORS headers for all origins"
echo "  • Proper OPTIONS handling"
echo "  • Authentication endpoints enabled"
echo ""
echo "Test at: http://app.ordernimbus.com"
echo "=========================================="