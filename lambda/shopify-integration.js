const AWS = require('aws-sdk');
const axios = require('axios');

// Initialize AWS services
const dynamoConfig = {
  region: process.env.AWS_REGION || 'us-east-1'
};

// Only set endpoint for local development
if (process.env.DYNAMODB_ENDPOINT) {
  dynamoConfig.endpoint = process.env.DYNAMODB_ENDPOINT;
}

const dynamodb = new AWS.DynamoDB.DocumentClient(dynamoConfig);

const SHOPIFY_API_VERSION = '2024-01';

// Helper function to build Shopify API URL
const buildShopifyUrl = (domain, endpoint) => {
  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  // Ensure .myshopify.com domain
  const fullDomain = cleanDomain.includes('.myshopify.com') 
    ? cleanDomain 
    : `${cleanDomain}.myshopify.com`;
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

// Fetch products from Shopify
const fetchShopifyProducts = async (domain, apiKey) => {
  if (!apiKey) {
    throw new Error('API key is required. Please connect your Shopify store using OAuth or provide an API token.');
  }
  
  const data = await shopifyRequest(domain, apiKey, 'products.json?limit=250');
  return data.products || [];
};

// Fetch orders from Shopify
const fetchShopifyOrders = async (domain, apiKey) => {
  if (!apiKey) {
    throw new Error('API key is required. Please connect your Shopify store using OAuth or provide an API token.');
  }
  
  // Fetch orders from the last 90 days
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - 90);
  const since = sinceDate.toISOString();
  
  const data = await shopifyRequest(domain, apiKey, `orders.json?status=any&created_at_min=${since}&limit=250`);
  return data.orders || [];
};

// Fetch inventory levels from Shopify
const fetchShopifyInventory = async (domain, apiKey) => {
  if (!apiKey) {
    throw new Error('API key is required. Please connect your Shopify store using OAuth or provide an API token.');
  }
  
  const data = await shopifyRequest(domain, apiKey, 'inventory_levels.json?limit=250');
  return data.inventory_levels || [];
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

// Process and store orders as sales data
const storeSalesData = async (userId, storeId, orders) => {
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
      syncedAt: timestamp
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

// Main handler
exports.handler = async (event) => {
  console.log('Shopify Integration Lambda triggered:', JSON.stringify(event));
  
  try {
    const { userId, storeId, shopifyDomain, apiKey, syncType = 'full' } = 
      event.body ? JSON.parse(event.body) : event;
    
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
    
    const [products, orders, inventory] = await Promise.all([
      fetchShopifyProducts(shopifyDomain, apiKey),
      fetchShopifyOrders(shopifyDomain, apiKey),
      fetchShopifyInventory(shopifyDomain, apiKey)
    ]);
    
    // Store data in DynamoDB
    await Promise.all([
      storeProducts(userId, storeId, products),
      storeSalesData(userId, storeId, orders),
      storeInventoryData(userId, storeId, inventory)
    ]);
    
    // Update sync status to 'completed'
    const syncMetadata = {
      completedAt: new Date().toISOString(),
      productsCount: products.length,
      ordersCount: orders.length,
      inventoryCount: inventory.length
    };
    
    await updateStoreSyncStatus(userId, storeId, 'completed', syncMetadata);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'Shopify sync completed successfully',
        storeId,
        stats: {
          products: products.length,
          orders: orders.length,
          inventory: inventory.length
        }
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
        error: 'Failed to sync Shopify data',
        message: error.message
      })
    };
  }
};