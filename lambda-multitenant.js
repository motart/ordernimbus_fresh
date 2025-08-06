const AWS = require('aws-sdk');
const https = require('https');
const querystring = require('querystring');
// Note: JWT validation simplified for runtime compatibility

// AWS Services
const secretsManager = new AWS.SecretsManager();
const dynamodb = new AWS.DynamoDB.DocumentClient();
const cognito = new AWS.CognitoIdentityServiceProvider();

// Cache for credentials
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

// Validate access token using Cognito's getUser API
const validateToken = async (accessToken) => {
  if (!accessToken) throw new Error('No token provided');
  
  try {
    const userResponse = await cognito.getUser({
      AccessToken: accessToken
    }).promise();
    
    const attributes = {};
    userResponse.UserAttributes.forEach(attr => {
      attributes[attr.Name] = attr.Value;
    });
    
    return {
      userId: userResponse.Username,
      email: attributes.email,
      companyId: attributes['custom:company_id'],
      companyName: attributes['custom:company_name'],
      role: attributes['custom:role'] || 'admin'
    };
  } catch (error) {
    console.error('Token validation error:', error);
    throw new Error('Invalid or expired token');
  }
};

// Generate unique company ID
const generateCompanyId = () => {
  return `company_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
};

// Create company in DynamoDB
const createCompany = async (companyId, companyName, ownerUserId, ownerEmail) => {
  const timestamp = new Date().toISOString();
  
  try {
    // Create company record
    await dynamodb.put({
      TableName: process.env.TABLE_NAME,
      Item: {
        pk: companyId,
        sk: 'metadata',
        companyName,
        createdAt: timestamp,
        ownerId: ownerUserId,
        ownerEmail,
        status: 'active',
        plan: 'starter'
      }
    }).promise();
    
    // Create user-company association
    await dynamodb.put({
      TableName: process.env.TABLE_NAME,
      Item: {
        pk: `user_${ownerUserId}`,
        sk: companyId,
        role: 'owner',
        joinedAt: timestamp,
        email: ownerEmail
      }
    }).promise();
    
    // Create company-user association  
    await dynamodb.put({
      TableName: process.env.TABLE_NAME,
      Item: {
        pk: companyId,
        sk: `user_${ownerUserId}`,
        role: 'owner',
        addedAt: timestamp,
        email: ownerEmail,
        status: 'active'
      }
    }).promise();
    
    console.log(`Created company ${companyId} for user ${ownerUserId}`);
    return companyId;
  } catch (error) {
    console.error('Error creating company:', error);
    throw error;
  }
};

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event));
  
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*',
    'Content-Type': 'application/json'
  };
  
  // Handle OPTIONS for CORS
  if (event.requestContext?.http?.method === 'OPTIONS' || event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }
  
  // Extract path and method
  let path = event.rawPath || event.path || '/';
  const method = event.requestContext?.http?.method || event.httpMethod || 'GET';
  
  // Remove stage from path
  if (path.startsWith('/production')) {
    path = path.substring('/production'.length);
  }
  
  const pathParts = path.split('/').filter(p => p);
  const resource = pathParts[1]; // api/auth -> auth
  
  try {
    let responseData = {};
    
    // Authentication endpoints
    if (resource === 'auth') {
      const subResource = pathParts[2];
      
      if (subResource === 'register' && method === 'POST') {
        const body = JSON.parse(event.body || '{}');
        const { email, password, companyName, firstName, lastName } = body;
        
        if (!email || !password || !companyName) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Email, password, and company name are required' })
          };
        }
        
        try {
          // Create user in Cognito
          const createUserResponse = await cognito.adminCreateUser({
            UserPoolId: process.env.USER_POOL_ID,
            Username: email,
            MessageAction: 'SUPPRESS',
            TemporaryPassword: password,
            UserAttributes: [
              { Name: 'email', Value: email },
              { Name: 'email_verified', Value: 'true' },
              ...(firstName ? [{ Name: 'given_name', Value: firstName }] : []),
              ...(lastName ? [{ Name: 'family_name', Value: lastName }] : [])
            ]
          }).promise();
          
          const userId = createUserResponse.User.Username;
          
          // Set permanent password
          await cognito.adminSetUserPassword({
            UserPoolId: process.env.USER_POOL_ID,
            Username: email,
            Password: password,
            Permanent: true
          }).promise();
          
          // Generate company ID and create company
          const companyId = generateCompanyId();
          await createCompany(companyId, companyName, userId, email);
          
          // Update user with company info
          await cognito.adminUpdateUserAttributes({
            UserPoolId: process.env.USER_POOL_ID,
            Username: email,
            UserAttributes: [
              { Name: 'custom:company_id', Value: companyId },
              { Name: 'custom:company_name', Value: companyName },
              { Name: 'custom:role', Value: 'owner' }
            ]
          }).promise();
          
          responseData = {
            success: true,
            message: 'User and company created successfully',
            userId,
            companyId,
            companyName
          };
          
        } catch (error) {
          console.error('Registration error:', error);
          responseData = {
            success: false,
            error: error.message || 'Registration failed'
          };
        }
        
      } else if (subResource === 'login' && method === 'POST') {
        const body = JSON.parse(event.body || '{}');
        const { email, password } = body;
        
        if (!email || !password) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Email and password are required' })
          };
        }
        
        try {
          const authResponse = await cognito.adminInitiateAuth({
            UserPoolId: process.env.USER_POOL_ID,
            ClientId: process.env.USER_POOL_CLIENT_ID,
            AuthFlow: 'ADMIN_NO_SRP_AUTH',
            AuthParameters: {
              USERNAME: email,
              PASSWORD: password
            }
          }).promise();
          
          responseData = {
            success: true,
            tokens: authResponse.AuthenticationResult
          };
          
        } catch (error) {
          console.error('Login error:', error);
          responseData = {
            success: false,
            error: 'Invalid credentials'
          };
        }
        
      } else {
        responseData = { error: 'Auth endpoint not found' };
      }
      
    } else {
      // Protected endpoints - require authentication
      const authHeader = event.headers?.Authorization || event.headers?.authorization;
      let userContext = null;
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const token = authHeader.substring(7);
          userContext = await validateToken(token);
        } catch (error) {
          return {
            statusCode: 401,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Invalid or expired token' })
          };
        }
      } else {
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Authorization token required' })
        };
      }
      
      // Now handle business logic with company context
      switch(resource) {
        case 'stores':
          try {
            const companyId = userContext.companyId;
            
            // Query stores for this company
            const result = await dynamodb.query({
              TableName: process.env.TABLE_NAME,
              KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk_prefix)',
              ExpressionAttributeValues: {
                ':pk': companyId,
                ':sk_prefix': 'store_'
              }
            }).promise();
            
            const stores = result.Items.map(item => ({
              id: item.sk.replace('store_', ''),
              name: item.storeName || item.domain?.replace('.myshopify.com', ''),
              domain: item.domain,
              type: item.type || 'shopify',
              status: item.status || 'active',
              connectedAt: item.connectedAt,
              lastSync: item.lastSync
            }));
            
            responseData = {
              stores,
              count: stores.length,
              companyId,
              companyName: userContext.companyName
            };
            
          } catch (error) {
            console.error('Error fetching stores:', error);
            responseData = { error: 'Failed to fetch stores' };
          }
          break;
          
        case 'shopify':
          if (path.includes('/shopify/connect')) {
            try {
              const body = JSON.parse(event.body || '{}');
              const { storeDomain } = body;
              const companyId = userContext.companyId;
              
              if (!storeDomain) {
                return {
                  statusCode: 400,
                  headers: corsHeaders,
                  body: JSON.stringify({ error: 'Store domain is required' })
                };
              }
              
              const credentials = await getShopifyCredentials();
              if (!credentials.SHOPIFY_CLIENT_ID) {
                return {
                  statusCode: 500,
                  headers: corsHeaders,
                  body: JSON.stringify({ error: 'Shopify integration not configured' })
                };
              }
              
              const SHOPIFY_CLIENT_ID = credentials.SHOPIFY_CLIENT_ID;
              const API_GATEWAY_URL = 'https://v59jrtezd4.execute-api.us-west-1.amazonaws.com/production';
              const REDIRECT_URI = `${API_GATEWAY_URL}/api/shopify/callback`;
              const SCOPES = 'read_products,read_orders,read_inventory,read_customers,read_analytics';
              
              const cleanDomain = storeDomain.replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/\.myshopify\.com.*$/, '') + '.myshopify.com';
              const state = `${companyId}:${Math.random().toString(36).substring(7)}`;
              
              // Store state with company info
              await dynamodb.put({
                TableName: process.env.TABLE_NAME,
                Item: {
                  pk: `oauth_state_${state}`,
                  sk: 'shopify',
                  companyId,
                  storeDomain: cleanDomain,
                  createdAt: new Date().toISOString(),
                  ttl: Math.floor(Date.now() / 1000) + 600
                }
              }).promise();
              
              const authUrl = `https://${cleanDomain}/admin/oauth/authorize?` +
                `client_id=${SHOPIFY_CLIENT_ID}&` +
                `scope=${SCOPES}&` +
                `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
                `state=${state}`;
              
              responseData = { authUrl };
              
            } catch (error) {
              console.error('Shopify connect error:', error);
              responseData = { error: 'Failed to initiate Shopify connection' };
            }
            
          } else if (path.includes('/shopify/callback')) {
            // Handle callback (similar to before but with company context)
            const queryParams = event.queryStringParameters || {};
            const { code, state, shop } = queryParams;
            
            if (!code || !state || !shop) {
              return {
                statusCode: 400,
                headers: { 'Content-Type': 'text/html' },
                body: '<html><body><h2>Error: Missing parameters</h2></body></html>'
              };
            }
            
            try {
              // Verify state and get company info
              const stateResult = await dynamodb.get({
                TableName: process.env.TABLE_NAME,
                Key: {
                  pk: `oauth_state_${state}`,
                  sk: 'shopify'
                }
              }).promise();
              
              if (!stateResult.Item) {
                throw new Error('Invalid state');
              }
              
              const companyId = stateResult.Item.companyId;
              
              // Exchange code for token
              const credentials = await getShopifyCredentials();
              const tokenData = querystring.stringify({
                client_id: credentials.SHOPIFY_CLIENT_ID,
                client_secret: credentials.SHOPIFY_CLIENT_SECRET,
                code: code
              });
              
              const accessToken = await new Promise((resolve, reject) => {
                const options = {
                  hostname: shop,
                  path: '/admin/oauth/access_token',
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(tokenData)
                  }
                };
                
                const req = https.request(options, (res) => {
                  let data = '';
                  res.on('data', (chunk) => { data += chunk; });
                  res.on('end', () => {
                    try {
                      const result = JSON.parse(data);
                      resolve(result.access_token);
                    } catch (e) { reject(e); }
                  });
                });
                
                req.on('error', reject);
                req.write(tokenData);
                req.end();
              });
              
              // Store in company context
              const storeId = `store_${shop}`;
              await dynamodb.put({
                TableName: process.env.TABLE_NAME,
                Item: {
                  pk: companyId,
                  sk: storeId,
                  storeName: shop.replace('.myshopify.com', ''),
                  domain: shop,
                  accessToken,
                  type: 'shopify',
                  status: 'active',
                  connectedAt: new Date().toISOString()
                }
              }).promise();
              
              // Cleanup state
              await dynamodb.delete({
                TableName: process.env.TABLE_NAME,
                Key: {
                  pk: `oauth_state_${state}`,
                  sk: 'shopify'
                }
              }).promise();
              
              return {
                statusCode: 200,
                headers: { 'Content-Type': 'text/html' },
                body: `<html><body>
                  <h2>✅ Store Connected Successfully!</h2>
                  <p>Store ${shop} has been connected to your company.</p>
                  <script>
                    if (window.opener) {
                      window.opener.postMessage({ type: 'shopify-connected', success: true }, '*');
                    }
                    setTimeout(() => window.close(), 2000);
                  </script>
                </body></html>`
              };
              
            } catch (error) {
              console.error('Callback error:', error);
              return {
                statusCode: 500,
                headers: { 'Content-Type': 'text/html' },
                body: '<html><body><h2>❌ Connection Failed</h2></body></html>'
              };
            }
          }
          break;
          
        default:
          responseData = {
            message: 'OrderNimbus Multi-Tenant API',
            user: userContext,
            endpoints: ['/api/auth/register', '/api/auth/login', '/api/stores', '/api/shopify/connect']
          };
      }
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
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};