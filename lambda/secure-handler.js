const AWS = require('aws-sdk');
const https = require('https');
const querystring = require('querystring');

// Configure AWS SDK with region
AWS.config.update({ region: process.env.AWS_REGION || 'us-west-1' });

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
    return { SHOPIFY_CLIENT_ID: '', SHOPIFY_CLIENT_SECRET: '' };
  }
};

// Helper function to make Shopify API requests
const makeShopifyRequest = async (shop, accessToken, endpoint, method = 'GET', body = null) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: shop,
      path: `/admin/api/2024-10${endpoint}`,
      method: method,
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(result);
          } else {
            reject(new Error(`Shopify API error: ${res.statusCode} - ${result.errors || data}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse Shopify response: ${e.message}`));
        }
      });
    });
    
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
};

exports.handler = async (event) => {
  console.log('Secure Handler - Event:', JSON.stringify(event));
  
  // Get origin from request headers
  const origin = event.headers?.origin || event.headers?.Origin || 'https://app.ordernimbus.com';
  
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
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
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
      body: ''
    };
  }
  
  // Extract path and method
  const path = event.rawPath || event.path || '';
  const method = event.requestContext?.http?.method || event.httpMethod || 'GET';
  
  console.log(`Processing ${method} ${path}`);
  
  // SECURITY: Extract userId from JWT token (provided by API Gateway authorizer)
  // The authorizer puts the decoded JWT claims in event.requestContext.authorizer.claims
  const userId = event.requestContext?.authorizer?.claims?.sub || 
                 event.requestContext?.authorizer?.jwt?.claims?.sub;
  
  // For public endpoints (login, register, shopify callback), userId is not required
  const publicEndpoints = ['/api/auth/login', '/api/auth/register', '/api/shopify/connect', '/api/shopify/callback'];
  const isPublicEndpoint = publicEndpoints.some(endpoint => path.includes(endpoint));
  
  if (!isPublicEndpoint && !userId) {
    console.error('No userId found in JWT token');
    return {
      statusCode: 401,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Unauthorized - Invalid or missing authentication token',
        details: 'No user ID found in JWT token'
      })
    };
  }
  
  // Log the secure userId for debugging
  if (userId) {
    console.log('Authenticated request from user:', userId);
  }
  
  // Extract the endpoint (e.g., 'stores', 'products', etc.)
  const pathParts = path.split('/').filter(Boolean);
  const endpoint = pathParts[1]; // After 'api'
  
  let responseData = {};
  
  try {
    switch (endpoint) {
      case 'stores':
        console.log('Fetching stores for user:', userId);
        
        // Handle DELETE method
        if (method === 'DELETE') {
          const storeId = event.pathParameters?.id || event.queryStringParameters?.storeId;
          if (!storeId) {
            return {
              statusCode: 400,
              headers: corsHeaders,
              body: JSON.stringify({ error: 'Store ID is required' })
            };
          }
          
          // Delete store from DynamoDB
          await dynamodb.delete({
            TableName: process.env.TABLE_NAME,
            Key: {
              pk: `user_${userId}`,
              sk: `store_${storeId}_metadata`
            }
          }).promise();
          
          responseData = { success: true, message: 'Store deleted successfully' };
        } else {
          // Query DynamoDB for stores
          const storesResult = await dynamodb.query({
            TableName: process.env.TABLE_NAME,
            KeyConditionExpression: 'pk = :pk AND begins_with(sk, :skPrefix)',
            ExpressionAttributeValues: {
              ':pk': `user_${userId}`,
              ':skPrefix': 'store_'
            }
          }).promise();
          
          const stores = (storesResult.Items || [])
            .filter(item => item.sk.endsWith('_metadata'))
            .map(item => ({
              id: item.storeId || item.sk.split('_')[1],
              name: item.storeName || item.name,
              displayName: item.displayName || item.storeName || item.name,
              type: item.storeType || 'shopify',
              shopifyDomain: item.shopifyDomain || item.myshopifyDomain,
              myshopifyDomain: item.myshopifyDomain || item.shopifyDomain,
              apiKey: item.apiKey,
              accessToken: item.accessToken ? '***' : undefined,
              createdAt: item.createdAt,
              lastSyncedAt: item.lastSyncedAt,
              syncStatus: item.syncStatus || 'pending',
              webhooksRegistered: item.webhooksRegistered || false
            }));
          
          responseData = { 
            stores: stores,
            count: stores.length
          };
        }
        break;
        
      case 'products':
        const storeId = event.queryStringParameters?.storeId;
        console.log('Fetching products for user:', userId, 'store:', storeId);
        
        // Query DynamoDB for products
        const productsResult = await dynamodb.query({
          TableName: process.env.TABLE_NAME,
          KeyConditionExpression: 'pk = :pk AND begins_with(sk, :skPrefix)',
          ExpressionAttributeValues: {
            ':pk': `user_${userId}`,
            ':skPrefix': storeId ? `store_${storeId}_product_` : 'store_'
          }
        }).promise();
        
        const products = (productsResult.Items || [])
          .filter(item => item.sk.includes('_product_'))
          .map(item => ({
            id: item.productId || item.id,
            storeId: item.storeId,
            title: item.title,
            vendor: item.vendor,
            product_type: item.product_type || item.productType,
            handle: item.handle,
            status: item.status,
            tags: item.tags,
            variants: item.variants || [],
            images: item.images || [],
            created_at: item.created_at || item.createdAt,
            updated_at: item.updated_at || item.updatedAt,
            syncedAt: item.syncedAt
          }));
        
        responseData = { 
          products: products,
          count: products.length
        };
        break;
        
      case 'orders':
        console.log('Fetching orders for user:', userId);
        
        // Query DynamoDB for orders
        const ordersResult = await dynamodb.query({
          TableName: process.env.TABLE_NAME,
          KeyConditionExpression: 'pk = :pk AND begins_with(sk, :skPrefix)',
          ExpressionAttributeValues: {
            ':pk': `user_${userId}`,
            ':skPrefix': 'store_'
          }
        }).promise();
        
        const orders = (ordersResult.Items || [])
          .filter(item => item.sk.includes('_order_'))
          .map(item => ({
            id: item.orderId || item.id,
            storeId: item.storeId,
            orderNumber: item.order_number || item.orderNumber,
            email: item.email,
            total_price: item.total_price || item.totalPrice,
            subtotal_price: item.subtotal_price || item.subtotalPrice,
            total_tax: item.total_tax || item.totalTax,
            currency: item.currency,
            financial_status: item.financial_status || item.financialStatus,
            fulfillment_status: item.fulfillment_status || item.fulfillmentStatus,
            customer: item.customer,
            line_items: item.line_items || item.lineItems || [],
            created_at: item.created_at || item.createdAt,
            updated_at: item.updated_at || item.updatedAt,
            syncedAt: item.syncedAt
          }));
        
        responseData = { 
          orders: orders,
          count: orders.length
        };
        break;
        
      case 'inventory':
        console.log('Fetching inventory for user:', userId);
        
        // Query DynamoDB for products (which contain inventory)
        const inventoryResult = await dynamodb.query({
          TableName: process.env.TABLE_NAME,
          KeyConditionExpression: 'pk = :pk AND begins_with(sk, :skPrefix)',
          ExpressionAttributeValues: {
            ':pk': `user_${userId}`,
            ':skPrefix': 'store_'
          }
        }).promise();
        
        const inventory = (inventoryResult.Items || [])
          .filter(item => item.sk.includes('_product_'))
          .flatMap(item => {
            return (item.variants || []).map(variant => ({
              id: `${item.productId}_${variant.id}`,
              storeId: item.storeId,
              productId: item.productId,
              inventoryItemId: variant.inventory_item_id,
              locationId: 'primary',
              available: variant.inventory_quantity || 0,
              title: item.title,
              vendor: item.vendor,
              productType: item.product_type,
              variants: [variant],
              updatedAt: item.updated_at || item.updatedAt,
              syncedAt: item.syncedAt
            }));
          });
        
        responseData = { 
          inventory: inventory,
          count: inventory.length
        };
        break;
        
      case 'customers':
        console.log('Fetching customer metadata for user:', userId);
        
        // Get metadata which contains customer count
        const metadataResult = await dynamodb.query({
          TableName: process.env.TABLE_NAME,
          KeyConditionExpression: 'pk = :pk AND begins_with(sk, :skPrefix)',
          ExpressionAttributeValues: {
            ':pk': `user_${userId}`,
            ':skPrefix': 'store_'
          }
        }).promise();
        
        const storeMetadata = (metadataResult.Items || [])
          .filter(item => item.sk.endsWith('_metadata'))
          .map(item => ({
            storeId: item.storeId || item.sk.split('_')[1],
            storeName: item.storeName || item.name,
            customerCount: item.customerCount || 0,
            lastSyncedAt: item.lastSyncedAt
          }));
        
        responseData = { 
          customers: storeMetadata,
          totalCustomers: storeMetadata.reduce((sum, store) => sum + (store.customerCount || 0), 0)
        };
        break;
        
      case 'auth':
        // Handle authentication endpoints (these are public)
        const authPath = pathParts[2]; // After 'api/auth'
        
        if (authPath === 'login') {
          // Login is handled by Cognito directly, this is just a placeholder
          responseData = { 
            message: 'Use Cognito SDK for login',
            error: 'Direct login not supported - use AWS Amplify'
          };
        } else if (authPath === 'register') {
          // Registration is handled by Cognito directly
          responseData = { 
            message: 'Use Cognito SDK for registration',
            error: 'Direct registration not supported - use AWS Amplify'
          };
        }
        break;
        
      case 'shopify':
        // Handle Shopify OAuth endpoints
        const shopifyPath = pathParts[2]; // After 'api/shopify'
        
        if (shopifyPath === 'connect') {
          // Generate Shopify OAuth URL
          const { shop } = event.queryStringParameters || {};
          if (!shop) {
            return {
              statusCode: 400,
              headers: corsHeaders,
              body: JSON.stringify({ error: 'Shop domain is required' })
            };
          }
          
          const credentials = await getShopifyCredentials();
          const redirectUri = `https://${event.requestContext?.domainName}/${event.requestContext?.stage}/api/shopify/callback`;
          
          const authUrl = `https://${shop}/admin/oauth/authorize?` + querystring.stringify({
            client_id: credentials.SHOPIFY_CLIENT_ID,
            scope: 'read_products,write_products,read_orders,read_customers,read_inventory',
            redirect_uri: redirectUri,
            state: userId || 'anonymous',
            grant_options: 'per-user'
          });
          
          responseData = { authUrl };
        } else if (shopifyPath === 'callback') {
          // Handle OAuth callback
          const { code, shop, state } = event.queryStringParameters || {};
          
          if (!code || !shop) {
            return {
              statusCode: 400,
              headers: corsHeaders,
              body: JSON.stringify({ error: 'Missing code or shop parameter' })
            };
          }
          
          const credentials = await getShopifyCredentials();
          
          // Exchange code for access token
          const tokenResponse = await new Promise((resolve, reject) => {
            const postData = JSON.stringify({
              client_id: credentials.SHOPIFY_CLIENT_ID,
              client_secret: credentials.SHOPIFY_CLIENT_SECRET,
              code: code
            });
            
            const options = {
              hostname: shop,
              path: '/admin/oauth/access_token',
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
              }
            };
            
            const req = https.request(options, (res) => {
              let data = '';
              res.on('data', (chunk) => { data += chunk; });
              res.on('end', () => {
                try {
                  resolve(JSON.parse(data));
                } catch (e) {
                  reject(new Error('Failed to parse token response'));
                }
              });
            });
            
            req.on('error', reject);
            req.write(postData);
            req.end();
          });
          
          // Store the shop credentials in DynamoDB
          const storeId = shop.replace('.myshopify.com', '');
          const userIdFromState = state || userId;
          
          await dynamodb.put({
            TableName: process.env.TABLE_NAME,
            Item: {
              pk: `user_${userIdFromState}`,
              sk: `store_${storeId}_metadata`,
              storeId: storeId,
              storeName: shop,
              shopifyDomain: shop,
              myshopifyDomain: shop,
              storeType: 'shopify',
              accessToken: tokenResponse.access_token,
              scope: tokenResponse.scope,
              createdAt: new Date().toISOString(),
              syncStatus: 'connected'
            }
          }).promise();
          
          // Redirect back to the app
          return {
            statusCode: 302,
            headers: {
              Location: 'https://app.ordernimbus.com/stores?connected=true'
            }
          };
        }
        break;
        
      default:
        responseData = { 
          message: 'Endpoint not found',
          availableEndpoints: [
            '/api/stores',
            '/api/products',
            '/api/orders',
            '/api/inventory',
            '/api/customers',
            '/api/shopify/connect'
          ]
        };
    }
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(responseData)
    };
    
  } catch (error) {
    console.error('Error processing request:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message,
        endpoint: endpoint
      })
    };
  }
};