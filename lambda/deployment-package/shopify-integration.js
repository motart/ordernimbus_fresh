const AWS = require('aws-sdk');
const axios = require('axios');

// Initialize AWS services
const dynamoConfig = {
  region: process.env.AWS_REGION || 'us-west-1'
};

// Only set endpoint for local development
if (process.env.DYNAMODB_ENDPOINT) {
  dynamoConfig.endpoint = process.env.DYNAMODB_ENDPOINT;
}

const dynamodb = new AWS.DynamoDB.DocumentClient(dynamoConfig);
const ssm = new AWS.SSM({ region: process.env.AWS_REGION || 'us-west-1' });

// Import new GraphQL services
const ProductService = require('./shopify/services/productService');
const InventoryService = require('./shopify/services/inventoryService');
const OrderService = require('./shopify/services/orderService');
const ShopService = require('./shopify/services/shopService');

// Cache for Shopify credentials to avoid repeated calls
let shopifyCredentials = null;

// Use latest API version
const SHOPIFY_API_VERSION = '2024-07';

// Helper function to get Shopify credentials from AWS SSM Parameter Store
const getShopifyCredentials = async () => {
  if (shopifyCredentials) {
    return shopifyCredentials;
  }

  try {
    const environment = process.env.ENVIRONMENT || 'staging';
    const parameterName = `/ordernimbus/${environment}/shopify`;
    
    // Fetching Shopify credentials from SSM Parameter Store
    
    const result = await ssm.getParameter({
      Name: parameterName,
      WithDecryption: true
    }).promise();
    
    const credentials = JSON.parse(result.Parameter.Value);
    
    if (!credentials.SHOPIFY_CLIENT_ID || !credentials.SHOPIFY_CLIENT_SECRET) {
      throw new Error('Invalid Shopify credentials in SSM Parameter Store');
    }

    // Cache credentials for the duration of this Lambda execution
    shopifyCredentials = {
      apiKey: credentials.SHOPIFY_CLIENT_ID,
      apiSecret: credentials.SHOPIFY_CLIENT_SECRET,
      appUrl: credentials.SHOPIFY_APP_URL || '',
      redirectUri: credentials.SHOPIFY_REDIRECT_URI || ''
    };
    
    // Successfully retrieved Shopify credentials
    return shopifyCredentials;
    
  } catch (error) {
    console.error('Error fetching Shopify credentials from SSM Parameter Store:', error);
    
    // Fallback to environment variables for local development
    if (process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET) {
      // Using fallback environment variables for local development
      return {
        apiKey: process.env.SHOPIFY_CLIENT_ID,
        apiSecret: process.env.SHOPIFY_CLIENT_SECRET,
        appUrl: process.env.SHOPIFY_APP_URL || '',
        redirectUri: process.env.SHOPIFY_REDIRECT_URI || ''
      };
    }
    
    throw new Error('Failed to retrieve Shopify credentials. Ensure they are stored in AWS SSM Parameter Store.');
  }
};

// Helper function to clean and normalize Shopify domain
const cleanShopifyDomain = (domain) => {
  let cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  
  // Remove all instances of .myshopify.com to avoid duplication
  cleanDomain = cleanDomain.replace(/\.myshopify\.com/g, '');
  
  // Add .myshopify.com
  return `${cleanDomain}.myshopify.com`;
};

// Helper function to build Shopify API URL
const buildShopifyUrl = (domain, endpoint) => {
  const fullDomain = cleanShopifyDomain(domain);
  return `https://${fullDomain}/admin/api/${SHOPIFY_API_VERSION}/${endpoint}`;
};

