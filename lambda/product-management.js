const AWS = require('aws-sdk');

// Initialize AWS services
const dynamoConfig = {
  region: process.env.AWS_REGION || 'us-west-1'
};

// Only set endpoint for local development
if (process.env.DYNAMODB_ENDPOINT) {
  dynamoConfig.endpoint = process.env.DYNAMODB_ENDPOINT;
}

const dynamodb = new AWS.DynamoDB.DocumentClient(dynamoConfig);

// Get products for a specific store
const getProductsForStore = async (userId, storeId) => {
  try {
    const productsTable = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-products`;
    
    console.log(`Getting products for store: ${storeId}`);
    console.log(`Using table: ${productsTable}`);
    console.log(`DynamoDB endpoint: ${dynamoConfig.endpoint || 'AWS'}`);
    
    // Get products data
    const productsResult = await dynamodb.scan({
      TableName: productsTable,
      FilterExpression: '#storeId = :storeId AND #userId = :userId',
      ExpressionAttributeNames: {
        '#storeId': 'storeId',
        '#userId': 'userId'
      },
      ExpressionAttributeValues: {
        ':storeId': storeId,
        ':userId': userId
      }
    }).promise();
    
    console.log(`Found ${productsResult.Items?.length || 0} products`);
    return productsResult.Items || [];
    
  } catch (error) {
    console.error('Error getting products:', error);
    throw error;
  }
};

// Get all products across all user stores
const getAllProductsForUser = async (userId) => {
  try {
    const storesTable = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-stores`;
    const productsTable = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-products`;
    
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
    
    // Get products for each store
    const allProducts = [];
    for (const store of storesResult.Items) {
      const storeProducts = await getProductsForStore(userId, store.id);
      allProducts.push(...storeProducts);
    }
    
    return allProducts;
    
  } catch (error) {
    console.error('Error getting all products:', error);
    throw error;
  }
};

// Create a new product
const createProduct = async (userId, productData) => {
  try {
    const productsTable = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-products`;
    const timestamp = new Date().toISOString();
    
    const product = {
      userId,
      id: productData.id || `product_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      storeId: productData.storeId,
      title: productData.title,
      vendor: productData.vendor,
      productType: productData.productType,
      price: productData.price,
      sku: productData.sku,
      inventory_quantity: productData.inventory_quantity || 0,
      description: productData.description,
      tags: productData.tags,
      weight: productData.weight,
      compare_at_price: productData.compare_at_price,
      created_at: timestamp,
      updated_at: timestamp,
      manual_entry: true
    };
    
    await dynamodb.put({
      TableName: productsTable,
      Item: product
    }).promise();
    
    return product;
    
  } catch (error) {
    console.error('Error creating product:', error);
    throw error;
  }
};

// Update a product
const updateProduct = async (userId, productId, updates) => {
  try {
    const productsTable = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-products`;
    
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
    updateExpressions.push('#updated_at = :updated_at');
    expressionValues[':updated_at'] = new Date().toISOString();
    expressionNames['#updated_at'] = 'updated_at';
    
    const result = await dynamodb.update({
      TableName: productsTable,
      Key: { userId, id: productId },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeValues: expressionValues,
      ExpressionAttributeNames: expressionNames,
      ReturnValues: 'ALL_NEW'
    }).promise();
    
    return result.Attributes;
    
  } catch (error) {
    console.error('Error updating product:', error);
    throw error;
  }
};

// Delete a product
const deleteProduct = async (userId, productId) => {
  try {
    const productsTable = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-products`;
    
    await dynamodb.delete({
      TableName: productsTable,
      Key: { userId, id: productId }
    }).promise();
    
    return { success: true };
    
  } catch (error) {
    console.error('Error deleting product:', error);
    throw error;
  }
};

// Main handler
exports.handler = async (event) => {
  console.log('Product Management Lambda triggered:', JSON.stringify(event));
  
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
    const userId = event.headers?.userId || 
                   event.headers?.Userid ||
                   event.headers?.userid ||
                   event.requestContext?.authorizer?.userId || 
                   (event.body ? JSON.parse(event.body).userId : null);
    
    if (!userId) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,userId',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
        },
        body: JSON.stringify({
          error: 'User authentication required'
        })
      };
    }
    
    let response;
    
    switch (method) {
      case 'GET':
        const queryParams = event.queryStringParameters || {};
        const storeId = queryParams.storeId;
        
        let products;
        if (storeId) {
          // Get products for specific store
          products = await getProductsForStore(userId, storeId);
        } else {
          // Get products for all user stores
          products = await getAllProductsForUser(userId);
        }
        
        response = {
          statusCode: 200,
          body: JSON.stringify({
            products,
            count: products.length
          })
        };
        break;
        
      case 'POST':
        const productData = JSON.parse(event.body);
        const newProduct = await createProduct(userId, productData);
        response = {
          statusCode: 201,
          body: JSON.stringify({
            product: newProduct
          })
        };
        break;
        
      case 'PUT':
        const updateData = JSON.parse(event.body);
        const productId = event.pathParameters?.productId || updateData.id;
        if (!productId) {
          response = {
            statusCode: 400,
            body: JSON.stringify({ error: 'Product ID required' })
          };
        } else {
          const updatedProduct = await updateProduct(userId, productId, updateData);
          response = {
            statusCode: 200,
            body: JSON.stringify({ product: updatedProduct })
          };
        }
        break;
        
      case 'DELETE':
        const deleteProductId = event.pathParameters?.productId;
        if (!deleteProductId) {
          response = {
            statusCode: 400,
            body: JSON.stringify({ error: 'Product ID required' })
          };
        } else {
          await deleteProduct(userId, deleteProductId);
          response = {
            statusCode: 200,
            body: JSON.stringify({ message: 'Product deleted successfully' })
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
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,userId',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
      }
    };
    
  } catch (error) {
    console.error('Error in product management:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,userId',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};