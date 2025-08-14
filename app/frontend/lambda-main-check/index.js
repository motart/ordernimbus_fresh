const AWS = require('aws-sdk');
const https = require('https');
const querystring = require('querystring');

const secretsManager = new AWS.SecretsManager();
const dynamodb = new AWS.DynamoDB.DocumentClient();

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
    // Return empty credentials to avoid breaking
    return { SHOPIFY_CLIENT_ID: '', SHOPIFY_CLIENT_SECRET: '' };
  }
};

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event));
  
  // Get origin from request headers
  const origin = event.headers?.origin || event.headers?.Origin || 'http://app.ordernimbus.com';
  
  // List of allowed origins
  const allowedOrigins = [
    'http://app.ordernimbus.com',
    'https://app.ordernimbus.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://app.ordernimbus.com.s3-website-us-west-1.amazonaws.com',
    'http://app.ordernimbus.com.s3-website-us-east-1.amazonaws.com'
  ];
  
  // Check if origin is allowed
  const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,userId',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS,HEAD,PATCH',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json'
  };
  
  // Handle OPTIONS for CORS preflight
  if (event.requestContext?.http?.method === 'OPTIONS' || event.httpMethod === 'OPTIONS') {
    console.log('Handling OPTIONS request for CORS');
    return { 
      statusCode: 200, 
      headers: corsHeaders, 
      body: JSON.stringify({ message: 'CORS preflight successful' }) 
    };
  }
  
  // Extract path and method
  let path = event.rawPath || event.path || '/';
  const method = event.requestContext?.http?.method || event.httpMethod || 'GET';
  
  // Remove stage from path if present (e.g., /production/api/... -> /api/...)
  if (path.startsWith('/production')) {
    path = path.substring('/production'.length);
  }
  
  const pathParts = path.split('/').filter(p => p);
  
  // Simple routing
  const resource = pathParts[1]; // api/products -> products
  
  try {
    // Mock data based on resource
    let responseData = {};
    
    switch(resource) {
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
        
      case 'inventory':
        responseData = {
          inventory: [
            { productId: '1', quantity: 100, location: 'Warehouse A' },
            { productId: '2', quantity: 50, location: 'Warehouse B' }
          ],
          count: 2
        };
        break;
        
      case 'customers':
        responseData = {
          customers: [
            { id: '1', name: 'John Doe', email: 'john@example.com', orders: 5 },
            { id: '2', name: 'Jane Smith', email: 'jane@example.com', orders: 3 }
          ],
          count: 2
        };
        break;
        
      case 'notifications':
        responseData = {
          notifications: [
            { id: '1', type: 'info', message: 'System update completed' },
            { id: '2', type: 'warning', message: 'Low inventory alert' }
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
        
      case 'shopify':
        // Handle Shopify OAuth integration
        if (path.includes('/shopify/connect')) {
          try {
            const body = JSON.parse(event.body || '{}');
            const { storeDomain, userId } = body;
            
            if (!storeDomain) {
              return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Store domain is required' })
              };
            }
            
            // Get Shopify credentials from Secrets Manager
            const credentials = await getShopifyCredentials();
            
            if (!credentials.SHOPIFY_CLIENT_ID) {
              console.error('Shopify credentials not found in Secrets Manager');
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
            
            // Clean domain
            const cleanDomain = storeDomain.replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/\.myshopify\.com.*$/, '') + '.myshopify.com';
            
            // Generate random state for CSRF protection
            const state = Math.random().toString(36).substring(7);
            
            // Store state in DynamoDB for verification
            await dynamodb.put({
              TableName: process.env.TABLE_NAME,
              Item: {
                pk: `oauth_state_${state}`,
                sk: 'shopify',
                userId: userId || 'unknown',
                storeDomain: cleanDomain,
                createdAt: new Date().toISOString(),
                ttl: Math.floor(Date.now() / 1000) + 600 // Expire in 10 minutes
              }
            }).promise();
            
            const authUrl = `https://${cleanDomain}/admin/oauth/authorize?` +
              `client_id=${SHOPIFY_CLIENT_ID}&` +
              `scope=${SCOPES}&` +
              `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
              `state=${state}`;
            
            responseData = {
              authUrl: authUrl,
              message: 'Redirect user to Shopify OAuth'
            };
          } catch (error) {
            console.error('Error in Shopify connect:', error);
            return {
              statusCode: 500,
              headers: corsHeaders,
              body: JSON.stringify({ error: 'Failed to initiate Shopify connection' })
            };
          }
        } else if (path.includes('/shopify/callback')) {
          // Handle OAuth callback
          const queryParams = event.queryStringParameters || {};
          const { code, state, shop } = queryParams;
          
          if (!code || !state || !shop) {
            return {
              statusCode: 400,
              headers: { 'Content-Type': 'text/html' },
              body: '<html><body><h2>Error: Missing required parameters</h2><script>setTimeout(() => window.close(), 3000);</script></body></html>'
            };
          }
          
          try {
            // Verify state from DynamoDB
            const stateResult = await dynamodb.get({
              TableName: process.env.TABLE_NAME,
              Key: {
                pk: `oauth_state_${state}`,
                sk: 'shopify'
              }
            }).promise();
            
            if (!stateResult.Item) {
              throw new Error('Invalid state parameter');
            }
            
            // Get Shopify credentials
            const credentials = await getShopifyCredentials();
            
            // Exchange code for access token
            const tokenData = querystring.stringify({
              client_id: credentials.SHOPIFY_CLIENT_ID,
              client_secret: credentials.SHOPIFY_CLIENT_SECRET,
              code: code
            });
            
            // Make HTTPS request to get access token
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
                  } catch (e) {
                    reject(e);
                  }
                });
              });
              
              req.on('error', reject);
              req.write(tokenData);
              req.end();
            });
            
            // Store the access token in DynamoDB
            await dynamodb.put({
              TableName: process.env.TABLE_NAME,
              Item: {
                pk: `store_${shop}`,
                sk: `user_${stateResult.Item.userId}`,
                accessToken: accessToken,
                storeDomain: shop,
                connectedAt: new Date().toISOString()
              }
            }).promise();
            
            // Delete the state token
            await dynamodb.delete({
              TableName: process.env.TABLE_NAME,
              Key: {
                pk: `oauth_state_${state}`,
                sk: 'shopify'
              }
            }).promise();
            
            // Return success HTML that closes the popup
            return {
              statusCode: 200,
              headers: { 'Content-Type': 'text/html' },
              body: `<html><body>
                <h2>✅ Successfully connected to Shopify!</h2>
                <p>This window will close automatically...</p>
                <script>
                  if (window.opener) {
                    window.opener.postMessage({ type: 'shopify-connected', success: true }, '*');
                  }
                  setTimeout(() => window.close(), 2000);
                </script>
              </body></html>`
            };
          } catch (error) {
            console.error('Error in Shopify callback:', error);
            return {
              statusCode: 500,
              headers: { 'Content-Type': 'text/html' },
              body: `<html><body>
                <h2>❌ Connection failed</h2>
                <p>${error.message}</p>
                <script>setTimeout(() => window.close(), 3000);</script>
              </body></html>`
            };
          }
        } else if (path.includes('/shopify/sync')) {
          // Sync data using stored access token
          const body = JSON.parse(event.body || '{}');
          const { storeDomain, userId } = body;
          
          // Get access token from DynamoDB
          const tokenResult = await dynamodb.get({
            TableName: process.env.TABLE_NAME,
            Key: {
              pk: `store_${storeDomain}`,
              sk: `user_${userId}`
            }
          }).promise();
          
          if (!tokenResult.Item || !tokenResult.Item.accessToken) {
            return {
              statusCode: 401,
              headers: corsHeaders,
              body: JSON.stringify({ error: 'Store not connected. Please connect first.' })
            };
          }
          
          // For now, return mock data
          responseData = {
            success: true,
            message: 'Store data synced successfully',
            data: {
              storeId: 'store_' + Date.now(),
              storeName: storeDomain.replace('.myshopify.com', ''),
              syncedAt: new Date().toISOString(),
              products: 10,
              orders: 25,
              customers: 15
            }
          };
        } else {
          responseData = {
            message: 'Shopify integration endpoint',
            endpoints: ['/api/shopify/connect', '/api/shopify/callback', '/api/shopify/sync']
          };
        }
        break;
        
      case 'auth':
        // Handle authentication endpoints
        const authPath = pathParts[2]; // e.g., login, register
        const body = JSON.parse(event.body || '{}');
        const cognito = new AWS.CognitoIdentityServiceProvider();
        
        if (authPath === 'login' && method === 'POST') {
          try {
            const { email, password } = body;
            
            if (!email || !password) {
              return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ success: false, error: 'Email and password required' })
              };
            }
            
            // Authenticate with Cognito
            const authResult = await cognito.adminInitiateAuth({
              UserPoolId: process.env.USER_POOL_ID,
              ClientId: process.env.USER_POOL_CLIENT_ID,
              AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
              AuthParameters: {
                USERNAME: email,
                PASSWORD: password
              }
            }).promise();
            
            responseData = {
              success: true,
              tokens: {
                AccessToken: authResult.AuthenticationResult.AccessToken,
                RefreshToken: authResult.AuthenticationResult.RefreshToken,
                IdToken: authResult.AuthenticationResult.IdToken,
                ExpiresIn: authResult.AuthenticationResult.ExpiresIn,
                TokenType: authResult.AuthenticationResult.TokenType
              }
            };
          } catch (error) {
            console.error('Login error:', error);
            return {
              statusCode: 401,
              headers: corsHeaders,
              body: JSON.stringify({ 
                success: false, 
                error: error.code === 'NotAuthorizedException' ? 'Invalid credentials' : 'Login failed'
              })
            };
          }
        } else if (authPath === 'register' && method === 'POST') {
          try {
            const { email, password, companyName, firstName, lastName } = body;
            
            // Validate required fields
            if (!email || !password || !companyName) {
              return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ 
                  success: false, 
                  error: 'Email, password and company name required' 
                })
              };
            }
            
            // Validate first and last name are provided
            if (!firstName || !lastName) {
              return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ 
                  success: false, 
                  error: 'First name and last name are required' 
                })
              };
            }
            
            // Generate unique company ID
            const companyId = 'company-' + Date.now() + '-' + Math.random().toString(36).substring(7);
            
            // Create user in Cognito with email_verified set to false for verification flow
            const createUserResult = await cognito.adminCreateUser({
              UserPoolId: process.env.USER_POOL_ID,
              Username: email,
              UserAttributes: [
                { Name: 'email', Value: email },
                { Name: 'email_verified', Value: 'false' }, // Set to false to require verification
                { Name: 'given_name', Value: firstName },
                { Name: 'family_name', Value: lastName },
                { Name: 'custom:company_id', Value: companyId },
                { Name: 'custom:company_name', Value: companyName },
                { Name: 'custom:role', Value: 'admin' }
              ],
              DesiredDeliveryMediums: ['EMAIL'], // Send verification code via email
              MessageAction: 'RESEND' // Send verification email
            }).promise();
            
            // Set permanent password
            await cognito.adminSetUserPassword({
              UserPoolId: process.env.USER_POOL_ID,
              Username: email,
              Password: password,
              Permanent: true
            }).promise();
            
            // Store company info in DynamoDB
            await dynamodb.put({
              TableName: process.env.TABLE_NAME,
              Item: {
                pk: `company_${companyId}`,
                sk: 'metadata',
                companyName: companyName,
                adminEmail: email,
                firstName: firstName,
                lastName: lastName,
                createdAt: new Date().toISOString(),
                emailVerified: false
              }
            }).promise();
            
            responseData = {
              success: true,
              message: 'Registration successful. Please check your email for verification code.',
              needsVerification: true,
              userId: createUserResult.User.Username,
              companyId: companyId,
              companyName: companyName
            };
          } catch (error) {
            console.error('Registration error:', error);
            return {
              statusCode: 400,
              headers: corsHeaders,
              body: JSON.stringify({ 
                success: false, 
                error: error.code === 'UsernameExistsException' ? 'User already exists' : 'Registration failed'
              })
            };
          }
        } else if (authPath === 'verify' && method === 'POST') {
          // Handle email verification
          try {
            const { email, code } = body;
            
            if (!email || !code) {
              return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ 
                  success: false, 
                  error: 'Email and verification code required' 
                })
              };
            }
            
            // Confirm the user's email with the verification code
            await cognito.confirmSignUp({
              ClientId: process.env.USER_POOL_CLIENT_ID,
              Username: email,
              ConfirmationCode: code
            }).promise();
            
            // Update user's email_verified attribute
            await cognito.adminUpdateUserAttributes({
              UserPoolId: process.env.USER_POOL_ID,
              Username: email,
              UserAttributes: [
                { Name: 'email_verified', Value: 'true' }
              ]
            }).promise();
            
            // Update DynamoDB to mark email as verified
            const userResult = await dynamodb.query({
              TableName: process.env.TABLE_NAME,
              IndexName: 'email-index',
              KeyConditionExpression: 'adminEmail = :email',
              ExpressionAttributeValues: {
                ':email': email
              }
            }).promise();
            
            if (userResult.Items && userResult.Items.length > 0) {
              const companyData = userResult.Items[0];
              await dynamodb.update({
                TableName: process.env.TABLE_NAME,
                Key: {
                  pk: companyData.pk,
                  sk: 'metadata'
                },
                UpdateExpression: 'SET emailVerified = :verified',
                ExpressionAttributeValues: {
                  ':verified': true
                }
              }).promise();
            }
            
            responseData = {
              success: true,
              message: 'Email verified successfully'
            };
          } catch (error) {
            console.error('Verification error:', error);
            return {
              statusCode: 400,
              headers: corsHeaders,
              body: JSON.stringify({ 
                success: false, 
                error: error.code === 'CodeMismatchException' ? 'Invalid verification code' : 'Verification failed'
              })
            };
          }
        } else if (authPath === 'forgot-password' && method === 'POST') {
          try {
            const { email } = body;
            
            await cognito.forgotPassword({
              ClientId: process.env.USER_POOL_CLIENT_ID,
              Username: email
            }).promise();
            
            responseData = {
              success: true,
              message: 'Password reset email sent'
            };
          } catch (error) {
            console.error('Forgot password error:', error);
            responseData = {
              success: true, // Always return success to avoid user enumeration
              message: 'If the email exists, a password reset link has been sent'
            };
          }
        } else if (authPath === 'refresh' && method === 'POST') {
          try {
            const { refreshToken } = body;
            
            const authResult = await cognito.adminInitiateAuth({
              UserPoolId: process.env.USER_POOL_ID,
              ClientId: process.env.USER_POOL_CLIENT_ID,
              AuthFlow: 'REFRESH_TOKEN_AUTH',
              AuthParameters: {
                REFRESH_TOKEN: refreshToken
              }
            }).promise();
            
            responseData = {
              success: true,
              tokens: {
                AccessToken: authResult.AuthenticationResult.AccessToken,
                IdToken: authResult.AuthenticationResult.IdToken,
                ExpiresIn: authResult.AuthenticationResult.ExpiresIn,
                TokenType: authResult.AuthenticationResult.TokenType
              }
            };
          } catch (error) {
            console.error('Refresh token error:', error);
            return {
              statusCode: 401,
              headers: corsHeaders,
              body: JSON.stringify({ success: false, error: 'Invalid refresh token' })
            };
          }
        } else {
          responseData = {
            message: 'Authentication endpoint',
            availableEndpoints: ['/api/auth/login', '/api/auth/register', '/api/auth/verify', '/api/auth/forgot-password', '/api/auth/refresh']
          };
        }
        break;
        
      default:
        responseData = {
          message: 'OrderNimbus API',
          version: '1.0',
          environment: process.env.ENVIRONMENT,
          path: path,
          method: method
        };
    }
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(responseData)
    };
    
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