// Helper function to make Shopify API requests
const shopifyRequest = async (domain, apiKey, endpoint) => {
  try {
    const url = buildShopifyUrl(domain, endpoint);
    console.log(`Making Shopify request to: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'X-Shopify-Access-Token': apiKey,
        'Content-Type': 'application/json'
      }
    });
    
    return response.data;
  } catch (error) {
    console.error(`Shopify API error for ${endpoint}:`, error.response?.data || error.message);
    throw error;
  }
};

// Fetch products from Shopify using GraphQL
const fetchShopifyProducts = async (domain, apiKey) => {
  if (!apiKey) {
    throw new Error('API key is required. Please connect your Shopify store using OAuth or provide an API token.');
  }
  
  // Always use GraphQL (feature flag defaults to true)
  if (true) { // GraphQL is always enabled
    const productService = new ProductService(domain, apiKey);
    
    // Fetch all products (handles pagination automatically)
    const products = await productService.fetchAllProducts({ maxProducts: 10000 });
    console.log(`Fetched ${products.length} products via GraphQL`);
    return products;
  } else {
    // Fallback to REST API
    const data = await shopifyRequest(domain, apiKey, 'products.json?limit=250');
    return data.products || [];
  }
};

// Fetch orders from Shopify using GraphQL only
const fetchShopifyOrders = async (domain, apiKey) => {
  if (!apiKey) {
    throw new Error('API key is required. Please connect your Shopify store using OAuth or provide an API token.');
  }
  
  // Always use GraphQL via OrderService
  const orderService = new OrderService(domain, apiKey);
  
  // Fetch orders from last 90 days
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - 90);
  
  try {
    const orders = await orderService.fetchAllOrders({ 
      sinceDate, 
      maxOrders: 10000 
    });
    
    console.log(`Successfully fetched ${orders.length} orders via GraphQL`);
    return orders;
  } catch (error) {
    console.error('Failed to fetch orders via GraphQL:', error.message);
    // Return empty array instead of throwing to allow partial sync
    return [];
  }
};

// Generate sample orders for development/testing when real orders are blocked
const generateSampleOrders = (products, dayCount = 90) => {
  console.log('Generating sample orders for development...');
  const orders = [];
  const today = new Date();
  
  for (let i = 0; i < dayCount; i++) {
    const orderDate = new Date(today);
    orderDate.setDate(orderDate.getDate() - i);
    
    // Generate 0-5 orders per day with some randomness
    const ordersPerDay = Math.floor(Math.random() * 6);
    
    for (let j = 0; j < ordersPerDay; j++) {
      const orderTime = new Date(orderDate);
      orderTime.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));
      
      // Pick 1-3 random products for this order
      const itemCount = Math.floor(Math.random() * 3) + 1;
      const orderProducts = [];
      let totalPrice = 0;
      
      for (let k = 0; k < itemCount && k < products.length; k++) {
        const product = products[Math.floor(Math.random() * products.length)];
        const quantity = Math.floor(Math.random() * 3) + 1;
        const price = parseFloat(product.variants?.[0]?.price || Math.random() * 100);
        const lineTotal = price * quantity;
        
        orderProducts.push({
          product_id: product.id,
          title: product.title,
          quantity: quantity,
          price: price.toFixed(2),
          total: lineTotal.toFixed(2)
        });
        
        totalPrice += lineTotal;
      }
      
      orders.push({
        id: `sample_order_${i}_${j}`,
        name: `#${1000 + i * 10 + j}`,
        created_at: orderTime.toISOString(),
        updated_at: orderTime.toISOString(),
        total_price: totalPrice.toFixed(2),
        subtotal_price: totalPrice.toFixed(2),
        currency: 'USD',
        financial_status: 'paid',
        fulfillment_status: 'fulfilled',
        line_items: orderProducts,
        sample_data: true // Flag to identify sample data
      });
    }
  }
  
  console.log(`Generated ${orders.length} sample orders for testing`);
  return orders;
};

