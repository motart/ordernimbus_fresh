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

// Get customers for a specific store
const getCustomersForStore = async (userId, storeId) => {
  try {
    const customersTable = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-customers`;
    
    console.log(`Getting customers for store: ${storeId}`);
    console.log(`Using table: ${customersTable}`);
    console.log(`DynamoDB endpoint: ${dynamoConfig.endpoint || 'AWS'}`);
    
    // Get customers data
    const customersResult = await dynamodb.scan({
      TableName: customersTable,
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
    
    console.log(`Found ${customersResult.Items?.length || 0} customers`);
    return customersResult.Items || [];
    
  } catch (error) {
    console.error('Error getting customers:', error);
    throw error;
  }
};

// Get all customers across all user stores
const getAllCustomersForUser = async (userId) => {
  try {
    const storesTable = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-stores`;
    const customersTable = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-customers`;
    
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
    
    // Get customers for each store
    const allCustomers = [];
    for (const store of storesResult.Items) {
      const storeCustomers = await getCustomersForStore(userId, store.id);
      allCustomers.push(...storeCustomers);
    }
    
    return allCustomers;
    
  } catch (error) {
    console.error('Error getting all customers:', error);
    throw error;
  }
};

// Create a new customer
const createCustomer = async (userId, customerData) => {
  try {
    const customersTable = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-customers`;
    const timestamp = new Date().toISOString();
    
    const customer = {
      userId,
      customerId: customerData.id || `customer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      storeId: customerData.storeId,
      email: customerData.email,
      first_name: customerData.first_name,
      last_name: customerData.last_name,
      phone: customerData.phone,
      address: customerData.address,
      city: customerData.city,
      state: customerData.state,
      zip: customerData.zip,
      country: customerData.country || 'United States',
      tags: customerData.tags,
      notes: customerData.notes,
      created_at: timestamp,
      updated_at: timestamp,
      manual_entry: true
    };
    
    await dynamodb.put({
      TableName: customersTable,
      Item: customer
    }).promise();
    
    return customer;
    
  } catch (error) {
    console.error('Error creating customer:', error);
    throw error;
  }
};

// Update a customer
const updateCustomer = async (userId, customerId, updates) => {
  try {
    const customersTable = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-customers`;
    
    // Build update expression
    const updateExpressions = [];
    const expressionValues = {};
    const expressionNames = {};
    
    Object.keys(updates).forEach(key => {
      if (key !== 'userId' && key !== 'customerId') {
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
      TableName: customersTable,
      Key: { userId, customerId },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeValues: expressionValues,
      ExpressionAttributeNames: expressionNames,
      ReturnValues: 'ALL_NEW'
    }).promise();
    
    return result.Attributes;
    
  } catch (error) {
    console.error('Error updating customer:', error);
    throw error;
  }
};

// Delete a customer
const deleteCustomer = async (userId, customerId) => {
  try {
    const customersTable = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-customers`;
    
    await dynamodb.delete({
      TableName: customersTable,
      Key: { userId, customerId }
    }).promise();
    
    return { success: true };
    
  } catch (error) {
    console.error('Error deleting customer:', error);
    throw error;
  }
};

// Main handler
exports.handler = async (event) => {
  console.log('Customer Management Lambda triggered:', JSON.stringify(event));
  
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
        
        let customers;
        if (storeId) {
          // Get customers for specific store
          customers = await getCustomersForStore(userId, storeId);
        } else {
          // Get customers for all user stores
          customers = await getAllCustomersForUser(userId);
        }
        
        response = {
          statusCode: 200,
          body: JSON.stringify({
            customers,
            count: customers.length
          })
        };
        break;
        
      case 'POST':
        const customerData = JSON.parse(event.body);
        const newCustomer = await createCustomer(userId, customerData);
        response = {
          statusCode: 201,
          body: JSON.stringify({
            customer: newCustomer
          })
        };
        break;
        
      case 'PUT':
        const updateData = JSON.parse(event.body);
        const customerId = event.pathParameters?.customerId || updateData.customerId;
        if (!customerId) {
          response = {
            statusCode: 400,
            body: JSON.stringify({ error: 'Customer ID required' })
          };
        } else {
          const updatedCustomer = await updateCustomer(userId, customerId, updateData);
          response = {
            statusCode: 200,
            body: JSON.stringify({ customer: updatedCustomer })
          };
        }
        break;
        
      case 'DELETE':
        const deleteCustomerId = event.pathParameters?.customerId;
        if (!deleteCustomerId) {
          response = {
            statusCode: 400,
            body: JSON.stringify({ error: 'Customer ID required' })
          };
        } else {
          await deleteCustomer(userId, deleteCustomerId);
          response = {
            statusCode: 200,
            body: JSON.stringify({ message: 'Customer deleted successfully' })
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
    console.error('Error in customer management:', error);
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