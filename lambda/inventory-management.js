const AWS = require('aws-sdk');

// Initialize AWS services
const dynamoConfig = {
  region: process.env.AWS_REGION || 'us-east-1'
};

// Only set endpoint for local development
if (process.env.DYNAMODB_ENDPOINT) {
  dynamoConfig.endpoint = process.env.DYNAMODB_ENDPOINT;
}

const dynamodb = new AWS.DynamoDB.DocumentClient(dynamoConfig);

// Get inventory data for a specific store
const getInventoryForStore = async (userId, storeId) => {
  try {
    const inventoryTable = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-inventory`;
    const productsTable = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-products`;
    
    console.log(`Getting inventory for store: ${storeId}`);
    console.log(`Using tables: ${inventoryTable}, ${productsTable}`);
    console.log(`DynamoDB endpoint: ${dynamoConfig.endpoint || 'AWS'}`);
    
    // Get inventory data
    const inventoryResult = await dynamodb.scan({
      TableName: inventoryTable,
      FilterExpression: '#storeId = :storeId',
      ExpressionAttributeNames: {
        '#storeId': 'storeId'
      },
      ExpressionAttributeValues: {
        ':storeId': storeId
      }
    }).promise();
    
    if (!inventoryResult.Items || inventoryResult.Items.length === 0) {
      console.log('No inventory items found for store');
      return [];
    }
    
    console.log(`Found ${inventoryResult.Items.length} inventory items`);
    
    // Get products data to join with inventory
    const productsResult = await dynamodb.scan({
      TableName: productsTable,
      FilterExpression: '#storeId = :storeId',
      ExpressionAttributeNames: {
        '#storeId': 'storeId'
      },
      ExpressionAttributeValues: {
        ':storeId': storeId
      }
    }).promise();
    
    console.log(`Found ${productsResult.Items ? productsResult.Items.length : 0} products`);
    
    // Create a map of product data keyed by inventory_item_id
    const productMap = {};
    if (productsResult.Items) {
      productsResult.Items.forEach(product => {
        if (product.variants) {
          product.variants.forEach(variant => {
            if (variant.inventory_item_id) {
              productMap[variant.inventory_item_id] = {
                productId: product.productId,
                title: product.title,
                vendor: product.vendor,
                productType: product.productType,
                variants: product.variants.filter(v => v.inventory_item_id === variant.inventory_item_id)
              };
            }
          });
        }
      });
    }
    
    // Create inventory records for all products, joining with actual inventory data where available
    // Start with all products and add inventory info where available
    const allProductInventory = [];
    
    if (productsResult.Items) {
      productsResult.Items.forEach(product => {
        if (product.variants) {
          product.variants.forEach(variant => {
            // Find corresponding inventory record if it exists
            const inventoryRecord = inventoryResult.Items?.find(inv => 
              inv.inventoryItemId === variant.inventory_item_id
            );
            
            // Create inventory entry for this product variant
            const inventoryEntry = {
              id: inventoryRecord?.id || `${storeId}_inventory_${variant.inventory_item_id}`,
              storeId: storeId,
              userId: userId,
              inventoryItemId: variant.inventory_item_id,
              locationId: inventoryRecord?.locationId || null,
              available: inventoryRecord?.available || 0, // Default to 0 if no inventory tracking
              updatedAt: inventoryRecord?.updatedAt || product.updatedAt,
              syncedAt: inventoryRecord?.syncedAt || Date.now(),
              // Product information
              productId: product.productId,
              title: product.title,
              vendor: product.vendor,
              productType: product.productType,
              variants: [variant] // Just this specific variant
            };
            
            allProductInventory.push(inventoryEntry);
          });
        }
      });
    }
    
    console.log(`Returning ${allProductInventory.length} product inventory items (${inventoryResult.Items?.length || 0} with actual inventory data)`);
    return allProductInventory;
    
  } catch (error) {
    console.error('Error getting inventory:', error);
    throw error;
  }
};

// Get all inventory across all user stores
const getAllInventoryForUser = async (userId) => {
  try {
    const storesTable = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-stores`;
    
    // First get user's stores
    const storesResult = await dynamodb.query({
      TableName: storesTable,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    }).promise();
    
    if (!storesResult.Items || storesResult.Items.length === 0) {
      return [];
    }
    
    // Get inventory for each store
    const allInventory = [];
    for (const store of storesResult.Items) {
      const storeInventory = await getInventoryForStore(userId, store.id);
      allInventory.push(...storeInventory);
    }
    
    return allInventory;
    
  } catch (error) {
    console.error('Error getting all inventory:', error);
    throw error;
  }
};

// Main handler
exports.handler = async (event) => {
  console.log('Inventory Management Lambda triggered:', JSON.stringify(event));
  
  // Handle OPTIONS request for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,userId',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
      },
      body: ''
    };
  }
  
  try {
    const path = event.path;
    const method = event.httpMethod;
    const userId = event.requestContext?.authorizer?.userId || event.headers?.userId || event.headers?.userid;
    
    if (!userId) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'User authentication required'
        })
      };
    }
    
    if (path.includes('/inventory') && method === 'GET') {
      const queryParams = event.queryStringParameters || {};
      const storeId = queryParams.storeId;
      
      let inventory;
      if (storeId) {
        // Get inventory for specific store
        inventory = await getInventoryForStore(userId, storeId);
      } else {
        // Get inventory for all user stores
        inventory = await getAllInventoryForUser(userId);
      }
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          inventory,
          count: inventory.length
        })
      };
    }
    
    return {
      statusCode: 404,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Not found' })
    };
    
  } catch (error) {
    console.error('Error in inventory management:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};