#!/bin/bash

# Update Lambda function with correct redirect URI logic

REGION=us-west-1
LAMBDA_NAME="ordernimbus-production-main"
API_URL=$(aws cloudformation describe-stacks --stack-name ordernimbus-production --region $REGION --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' --output text)

echo "Updating Lambda function to use dynamic API URL: $API_URL"

# Create temporary directory for Lambda package
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR" || exit 1

# Install dependencies
npm init -y >/dev/null 2>&1
npm install aws-sdk@2 crypto --save >/dev/null 2>&1

# Create the Lambda function with dynamic redirect URI
cat > index.js << 'LAMBDA_EOF'
// OrderNimbus Lambda with Shopify Integration
const AWS = require('aws-sdk');
const crypto = require('crypto');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const cognito = new AWS.CognitoIdentityServiceProvider();
const secretsManager = new AWS.SecretsManager();

let shopifyCredentials = null;

async function getShopifyCredentials() {
  if (shopifyCredentials) return shopifyCredentials;
  try {
    const secret = await secretsManager.getSecretValue({ 
      SecretId: 'ordernimbus/production/shopify' 
    }).promise();
    shopifyCredentials = JSON.parse(secret.SecretString);
    return shopifyCredentials;
  } catch (error) {
    console.error('Error getting Shopify credentials:', error);
    throw new Error('Shopify credentials not configured');
  }
}

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event));
  
  const method = event.requestContext?.http?.method || event.httpMethod || 'GET';
  const origin = event.headers?.origin || event.headers?.Origin || 'http://app.ordernimbus.com';
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,userId',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS,HEAD,PATCH',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json'
  };
  
  if (method === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'OK' }) };
  }
  
  let path = event.rawPath || event.path || '/';
  if (path.startsWith('/production')) path = path.substring(11);
  
  try {
    const pathParts = path.split('/').filter(Boolean);
    const resource = pathParts[1];
    const action = pathParts[2];
    
    if (resource === 'shopify') {
      return await handleShopify(action, method, event, corsHeaders);
    }
    
    if (resource === 'auth') {
      return await handleAuth(action, method, event.body, corsHeaders);
    }
    
    if (resource === 'stores') {
      const body = JSON.parse(event.body || '{}');
      const userId = event.headers?.userId || event.headers?.userid || 'anonymous';
      
      if (method === 'POST') {
        const storeId = 'store-' + Date.now();
        await dynamodb.put({
          TableName: process.env.TABLE_NAME || 'ordernimbus-production-main',
          Item: { pk: 'user_' + userId, sk: 'store_' + storeId, storeId, ...body, createdAt: new Date().toISOString() }
        }).promise();
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, store: { id: storeId, ...body } }) };
      }
      
      const result = await dynamodb.query({
        TableName: process.env.TABLE_NAME || 'ordernimbus-production-main',
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
        ExpressionAttributeValues: { ':pk': 'user_' + userId, ':sk': 'store_' }
      }).promise();
      
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ stores: result.Items || [], count: result.Count || 0 }) };
    }
    
    // Mock data for other endpoints
    let responseData = {};
    switch(resource) {
      case 'products': responseData = { products: [], count: 0 }; break;
      case 'orders': responseData = { orders: [], count: 0 }; break;
      case 'inventory': responseData = { inventory: [], count: 0 }; break;
      case 'customers': responseData = { customers: [], count: 0 }; break;
      case 'notifications': responseData = { notifications: [], count: 0 }; break;
      default: responseData = { message: 'OrderNimbus API', version: '1.0' };
    }
    
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(responseData) };
    
  } catch (error) {
    console.error('Handler error:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: error.message }) };
  }
};