// Fetch sales analytics data as alternative to orders
const fetchShopifyAnalytics = async (domain, apiKey) => {
  if (!apiKey) {
    throw new Error('API key is required.');
  }
  
  try {
    // Try to get sales reports via Analytics API
    const analyticsQuery = {
      query: `
        query {
          shopifyqlQuery(query: "FROM sales SHOW total_sales, net_quantity BY day SINCE -90d ORDER BY day") {
            tableData {
              columns {
                name
                dataType
              }
              rowData
            }
          }
        }
      `
    };
    
    const url = buildShopifyUrl(domain, 'graphql.json');
    const response = await axios.post(url, analyticsQuery, {
      headers: {
        'X-Shopify-Access-Token': apiKey,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.data.data && response.data.data.shopifyqlQuery) {
      console.log('Successfully fetched analytics data');
      return response.data.data.shopifyqlQuery.tableData;
    }
  } catch (error) {
    console.log('Analytics API error:', error.response?.data || error.message);
  }
  
  return null;
};

// Fetch inventory levels from Shopify using GraphQL
const fetchShopifyInventory = async (domain, apiKey, locationId) => {
  if (!apiKey) {
    throw new Error('API key is required. Please connect your Shopify store using OAuth or provide an API token.');
  }
  
  // Always use GraphQL (feature flag defaults to true)
  if (true) { // GraphQL is always enabled
    const inventoryService = new InventoryService(domain, apiKey);
    
    // Get locations if not provided
    if (!locationId) {
      try {
        const locations = await inventoryService.fetchLocations();
        if (locations && locations.length > 0) {
          locationId = locations[0].id;
          console.log('Using location ID:', locationId);
        } else {
          console.log('No locations found, skipping inventory sync');
          return [];
        }
      } catch (error) {
        console.log('Could not fetch locations, skipping inventory sync:', error.message);
        return [];
      }
    }
    
    // Fetch inventory levels for the location
    if (locationId) {
      const inventory = await inventoryService.fetchInventoryLevels([locationId]);
      console.log(`Fetched ${inventory.length} inventory levels via GraphQL`);
      return inventory;
    }
    
    return [];
  } else {
    // Fallback to REST API
    if (!locationId) {
      try {
        const locationsData = await shopifyRequest(domain, apiKey, 'locations.json');
        if (locationsData.locations && locationsData.locations.length > 0) {
          locationId = locationsData.locations[0].id;
          console.log('Using location ID:', locationId);
        }
      } catch (error) {
        console.log('Could not fetch locations, skipping inventory sync');
        return [];
      }
    }
    
    if (locationId) {
      const data = await shopifyRequest(domain, apiKey, `inventory_levels.json?location_ids=${locationId}&limit=250`);
      return data.inventory_levels || [];
    }
    
    return [];
  }
};


// Process and store products in DynamoDB
const storeProducts = async (userId, storeId, products) => {
  const tableName = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-products`;
  const timestamp = Date.now();
  
  for (const product of products) {
    const item = {
      userId,
      id: `${storeId}_product_${product.id}`,
      storeId,
      productId: product.id,
      title: product.title,
      vendor: product.vendor,
      productType: product.product_type,
      status: product.status,
      variants: product.variants,
      images: product.images,
      createdAt: product.created_at,
      updatedAt: product.updated_at,
      syncedAt: timestamp
    };
    
    await dynamodb.put({
      TableName: tableName,
      Item: item
    }).promise();
  }
  
  console.log(`Stored ${products.length} products for store ${storeId}`);
};

// Store individual orders in orders table
const storeOrders = async (userId, storeId, orders) => {
  const ordersTable = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-orders`;
  const timestamp = Date.now();
  
  for (const order of orders) {
    // Ensure order ID is a string
    const orderId = String(order.id || order.name);
    
    const item = {
      userId,
      id: orderId,
      storeId,
      name: order.name,
      created_at: order.created_at,
      updated_at: order.updated_at,
      total_price: String(order.total_price || '0'),
      subtotal_price: String(order.subtotal_price || order.total_price || '0'),
      currency: order.currency || 'USD',
      financial_status: order.financial_status,
      fulfillment_status: order.fulfillment_status,
      line_items: order.line_items || [],
      customer: order.customer || {},
      email: order.email || order.customer?.email || '',
      shipping_address: order.shipping_address || {},
      billing_address: order.billing_address || {},
      sample_data: order.sample_data || false,
      syncedAt: timestamp
    };
    
    await dynamodb.put({
      TableName: ordersTable,
      Item: item
    }).promise();
  }
  
  console.log(`Stored ${orders.length} orders for store ${storeId}`);
};

// Process and store orders as sales data
const storeSalesData = async (userId, storeId, orders, isSampleData = false) => {
  const tableName = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-sales`;
  const timestamp = Date.now();
  
  // Aggregate sales by date
  const salesByDate = {};
  
  for (const order of orders) {
    const date = order.created_at.split('T')[0]; // Get date part only
    
    if (!salesByDate[date]) {
      salesByDate[date] = {
        totalSales: 0,
        orderCount: 0,
        products: {},
        avgOrderValue: 0
      };
    }
    
    salesByDate[date].totalSales += parseFloat(order.total_price || 0);
    salesByDate[date].orderCount += 1;
    
    // Track product sales
    for (const lineItem of order.line_items || []) {
      const productId = lineItem.product_id;
      if (!salesByDate[date].products[productId]) {
        salesByDate[date].products[productId] = {
          quantity: 0,
          revenue: 0
        };
      }
      salesByDate[date].products[productId].quantity += lineItem.quantity;
      salesByDate[date].products[productId].revenue += parseFloat(lineItem.price) * lineItem.quantity;
    }
  }
  
  // Store aggregated sales data
  for (const [date, data] of Object.entries(salesByDate)) {
    const item = {
      userId,
      id: `${storeId}_sales_${date}`,
      date,
      storeId,
      totalSales: data.totalSales,
      orderCount: data.orderCount,
      avgOrderValue: data.totalSales / data.orderCount,
      productSales: data.products,
      syncedAt: timestamp,
      isSampleData: isSampleData // Flag to identify sample data in DB
    };
    
    await dynamodb.put({
      TableName: tableName,
      Item: item
    }).promise();
  }
  
  console.log(`Stored sales data for ${Object.keys(salesByDate).length} days for store ${storeId}`);
};

// Process and store inventory data
const storeInventoryData = async (userId, storeId, inventory) => {
  const tableName = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-inventory`;
  const timestamp = Date.now();
  
  for (const inv of inventory) {
    const item = {
      userId,
      id: `${storeId}_inventory_${inv.inventory_item_id}`,
      storeId,
      inventoryItemId: inv.inventory_item_id,
      locationId: inv.location_id,
      available: inv.available,
      updatedAt: inv.updated_at,
      syncedAt: timestamp
    };
    
    await dynamodb.put({
      TableName: tableName,
      Item: item
    }).promise();
  }
  
  console.log(`Stored ${inventory.length} inventory records for store ${storeId}`);
};

// Update store sync status
const updateStoreSyncStatus = async (userId, storeId, status, metadata = {}) => {
  const tableName = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-stores`;
  
  const updateExpression = 'SET lastSync = :lastSync, syncStatus = :status, syncMetadata = :metadata';
  const expressionValues = {
    ':lastSync': new Date().toISOString(),
    ':status': status,
    ':metadata': metadata
  };
  
  await dynamodb.update({
    TableName: tableName,
    Key: { userId, id: storeId },
    UpdateExpression: updateExpression,
    ExpressionAttributeValues: expressionValues
  }).promise();
};

// Handle Shopify OAuth connection
const handleShopifyConnect = async (event) => {
  console.log('Handling Shopify connect request');
  
  const body = JSON.parse(event.body);
  const { storeDomain } = body;
  
  // Extract userId from JWT authorizer context
  let userId;
  if (event.requestContext?.authorizer?.lambda?.userId) {
    userId = event.requestContext.authorizer.lambda.userId;
  } else if (event.requestContext?.authorizer?.userId) {
    userId = event.requestContext.authorizer.userId;
  } else if (event.requestContext?.authorizer?.claims?.sub) {
    userId = event.requestContext.authorizer.claims.sub;
  } else if (body.userId) {
    // Fallback for testing
    console.warn('Using userId from body - should be from JWT');
    userId = body.userId;
  }
  
  if (!userId || !storeDomain) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Missing required parameters: userId, storeDomain'
      })
    };
  }
  
  // Clean the domain to avoid duplication
  const cleanDomain = cleanShopifyDomain(storeDomain);
  
  // Get Shopify credentials securely from Parameter Store
  const credentials = await getShopifyCredentials();
  const SHOPIFY_API_KEY = credentials.apiKey;
  
  // Prioritize dynamic redirect URI generation when API Gateway context is available
  let redirectUri;
  
  // Get the API Gateway URL from the event context first
  if (event.requestContext && event.requestContext.domainName) {
    const stage = event.requestContext.stage || 'production';
    redirectUri = `https://${event.requestContext.domainName}/${stage}/api/shopify/callback`;
  } else {
    // Use stored redirect URI from credentials if no context available
    redirectUri = credentials.redirectUri;
    
    if (!redirectUri) {
      // Fallback to environment-based URLs
      const environment = process.env.ENVIRONMENT || 'local';
      switch (environment) {
        case 'staging':
          redirectUri = process.env.API_URL ? 
            `${process.env.API_URL}/api/shopify/callback` : 
            'https://staging.ordernimbus.com/api/shopify/callback';
          break;
        case 'production':
          redirectUri = process.env.API_URL ? 
            `${process.env.API_URL}/api/shopify/callback` : 
            'https://7tdwngcc30.execute-api.us-west-1.amazonaws.com/production/api/shopify/callback';
          break;
        default:
          redirectUri = 'http://localhost:3001/api/shopify/callback';
      }
    }
  }
  
  // Using the computed Shopify redirect URI
  
  // Required Shopify OAuth scopes
  const scopes = [
    'read_products',
    'read_orders',
    'read_inventory',
    'read_customers',
    'read_analytics'
  ].join(',');
  
  // Generate OAuth URL with real credentials
  const authUrl = `https://${cleanDomain}/admin/oauth/authorize` +
    `?client_id=${SHOPIFY_API_KEY}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(JSON.stringify({ userId, storeDomain: cleanDomain }))}`;
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      authUrl,
      message: 'Redirecting to Shopify for authorization...'
    })
  };
};

