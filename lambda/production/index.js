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
            console.error('Shopify API error:', result);
            reject(new Error(`Shopify API error: ${result.errors || JSON.stringify(result)}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
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
  let path = event.rawPath || event.path || event.requestContext?.path || '/';
  const method = event.requestContext?.http?.method || event.httpMethod || event.requestContext?.httpMethod || 'GET';
  
  console.log('Original path:', path);
  
  // Remove stage from path if present (e.g., /production/api/... -> /api/...)
  if (path.startsWith('/production')) {
    path = path.substring('/production'.length);
  }
  
  const pathParts = path.split('/').filter(p => p);
  console.log('Path parts:', pathParts);
  
  // Simple routing
  const resource = pathParts[1] || pathParts[0]; // api/products -> products, or just config -> config
  
  try {
    // Mock data based on resource
    let responseData = {};
    
    console.log('Resource to match:', resource);
    
    switch(resource) {
      case 'products':
        // Get userId from headers
        const productsUserId = event.headers?.userid || event.headers?.userId || event.headers?.UserId || 'test-user';
        const storeId = event.queryStringParameters?.storeId;
        
        console.log('Fetching products for user:', productsUserId, 'store:', storeId);
        
        try {
          // Query DynamoDB for synced products
          const productsResult = await dynamodb.query({
            TableName: process.env.TABLE_NAME,
            KeyConditionExpression: 'pk = :pk AND begins_with(sk, :skPrefix)',
            ExpressionAttributeValues: {
              ':pk': `user_${productsUserId}`,
              ':skPrefix': 'product_'
            },
            Limit: 100
          }).promise();
          
          console.log(`Found ${productsResult.Items?.length || 0} products in DynamoDB`);
          
          // Transform DynamoDB items to frontend format
          const products = (productsResult.Items || []).map(item => ({
            id: item.productId,
            variantId: item.variantId,
            name: item.title,
            variantTitle: item.variantTitle,
            sku: item.sku || '',
            price: parseFloat(item.price || 0),
            inventory: item.inventory || 0,
            storeDomain: item.storeDomain,
            syncedAt: item.syncedAt
          }));
          
          responseData = {
            products: products,
            count: products.length,
            source: 'dynamodb'
          };
        } catch (dbError) {
          console.error('Error fetching products from DynamoDB:', dbError);
          // Fallback to mock data if DB fails
          responseData = {
            products: [
              { id: '1', name: 'Product 1', price: 99.99, inventory: 100 },
              { id: '2', name: 'Product 2', price: 149.99, inventory: 50 }
            ],
            count: 2,
            source: 'mock',
            error: 'Failed to fetch from database'
          };
        }
        break;
        
      case 'orders':
        // Get userId from headers
        const ordersUserId = event.headers?.userid || event.headers?.userId || event.headers?.UserId || 'test-user';
        
        console.log('Fetching orders for user:', ordersUserId);
        
        try {
          // Query DynamoDB for synced orders
          const ordersResult = await dynamodb.query({
            TableName: process.env.TABLE_NAME,
            KeyConditionExpression: 'pk = :pk AND begins_with(sk, :skPrefix)',
            ExpressionAttributeValues: {
              ':pk': `user_${ordersUserId}`,
              ':skPrefix': 'order_'
            },
            Limit: 100
          }).promise();
          
          console.log(`Found ${ordersResult.Items?.length || 0} orders in DynamoDB`);
          
          // Transform DynamoDB items to frontend format
          const orders = (ordersResult.Items || []).map(item => ({
            id: item.orderId,
            orderNumber: item.orderNumber,
            customerName: item.customerEmail || 'Customer',
            customerEmail: item.customerEmail,
            total: parseFloat(item.totalPrice || 0),
            currency: item.currency || 'USD',
            status: item.status || 'pending',
            fulfillmentStatus: item.fulfillmentStatus,
            lineItems: item.lineItems || 0,
            createdAt: item.createdAt,
            storeDomain: item.storeDomain,
            syncedAt: item.syncedAt
          }));
          
          responseData = {
            orders: orders,
            count: orders.length,
            source: 'dynamodb'
          };
        } catch (dbError) {
          console.error('Error fetching orders from DynamoDB:', dbError);
          // Fallback to mock data if DB fails
          responseData = {
            orders: [
              { id: '1', customerName: 'John Doe', total: 299.99, status: 'completed' },
              { id: '2', customerName: 'Jane Smith', total: 149.99, status: 'pending' }
            ],
            count: 2,
            source: 'mock',
            error: 'Failed to fetch from database'
          };
        }
        break;
        
      case 'inventory':
        // Get userId from headers
        const inventoryUserId = event.headers?.userid || event.headers?.userId || event.headers?.UserId || 'test-user';
        
        console.log('Fetching inventory for user:', inventoryUserId);
        
        try {
          // Query DynamoDB for products (which contain inventory)
          const inventoryResult = await dynamodb.query({
            TableName: process.env.TABLE_NAME,
            KeyConditionExpression: 'pk = :pk AND begins_with(sk, :skPrefix)',
            ExpressionAttributeValues: {
              ':pk': `user_${inventoryUserId}`,
              ':skPrefix': 'product_'
            },
            Limit: 100
          }).promise();
          
          console.log(`Found ${inventoryResult.Items?.length || 0} inventory items in DynamoDB`);
          
          // Transform to inventory format
          const inventory = (inventoryResult.Items || []).map(item => ({
            productId: item.productId,
            variantId: item.variantId,
            productName: item.title,
            sku: item.sku || '',
            quantity: item.inventory || 0,
            location: item.storeDomain || 'Main Store',
            lastUpdated: item.syncedAt
          }));
          
          responseData = {
            inventory: inventory,
            count: inventory.length,
            totalItems: inventory.reduce((sum, item) => sum + item.quantity, 0),
            source: 'dynamodb'
          };
        } catch (dbError) {
          console.error('Error fetching inventory from DynamoDB:', dbError);
          responseData = {
            inventory: [
              { productId: '1', quantity: 100, location: 'Warehouse A' },
              { productId: '2', quantity: 50, location: 'Warehouse B' }
            ],
            count: 2,
            source: 'mock'
          };
        }
        break;
        
      case 'customers':
        // Get userId from headers  
        const customersUserId = event.headers?.userid || event.headers?.userId || event.headers?.UserId || 'test-user';
        
        console.log('Fetching customer metadata for user:', customersUserId);
        
        try {
          // Get metadata which contains customer count
          const metadataResult = await dynamodb.query({
            TableName: process.env.TABLE_NAME,
            KeyConditionExpression: 'pk = :pk AND begins_with(sk, :skPrefix)',
            ExpressionAttributeValues: {
              ':pk': `user_${customersUserId}`,
              ':skPrefix': 'store_'
            }
          }).promise();
          
          // For now, return summary data since we don't store individual customers
          const metadata = metadataResult.Items?.[0];
          const customerCount = metadata?.customerCount || 0;
          
          responseData = {
            customers: [],
            count: customerCount,
            summary: {
              totalCustomers: customerCount,
              lastSyncedAt: metadata?.lastSyncedAt
            },
            source: 'dynamodb-metadata',
            note: 'Individual customer data not yet stored'
          };
        } catch (dbError) {
          console.error('Error fetching customers from DynamoDB:', dbError);
          // Return empty array in production - no mock data
          responseData = {
            customers: [],
            count: 0,
            source: 'error',
            error: 'Failed to fetch from database'
          };
        }
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
        
      case 'config':
        // Return application configuration
        responseData = {
          environment: process.env.ENVIRONMENT || 'production',
          apiUrl: `https://${event.requestContext?.domainName || event.headers?.host}/${event.requestContext?.stage || 'production'}`,
          region: process.env.AWS_REGION || 'us-west-1',
          userPoolId: process.env.USER_POOL_ID,
          clientId: process.env.USER_POOL_CLIENT_ID,
          features: {
            enableDebug: false,
            enableAnalytics: true,
            enableMockData: false,
            useWebCrypto: true
          }
        };
        break;
        
      case 'stores':
        // Get userId from headers
        const storesUserId = event.headers?.userid || event.headers?.userId || event.headers?.UserId || 'test-user';
        
        // Handle DELETE method
        if (method === 'DELETE') {
          const storeId = event.pathParameters?.id || event.queryStringParameters?.storeId;
          
          if (!storeId) {
            responseData = {
              error: 'Store ID is required for deletion'
            };
            statusCode = 400;
            break;
          }
          
          console.log('Deleting store:', storeId, 'for user:', storesUserId);
          
          try {
            // Delete store metadata
            await dynamodb.delete({
              TableName: process.env.TABLE_NAME,
              Key: {
                pk: `user_${storesUserId}`,
                sk: `store_${storeId}_metadata`
              }
            }).promise();
            
            // Also delete associated data (products, orders) for this store
            // First, query all items for this store
            const itemsToDelete = await dynamodb.query({
              TableName: process.env.TABLE_NAME,
              KeyConditionExpression: 'pk = :pk',
              FilterExpression: 'storeDomain = :storeDomain OR storeId = :storeId',
              ExpressionAttributeValues: {
                ':pk': `user_${storesUserId}`,
                ':storeDomain': storeId,
                ':storeId': storeId
              }
            }).promise();
            
            // Delete all associated items
            if (itemsToDelete.Items && itemsToDelete.Items.length > 0) {
              const deletePromises = itemsToDelete.Items.map(item => 
                dynamodb.delete({
                  TableName: process.env.TABLE_NAME,
                  Key: {
                    pk: item.pk,
                    sk: item.sk
                  }
                }).promise()
              );
              
              await Promise.all(deletePromises);
              console.log(`Deleted ${deletePromises.length} associated items for store ${storeId}`);
            }
            
            responseData = {
              success: true,
              message: `Store ${storeId} deleted successfully`
            };
          } catch (dbError) {
            console.error('Error deleting store from DynamoDB:', dbError);
            responseData = {
              error: 'Failed to delete store'
            };
            statusCode = 500;
          }
        } else {
          // Handle GET method (default)
          console.log('Fetching stores for user:', storesUserId);
          
          try {
            // Query DynamoDB for user's stores
            const storesResult = await dynamodb.query({
              TableName: process.env.TABLE_NAME,
              KeyConditionExpression: 'pk = :pk AND begins_with(sk, :skPrefix)',
              ExpressionAttributeValues: {
                ':pk': `user_${storesUserId}`,
                ':skPrefix': 'store_'
              }
            }).promise();
            
            console.log(`Found ${storesResult.Items?.length || 0} stores in DynamoDB`);
            
            // Transform DynamoDB items to store format
            const stores = (storesResult.Items || []).map(item => {
              // Extract store domain from sk (format: store_{domain}_metadata)
              const skParts = item.sk.split('_');
              const domain = skParts[1]; // Get the domain part
              
              return {
                id: item.storeId || domain || item.sk,
                name: item.storeName || item.name || domain,
                displayName: item.displayName || item.storeName || domain,
                type: item.storeType || 'shopify',
                shopifyDomain: item.shopifyDomain || domain,
                syncStatus: item.syncStatus || 'completed',
                syncMetadata: item.syncMetadata,
                connectedAt: item.connectedAt,
                lastSyncAt: item.lastSyncAt,
                productsCount: item.productsCount,
                ordersCount: item.ordersCount
              };
            });
            
            responseData = {
              stores: stores,
              count: stores.length,
              source: 'dynamodb'
            };
          } catch (dbError) {
            console.error('Error fetching stores from DynamoDB:', dbError);
            // Return empty array instead of mock data in production
            responseData = {
              stores: [],
              count: 0,
              source: 'error',
              error: 'Failed to fetch stores'
            };
          }
        }
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
            
            // Get dynamic API Gateway URL from request context
            const domainName = event.requestContext?.domainName || event.headers?.Host || event.headers?.host;
            const stage = event.requestContext?.stage || 'production';
            
            // Build the API Gateway URL dynamically
            const API_GATEWAY_URL = domainName 
              ? `https://${domainName}/${stage}`
              : `https://${process.env.API_GATEWAY_URL || 'tvaog6ef2f.execute-api.us-west-1.amazonaws.com/production'}`;
            
            const REDIRECT_URI = `${API_GATEWAY_URL}/api/shopify/callback`;
            
            console.log('Dynamic API Gateway URL:', API_GATEWAY_URL);
            console.log('Redirect URI:', REDIRECT_URI);
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
            
            // Return success HTML that closes the popup and sends store info
            return {
              statusCode: 200,
              headers: { 'Content-Type': 'text/html' },
              body: `<html><body>
                <h2>✅ Successfully connected to Shopify!</h2>
                <p>This window will close automatically...</p>
                <script>
                  if (window.opener) {
                    window.opener.postMessage({ 
                      type: 'shopify-connected', 
                      success: true,
                      storeData: {
                        storeDomain: '${shop}',
                        storeId: 'store_${shop}',
                        userId: '${stateResult.Item.userId}',
                        connectedAt: '${new Date().toISOString()}'
                      }
                    }, '*');
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
          const { userId, shopifyDomain, storeId, syncType } = body;
          
          // Normalize the domain - ensure it has .myshopify.com
          let storeDomain = shopifyDomain || storeId || '';
          if (storeDomain && !storeDomain.includes('.myshopify.com')) {
            storeDomain = `${storeDomain}.myshopify.com`;
          }
          
          console.log('Sync request:', { userId, storeDomain, syncType });
          
          if (!storeDomain || !userId) {
            return {
              statusCode: 400,
              headers: corsHeaders,
              body: JSON.stringify({ 
                error: 'Missing required parameters',
                required: ['userId', 'shopifyDomain or storeId']
              })
            };
          }
          
          // Try to get access token from DynamoDB
          let tokenResult;
          try {
            tokenResult = await dynamodb.get({
              TableName: process.env.TABLE_NAME,
              Key: {
                pk: `store_${storeDomain}`,
                sk: `user_${userId}`
              }
            }).promise();
          } catch (error) {
            console.error('Error retrieving store token:', error);
            // Try without the full domain in case it was stored differently
            if (storeDomain.includes('.myshopify.com')) {
              const shortDomain = storeDomain.replace('.myshopify.com', '');
              try {
                tokenResult = await dynamodb.get({
                  TableName: process.env.TABLE_NAME,
                  Key: {
                    pk: `store_${shortDomain}`,
                    sk: `user_${userId}`
                  }
                }).promise();
              } catch (e) {
                // Ignore and continue
              }
            }
          }
          
          if (!tokenResult || !tokenResult.Item || !tokenResult.Item.accessToken) {
            console.log('Store not found, trying scan for user stores...');
            // Fallback to scan to find any stores for this user
            try {
              const scanResult = await dynamodb.scan({
                TableName: process.env.TABLE_NAME,
                FilterExpression: 'sk = :sk AND begins_with(pk, :pkPrefix)',
                ExpressionAttributeValues: {
                  ':sk': `user_${userId}`,
                  ':pkPrefix': 'store_'
                }
              }).promise();
              
              if (scanResult.Items && scanResult.Items.length > 0) {
                const matchingStore = scanResult.Items.find(item => 
                  item.storeDomain === storeDomain || 
                  item.storeDomain === storeDomain.replace('.myshopify.com', '') ||
                  item.pk === `store_${storeDomain}` ||
                  item.pk === `store_${storeDomain.replace('.myshopify.com', '')}`
                );
                
                if (matchingStore && matchingStore.accessToken) {
                  tokenResult = { Item: matchingStore };
                }
              }
            } catch (scanError) {
              console.error('Scan error:', scanError);
            }
          }
          
          // If still no token found
          if (!tokenResult || !tokenResult.Item || !tokenResult.Item.accessToken) {
            return {
              statusCode: 401,
              headers: corsHeaders,
              body: JSON.stringify({ 
                error: 'Store not connected. Please reconnect your Shopify store.',
                details: `No access token found for store: ${storeDomain}`
              })
            };
          }
          
          const accessToken = tokenResult.Item.accessToken;
          const actualStoreDomain = tokenResult.Item.storeDomain || storeDomain;
          
          console.log('Starting Shopify data sync for:', actualStoreDomain);
          
          try {
            // Fetch real data from Shopify in parallel
            const [productsData, ordersData, customersData] = await Promise.allSettled([
              // Fetch products
              makeShopifyRequest(actualStoreDomain, accessToken, '/products.json?limit=250'),
              // Fetch orders (last 60 days)
              makeShopifyRequest(actualStoreDomain, accessToken, '/orders.json?status=any&limit=250'),
              // Fetch customers
              makeShopifyRequest(actualStoreDomain, accessToken, '/customers.json?limit=250')
            ]);
            
            // Process products
            let products = [];
            let inventory = 0;
            if (productsData.status === 'fulfilled' && productsData.value.products) {
              products = productsData.value.products;
              
              // Store products in DynamoDB (limit to 50 for initial sync to avoid throttling)
              for (const product of products.slice(0, 50)) {
                const variants = product.variants || [];
                for (const variant of variants) {
                  inventory += variant.inventory_quantity || 0;
                  
                  // Store product in DynamoDB
                  await dynamodb.put({
                    TableName: process.env.TABLE_NAME,
                    Item: {
                      pk: `user_${userId}`,
                      sk: `product_${product.id}_${variant.id}`,
                      productId: product.id.toString(),
                      variantId: variant.id.toString(),
                      title: product.title,
                      variantTitle: variant.title,
                      sku: variant.sku,
                      price: variant.price,
                      inventory: variant.inventory_quantity || 0,
                      storeDomain: actualStoreDomain,
                      syncedAt: new Date().toISOString()
                    }
                  }).promise().catch(err => console.error('Error storing product:', err));
                }
              }
              console.log(`Processed ${products.length} products with ${inventory} total inventory`);
            } else if (productsData.status === 'rejected') {
              console.error('Failed to fetch products:', productsData.reason);
            }
            
            // Process orders
            let orders = [];
            let totalRevenue = 0;
            if (ordersData.status === 'fulfilled' && ordersData.value.orders) {
              orders = ordersData.value.orders;
              
              // Store orders in DynamoDB (limit to 50 for initial sync)
              for (const order of orders.slice(0, 50)) {
                totalRevenue += parseFloat(order.total_price || 0);
                
                await dynamodb.put({
                  TableName: process.env.TABLE_NAME,
                  Item: {
                    pk: `user_${userId}`,
                    sk: `order_${order.id}`,
                    orderId: order.id.toString(),
                    orderNumber: order.order_number,
                    customerEmail: order.email,
                    totalPrice: order.total_price,
                    currency: order.currency,
                    status: order.financial_status,
                    fulfillmentStatus: order.fulfillment_status,
                    lineItems: order.line_items ? order.line_items.length : 0,
                    createdAt: order.created_at,
                    storeDomain: actualStoreDomain,
                    syncedAt: new Date().toISOString()
                  }
                }).promise().catch(err => console.error('Error storing order:', err));
              }
              console.log(`Processed ${orders.length} orders with total revenue: ${totalRevenue}`);
            } else if (ordersData.status === 'rejected') {
              console.error('Failed to fetch orders:', ordersData.reason);
            }
            
            // Process customers
            let customers = [];
            if (customersData.status === 'fulfilled' && customersData.value.customers) {
              customers = customersData.value.customers;
              console.log(`Found ${customers.length} customers`);
            } else if (customersData.status === 'rejected') {
              console.error('Failed to fetch customers:', customersData.reason);
            }
            
            // Store metadata about the sync
            await dynamodb.put({
              TableName: process.env.TABLE_NAME,
              Item: {
                pk: `user_${userId}`,
                sk: `store_${actualStoreDomain}_metadata`,
                customerCount: customers.length,
                productCount: products.length,
                orderCount: orders.length,
                totalInventory: inventory,
                totalRevenue: totalRevenue.toFixed(2),
                lastSyncedAt: new Date().toISOString()
              }
            }).promise().catch(err => console.error('Error storing metadata:', err));
            
            // Update store record with sync status
            await dynamodb.update({
              TableName: process.env.TABLE_NAME,
              Key: {
                pk: `store_${actualStoreDomain}`,
                sk: `user_${userId}`
              },
              UpdateExpression: 'SET lastSyncedAt = :now, syncStatus = :status',
              ExpressionAttributeValues: {
                ':now': new Date().toISOString(),
                ':status': 'completed'
              }
            }).promise().catch(err => console.error('Error updating store:', err));
            
            console.log(`Sync completed successfully for ${actualStoreDomain}`);
            
            responseData = {
              success: true,
              message: 'Store data synced successfully',
              data: {
                storeId: tokenResult.Item.pk || `store_${actualStoreDomain}`,
                storeName: actualStoreDomain.replace('.myshopify.com', ''),
                storeDomain: actualStoreDomain,
                syncedAt: new Date().toISOString(),
                products: products.length,
                orders: orders.length,
                customers: customers.length,
                inventory: inventory,
                totalRevenue: totalRevenue.toFixed(2)
              }
            };
          } catch (syncError) {
            console.error('Error during sync:', syncError);
            // Return partial success even if sync fails
            responseData = {
              success: false,
              message: `Store connected but sync failed: ${syncError.message}`,
              error: syncError.message,
              data: {
                storeId: tokenResult.Item.pk || `store_${actualStoreDomain}`,
                storeName: actualStoreDomain.replace('.myshopify.com', ''),
                storeDomain: actualStoreDomain,
                syncedAt: new Date().toISOString(),
                products: 0,
                orders: 0,
                customers: 0,
                inventory: 0
              }
            };
          }
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
            
            // Generate unique company ID
            const companyId = 'company-' + Date.now() + '-' + Math.random().toString(36).substring(7);
            
            // Create user in Cognito
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
                createdAt: new Date().toISOString()
              }
            }).promise();
            
            responseData = {
              success: true,
              message: 'Registration successful',
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
            availableEndpoints: ['/api/auth/login', '/api/auth/register', '/api/auth/forgot-password', '/api/auth/refresh']
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