async function handleShopify(action, method, event, corsHeaders) {
  const body = JSON.parse(event.body || '{}');
  
  if (action === 'connect' && method === 'POST') {
    try {
      const { storeDomain, userId } = body;
      if (!storeDomain) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Store domain is required' }) };
      }
      
      const credentials = await getShopifyCredentials();
      let cleanDomain = storeDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
      if (!cleanDomain.includes('.myshopify.com')) cleanDomain += '.myshopify.com';
      
      const state = crypto.randomBytes(16).toString('hex');
      
      await dynamodb.put({
        TableName: process.env.TABLE_NAME || 'ordernimbus-production-main',
        Item: {
          pk: 'oauth_state_' + state, sk: 'shopify', userId: userId || 'unknown',
          storeDomain: cleanDomain, createdAt: new Date().toISOString(),
          ttl: Math.floor(Date.now() / 1000) + 600
        }
      }).promise();
      
      // Use API_GATEWAY_URL from environment or construct from event
      const apiGatewayUrl = process.env.API_GATEWAY_URL || 
        `https://${event.requestContext?.domainName || event.headers?.Host}${event.requestContext?.stage ? '/' + event.requestContext.stage : ''}`;
      const redirectUri = apiGatewayUrl + '/api/shopify/callback';
      
      console.log('Using redirect URI:', redirectUri);
      
      const authUrl = 'https://' + cleanDomain + '/admin/oauth/authorize?' +
        'client_id=' + credentials.SHOPIFY_CLIENT_ID + '&' +
        'scope=read_products,read_orders,read_inventory,read_customers,read_analytics&' +
        'redirect_uri=' + encodeURIComponent(redirectUri) + '&state=' + state;
      
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ authUrl, message: 'Redirect user to Shopify OAuth' }) };
    } catch (error) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: error.message }) };
    }
  }
  
  if (action === 'callback' && method === 'GET') {
    try {
      const { code, state, shop } = event.queryStringParameters || {};
      
      if (!code || !state || !shop) {
        return { statusCode: 400, headers: { ...corsHeaders, 'Content-Type': 'text/html' },
          body: '<html><body><script>window.opener.postMessage({type:"shopify-oauth-error",error:"Missing parameters"},"*");window.close();</script></body></html>' };
      }
      
      const stateResult = await dynamodb.get({
        TableName: process.env.TABLE_NAME || 'ordernimbus-production-main',
        Key: { pk: 'oauth_state_' + state, sk: 'shopify' }
      }).promise();
      
      if (!stateResult.Item) {
        return { statusCode: 400, headers: { ...corsHeaders, 'Content-Type': 'text/html' },
          body: '<html><body><script>window.opener.postMessage({type:"shopify-oauth-error",error:"Invalid state"},"*");window.close();</script></body></html>' };
      }
      
      const credentials = await getShopifyCredentials();
      const https = require('https');
      
      const tokenData = await new Promise((resolve, reject) => {
        const postData = JSON.stringify({
          client_id: credentials.SHOPIFY_CLIENT_ID,
          client_secret: credentials.SHOPIFY_CLIENT_SECRET,
          code: code
        });
        
        const req = https.request({
          hostname: shop, path: '/admin/oauth/access_token', method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': postData.length }
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => res.statusCode === 200 ? resolve(JSON.parse(data)) : reject(new Error('Failed to get token')));
        });
        
        req.on('error', reject);
        req.write(postData);
        req.end();
      });
      
      const userId = stateResult.Item.userId;
      const storeId = 'store-' + Date.now();
      
      await dynamodb.put({
        TableName: process.env.TABLE_NAME || 'ordernimbus-production-main',
        Item: {
          pk: 'user_' + userId, sk: 'store_' + storeId, storeId,
          name: shop.replace('.myshopify.com', ''), shopifyDomain: shop,
          accessToken: tokenData.access_token, scope: tokenData.scope,
          createdAt: new Date().toISOString()
        }
      }).promise();
      
      await dynamodb.delete({
        TableName: process.env.TABLE_NAME || 'ordernimbus-production-main',
        Key: { pk: 'oauth_state_' + state, sk: 'shopify' }
      }).promise();
      
      return { statusCode: 200, headers: { ...corsHeaders, 'Content-Type': 'text/html' },
        body: '<html><body><h2>Successfully connected!</h2><script>window.opener.postMessage({type:"shopify-oauth-success",data:{storeId:"' + storeId + '",storeName:"' + shop + '"}},"*");setTimeout(()=>window.close(),2000);</script></body></html>' };
    } catch (error) {
      return { statusCode: 500, headers: { ...corsHeaders, 'Content-Type': 'text/html' },
        body: '<html><body><script>window.opener.postMessage({type:"shopify-oauth-error",error:"' + error.message + '"},"*");window.close();</script></body></html>' };
    }
  }
  
  if (action === 'sync' && method === 'POST') {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, message: 'Sync initiated' }) };
  }
  
  return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Shopify endpoint' }) };
}

async function handleAuth(action, method, body, corsHeaders) {
  try {
    const parsedBody = JSON.parse(body || '{}');
    
    if (action === 'login' && method === 'POST') {
      const { email, password } = parsedBody;
      if (!email || !password) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Email and password required' }) };
      }
      
      if (!process.env.USER_POOL_ID || !process.env.USER_POOL_CLIENT_ID) {
        return { statusCode: 503, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Auth not configured' }) };
      }
      
      try {
        const authResult = await cognito.adminInitiateAuth({
          UserPoolId: process.env.USER_POOL_ID,
          ClientId: process.env.USER_POOL_CLIENT_ID,
          AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
          AuthParameters: { USERNAME: email, PASSWORD: password }
        }).promise();
        
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({
          success: true,
          tokens: {
            AccessToken: authResult.AuthenticationResult.AccessToken,
            RefreshToken: authResult.AuthenticationResult.RefreshToken,
            IdToken: authResult.AuthenticationResult.IdToken,
            ExpiresIn: authResult.AuthenticationResult.ExpiresIn,
            TokenType: authResult.AuthenticationResult.TokenType
          }
        })};
      } catch (error) {
        return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Invalid credentials' }) };
      }
    }
    
    if (action === 'register' && method === 'POST') {
      const { email, password, companyName } = parsedBody;
      if (!email || !password || !companyName) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Missing required fields' }) };
      }
      
      try {
        const companyId = 'company-' + Date.now();
        await cognito.adminCreateUser({
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
        
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, message: 'Registration successful' }) };
      } catch (error) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, error: error.message }) };
      }
    }
    
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Auth endpoint' }) };
  } catch (error) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: error.message }) };
  }
}
LAMBDA_EOF

# Package Lambda
zip -qr lambda-package.zip .

# Update Lambda function
aws lambda update-function-code \
    --function-name "$LAMBDA_NAME" \
    --zip-file fileb://lambda-package.zip \
    --region "$REGION" \
    --output text >/dev/null

echo "Lambda function updated successfully!"

# Cleanup
cd /
rm -rf "$TEMP_DIR"

# Test the updated endpoint
echo ""
echo "Testing Shopify connect endpoint..."
RESPONSE=$(curl -s https://ql30cet378.execute-api.us-west-1.amazonaws.com/production/api/shopify/connect \
    -X POST \
    -H "Content-Type: application/json" \
    -d '{"storeDomain":"test.myshopify.com","userId":"test"}' | jq -r '.authUrl' | head -c 100)

if [[ "$RESPONSE" == *"ql30cet378"* ]]; then
    echo "✅ Shopify OAuth now using correct API Gateway URL"
else
    echo "⚠️  Response: $RESPONSE..."
fi