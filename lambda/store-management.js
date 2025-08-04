const AWS = require('aws-sdk');
const crypto = require('crypto');

// Initialize AWS services
const dynamoConfig = {
  region: process.env.AWS_REGION || 'us-east-1'
};

// Only set endpoint for local development
if (process.env.DYNAMODB_ENDPOINT) {
  dynamoConfig.endpoint = process.env.DYNAMODB_ENDPOINT;
}

const dynamodb = new AWS.DynamoDB.DocumentClient(dynamoConfig);

const lambdaConfig = {
  region: process.env.AWS_REGION || 'us-east-1'
};

// Only set endpoint for local development
if (process.env.LAMBDA_ENDPOINT) {
  lambdaConfig.endpoint = process.env.LAMBDA_ENDPOINT;
}

const lambda = new AWS.Lambda(lambdaConfig);

// Helper function to trigger Shopify sync
const triggerShopifySync = async (userId, storeId, shopifyDomain, apiKey) => {
  const functionName = process.env.SHOPIFY_SYNC_FUNCTION || 'ordernimbus-local-shopify-integration';
  
  try {
    const payload = {
      userId,
      storeId,
      shopifyDomain,
      apiKey,
      syncType: 'full'
    };
    
    const params = {
      FunctionName: functionName,
      InvocationType: 'Event', // Async invocation
      Payload: JSON.stringify(payload)
    };
    
    await lambda.invoke(params).promise();
    console.log(`Triggered Shopify sync for store ${storeId}`);
  } catch (error) {
    console.error('Failed to trigger Shopify sync:', error);
    // Don't fail the store creation if sync trigger fails
  }
};

// Create or update store
const createStore = async (userId, storeData) => {
  const tableName = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-stores`;
  const timestamp = Date.now();
  const storeId = storeData.id || `store_${crypto.randomBytes(8).toString('hex')}`;
  
  const item = {
    userId,
    id: storeId,
    name: storeData.name,
    type: storeData.type,
    address: storeData.address,
    city: storeData.city,
    state: storeData.state,
    zipCode: storeData.zipCode,
    country: storeData.country || 'United States',
    website: storeData.website,
    shopifyDomain: storeData.shopifyDomain,
    apiKey: storeData.apiKey,
    status: storeData.status || 'active',
    createdAt: storeData.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastSync: null,
    syncStatus: 'pending',
    syncMetadata: {},
    totalProducts: 0,
    totalOrders: 0
  };
  
  await dynamodb.put({
    TableName: tableName,
    Item: item
  }).promise();
  
  // If it's a Shopify store with credentials, trigger sync
  if (item.type === 'shopify' && item.shopifyDomain) {
    await triggerShopifySync(userId, storeId, item.shopifyDomain, item.apiKey);
  }
  
  return item;
};

// Get stores for user
const getStores = async (userId) => {
  const tableName = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-stores`;
  
  const result = await dynamodb.query({
    TableName: tableName,
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: {
      ':userId': userId
    }
  }).promise();
  
  return result.Items || [];
};

// Update store
const updateStore = async (userId, storeId, updates) => {
  const tableName = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-stores`;
  
  // Build update expression
  const updateExpressions = [];
  const expressionValues = {};
  const expressionNames = {};
  
  Object.keys(updates).forEach(key => {
    if (key !== 'userId' && key !== 'id') {
      updateExpressions.push(`#${key} = :${key}`);
      expressionValues[`:${key}`] = updates[key];
      expressionNames[`#${key}`] = key;
    }
  });
  
  // Add updatedAt timestamp
  updateExpressions.push('#updatedAt = :updatedAt');
  expressionValues[':updatedAt'] = new Date().toISOString();
  expressionNames['#updatedAt'] = 'updatedAt';
  
  const result = await dynamodb.update({
    TableName: tableName,
    Key: { userId, id: storeId },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeValues: expressionValues,
    ExpressionAttributeNames: expressionNames,
    ReturnValues: 'ALL_NEW'
  }).promise();
  
  // If Shopify credentials were updated, trigger a new sync
  if (updates.shopifyDomain || updates.apiKey) {
    const store = result.Attributes;
    if (store.type === 'shopify' && store.shopifyDomain) {
      await triggerShopifySync(userId, storeId, store.shopifyDomain, store.apiKey);
    }
  }
  
  return result.Attributes;
};

// Delete store
const deleteStore = async (userId, storeId) => {
  const tableName = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-stores`;
  
  await dynamodb.delete({
    TableName: tableName,
    Key: { userId, id: storeId }
  }).promise();
  
  // TODO: Also delete associated data (products, sales, inventory)
  
  return { success: true };
};

// Main handler
exports.handler = async (event) => {
  console.log('Store Management Lambda triggered:', JSON.stringify(event));
  
  try {
    const method = event.httpMethod;
    const path = event.path;
    
    // Extract userId from event (would normally come from auth)
    const userId = event.headers?.userId || 
                   event.requestContext?.authorizer?.userId || 
                   (event.body ? JSON.parse(event.body).userId : null) ||
                   'test-user';
    
    if (!userId) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }
    
    let response;
    
    switch (method) {
      case 'GET':
        // Get all stores for user
        const stores = await getStores(userId);
        response = {
          statusCode: 200,
          body: JSON.stringify({ stores })
        };
        break;
        
      case 'POST':
        // Create new store
        const storeData = JSON.parse(event.body);
        const newStore = await createStore(userId, storeData);
        response = {
          statusCode: 201,
          body: JSON.stringify({ store: newStore })
        };
        break;
        
      case 'PUT':
        // Update existing store
        const updateData = JSON.parse(event.body);
        const storeId = event.pathParameters?.storeId || updateData.id;
        if (!storeId) {
          response = {
            statusCode: 400,
            body: JSON.stringify({ error: 'Store ID required' })
          };
        } else {
          const updatedStore = await updateStore(userId, storeId, updateData);
          response = {
            statusCode: 200,
            body: JSON.stringify({ store: updatedStore })
          };
        }
        break;
        
      case 'DELETE':
        // Delete store
        const deleteStoreId = event.pathParameters?.storeId;
        if (!deleteStoreId) {
          response = {
            statusCode: 400,
            body: JSON.stringify({ error: 'Store ID required' })
          };
        } else {
          await deleteStore(userId, deleteStoreId);
          response = {
            statusCode: 200,
            body: JSON.stringify({ message: 'Store deleted successfully' })
          };
        }
        break;
        
      default:
        response = {
          statusCode: 405,
          body: JSON.stringify({ error: 'Method not allowed' })
        };
    }
    
    return {
      ...response,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
      }
    };
    
  } catch (error) {
    console.error('Error in store management:', error);
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