// Handle Shopify OAuth callback
const handleShopifyCallback = async (event) => {
  console.log('Handling Shopify OAuth callback');
  
  const { code, state, shop, error } = event.queryStringParameters || {};
  
  if (error) {
    console.error('OAuth error:', error);
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'text/html',
      },
      body: `
        <html>
          <body>
            <script>
              window.opener.postMessage({
                type: 'shopify-oauth-error',
                error: '${error}'
              }, '*');
              window.close();
            </script>
          </body>
        </html>
      `
    };
  }
  
  if (!code || !shop || !state) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'text/html',
      },
      body: `
        <html>
          <body>
            <script>
              window.opener.postMessage({
                type: 'shopify-oauth-error',
                error: 'Missing required parameters'
              }, '*');
              window.close();
            </script>
          </body>
        </html>
      `
    };
  }
  
  try {
    // Parse state to get user info
    const stateData = JSON.parse(decodeURIComponent(state));
    const { userId, storeDomain } = stateData;
    
    // Get Shopify credentials securely from Parameter Store
    const credentials = await getShopifyCredentials();
    const SHOPIFY_API_KEY = credentials.apiKey;
    const SHOPIFY_API_SECRET = credentials.apiSecret;
    
    const tokenResponse = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: SHOPIFY_API_KEY,
      client_secret: SHOPIFY_API_SECRET,
      code: code
    });
    
    const { access_token } = tokenResponse.data;
    
    // Get shop info using GraphQL
    const shopService = new ShopService(shop, access_token);
    const shopData = await shopService.fetchShopInfo();
    
    // Save store credentials to DynamoDB
    const tableName = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-stores`;
    const storeId = shopData.domain.replace('.myshopify.com', '');
    
    await dynamodb.put({
      TableName: tableName,
      Item: {
        userId,
        id: storeId,
        storeId,
        storeName: shopData.name,
        shopifyDomain: shopData.domain,
        apiKey: access_token,
        status: 'active',
        type: 'shopify',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    }).promise();
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html',
      },
      body: `
        <html>
          <body>
            <script>
              window.opener.postMessage({
                type: 'shopify-oauth-success',
                data: {
                  storeId: '${shopData.id}',
                  storeName: '${shopData.name}',
                  domain: '${shopData.domain}',
                  accessToken: '${access_token}'
                }
              }, '*');
              window.close();
            </script>
          </body>
        </html>
      `
    };
  } catch (error) {
    console.error('Error in OAuth callback:', error);
    
    // Determine error message based on error type
    let errorMessage = 'Failed to complete OAuth flow';
    if (error.message && error.message.includes('401')) {
      errorMessage = 'Failed to exchange code for access token';
    } else if (error.message && error.message.includes('Request failed')) {
      errorMessage = 'Failed to exchange code for access token';
    }
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'text/html',
      },
      body: `
        <html>
          <body>
            <script>
              window.opener.postMessage({
                type: 'shopify-oauth-error',
                error: '${errorMessage}'
              }, '*');
              window.close();
            </script>
          </body>
        </html>
      `
    };
  }
};

// Main handler
exports.handler = async (event) => {
  console.log('Shopify Integration Lambda triggered:', JSON.stringify(event));
  
  try {
    // Check if this is a connect request (OAuth flow)
    if (event.path && event.path.includes('/connect')) {
      return await handleShopifyConnect(event);
    }
    
    // Check if this is a callback request (OAuth callback)
    if (event.path && event.path.includes('/callback')) {
      return await handleShopifyCallback(event);
    }
    
    // Default to sync flow
    const body = event.body ? JSON.parse(event.body) : event;
    const { storeId, shopifyDomain, apiKey, syncType = 'full', locationId } = body;
    
    // Extract userId from JWT authorizer context
    let userId;
    if (event.requestContext?.authorizer?.lambda?.userId) {
      // API Gateway v2 with Lambda authorizer
      userId = event.requestContext.authorizer.lambda.userId;
    } else if (event.requestContext?.authorizer?.userId) {
      // Alternative authorizer context structure
      userId = event.requestContext.authorizer.userId;
    } else if (event.requestContext?.authorizer?.claims?.sub) {
      // Direct JWT claims from Cognito authorizer
      userId = event.requestContext.authorizer.claims.sub;
    } else if (body.userId) {
      // Fallback to body for backwards compatibility
      console.warn('Using userId from body - should be from JWT');
      userId = body.userId;
    }
    
    console.log('Extracted userId:', userId);
    
    if (!userId || !storeId || !shopifyDomain) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Missing required parameters: userId, storeId, shopifyDomain'
        })
      };
    }
    
    // Validate API key
    if (!apiKey) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'API key is required. Please connect your Shopify store using the Connect to Shopify button.'
        })
      };
    }
    
    // Update sync status to 'syncing'
    await updateStoreSyncStatus(userId, storeId, 'syncing', { startTime: new Date().toISOString() });
    
    // Fetch data from Shopify or generate sample data
    console.log(`Starting Shopify sync for store ${storeId} (${shopifyDomain})`);
    
    // Fetch data with error handling for each endpoint
    let products = [];
    let orders = [];
    let inventory = [];
    let errors = [];
    
    // Fetch products (usually accessible)
    try {
      products = await fetchShopifyProducts(shopifyDomain, apiKey);
      console.log(`Fetched ${products.length} products`);
    } catch (error) {
      console.log('Could not fetch products:', error.message);
      errors.push(`Products: ${error.message}`);
    }
    
    // Fetch orders (may require protected data access)
    try {
      orders = await fetchShopifyOrders(shopifyDomain, apiKey);
      console.log(`Fetched ${orders.length} orders`);
      
      // If we got 0 orders but no error, the store might just be empty
      if (orders.length === 0) {
        console.log('Store has no orders. Checking if we should generate sample data...');
      }
    } catch (error) {
      console.log('Could not fetch orders:', error.message);
      if (error.message.includes('protected customer data')) {
        console.log('Note: Order access requires app approval for protected customer data');
        console.log('Attempting to fetch analytics data as alternative...');
        
        // Try analytics API as fallback
        try {
          const analyticsData = await fetchShopifyAnalytics(shopifyDomain, apiKey);
          if (analyticsData) {
            console.log('Successfully retrieved sales analytics data');
            errors.push('Orders: Using analytics data instead of detailed orders');
          }
        } catch (analyticsError) {
          console.log('Analytics API also failed:', analyticsError.message);
        }
      }
      errors.push(`Orders: ${error.message}`);
    }
    
    // Generate sample orders in development if we have products but no orders
    const isDevelopment = process.env.ENVIRONMENT === 'local' || process.env.ENVIRONMENT === 'development';
    if (isDevelopment && products.length > 0 && orders.length === 0) {
      console.log('DEVELOPMENT MODE: No orders found. Generating sample orders for testing...');
      orders = generateSampleOrders(products, 90);
      errors.push('Orders: Using SAMPLE DATA for development (store has no real orders).');
    } else if (!isDevelopment && orders.length === 0 && products.length > 0) {
      console.warn('PRODUCTION WARNING: Store has no orders to analyze.');
      errors.push('Orders: No orders found in store. Create some orders in Shopify first.');
    }
    
    // Fetch inventory (may require location approval)
    try {
      inventory = await fetchShopifyInventory(shopifyDomain, apiKey, locationId);
      console.log(`Fetched ${inventory.length} inventory items`);
    } catch (error) {
      console.log('Could not fetch inventory:', error.message);
      if (error.message.includes('read_locations')) {
        console.log('Note: Inventory access requires merchant approval for locations');
      }
      errors.push(`Inventory: ${error.message}`);
    }
    
    // Store data in DynamoDB (only if we have data)
    const storePromises = [];
    if (products.length > 0) {
      storePromises.push(storeProducts(userId, storeId, products));
    }
    if (orders.length > 0) {
      // Check if orders are sample data
      const isSampleData = orders.some(order => order.sample_data === true);
      // Store individual orders
      storePromises.push(storeOrders(userId, storeId, orders));
      // Also store aggregated sales data
      storePromises.push(storeSalesData(userId, storeId, orders, isSampleData));
    }
    if (inventory.length > 0) {
      storePromises.push(storeInventoryData(userId, storeId, inventory));
    }
    
    if (storePromises.length > 0) {
      await Promise.all(storePromises);
    }
    
    // Determine sync status based on what was fetched
    const hasData = products.length > 0 || orders.length > 0 || inventory.length > 0;
    const syncStatus = hasData ? 'completed' : 'partial';
    
    // Update sync status
    const syncMetadata = {
      completedAt: new Date().toISOString(),
      productsCount: products.length,
      ordersCount: orders.length,
      inventoryCount: inventory.length,
      errors: errors.length > 0 ? errors : undefined,
      notes: errors.length > 0 ? 
        'Some data could not be fetched. This is normal for development stores. Orders require protected customer data approval.' : 
        undefined
    };
    
    await updateStoreSyncStatus(userId, storeId, syncStatus, syncMetadata);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: hasData ? 
          'Shopify sync completed successfully' : 
          'Shopify sync completed with limitations',
        storeId,
        stats: {
          products: products.length,
          orders: orders.length,
          inventory: inventory.length
        },
        warnings: errors.length > 0 ? errors : undefined,
        note: errors.length > 0 ? 
          'Some endpoints require additional permissions. This is normal for development stores.' : 
          undefined
      })
    };
    
  } catch (error) {
    console.error('Error in Shopify integration:', error);
    
    // Update sync status to 'failed'
    if (event.body) {
      const { userId, storeId } = JSON.parse(event.body);
      if (userId && storeId) {
        await updateStoreSyncStatus(userId, storeId, 'failed', { 
          error: error.message,
          failedAt: new Date().toISOString()
        });
      }
    }
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: error.message,
        message: 'Failed to sync Shopify data'
      })
    };
  }
};