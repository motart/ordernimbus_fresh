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
const dynamoDbService = new AWS.DynamoDB(dynamoConfig);

// Notification types
const NOTIFICATION_TYPES = {
  LOW_STOCK: 'low_stock',
  OUT_OF_STOCK: 'out_of_stock',
  NEW_ORDER: 'new_order',
  LARGE_ORDER: 'large_order',
  SYNC_COMPLETE: 'sync_complete',
  SYNC_FAILED: 'sync_failed',
  SALES_GOAL_MET: 'sales_goal_met',
  REORDER_POINT: 'reorder_point',
  FORECAST_ALERT: 'forecast_alert'
};

// Priority levels
const PRIORITY_LEVELS = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
};

// Ensure notifications table exists
const ensureNotificationsTable = async () => {
  const notificationsTable = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-notifications`;
  
  try {
    await dynamoDbService.describeTable({ TableName: notificationsTable }).promise();
  } catch (error) {
    if (error.code === 'ResourceNotFoundException') {
      console.log('Creating notifications table...');
      
      await dynamoDbService.createTable({
        TableName: notificationsTable,
        KeySchema: [
          { AttributeName: 'userId', KeyType: 'HASH' },
          { AttributeName: 'id', KeyType: 'RANGE' }
        ],
        AttributeDefinitions: [
          { AttributeName: 'userId', AttributeType: 'S' },
          { AttributeName: 'id', AttributeType: 'S' }
        ],
        BillingMode: 'PAY_PER_REQUEST'
      }).promise();
      
      // Wait for table to be active
      await new Promise(resolve => setTimeout(resolve, 3000));
      console.log('Notifications table created successfully');
    }
  }
};

// Create a notification
const createNotification = async (userId, notification) => {
  const notificationsTable = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-notifications`;
  const timestamp = Date.now();
  
  // Ensure table exists
  await ensureNotificationsTable();
  
  const item = {
    userId,
    id: `notif_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
    type: notification.type,
    priority: notification.priority || PRIORITY_LEVELS.MEDIUM,
    title: notification.title,
    message: notification.message,
    metadata: notification.metadata || {},
    read: false,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
  };
  
  await dynamodb.put({
    TableName: notificationsTable,
    Item: item
  }).promise();
  
  return item;
};

// Get notifications for a user
const getNotifications = async (userId, limit = 50, unreadOnly = false) => {
  const notificationsTable = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-notifications`;
  
  // Ensure table exists
  await ensureNotificationsTable();
  
  const params = {
    TableName: notificationsTable,
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: {
      ':userId': userId
    },
    ScanIndexForward: false, // Most recent first
    Limit: limit
  };
  
  if (unreadOnly) {
    params.FilterExpression = '#read = :read';
    params.ExpressionAttributeNames = { '#read': 'read' };
    params.ExpressionAttributeValues[':read'] = false;
  }
  
  const result = await dynamodb.query(params).promise();
  return result.Items || [];
};

// Mark notification as read
const markAsRead = async (userId, notificationId) => {
  const notificationsTable = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-notifications`;
  
  await dynamodb.update({
    TableName: notificationsTable,
    Key: { userId, id: notificationId },
    UpdateExpression: 'SET #read = :read, readAt = :readAt',
    ExpressionAttributeNames: { '#read': 'read' },
    ExpressionAttributeValues: {
      ':read': true,
      ':readAt': new Date().toISOString()
    }
  }).promise();
};

// Mark all as read
const markAllAsRead = async (userId) => {
  const notifications = await getNotifications(userId, 100, true);
  
  const promises = notifications.map(notif => 
    markAsRead(userId, notif.id)
  );
  
  await Promise.all(promises);
  return notifications.length;
};

// Check inventory levels and create notifications
const checkInventoryAlerts = async (userId, storeId, products) => {
  const notifications = [];
  
  for (const product of products) {
    const quantity = product.inventory_quantity || 0;
    const threshold = product.reorder_point || 10;
    
    if (quantity === 0) {
      notifications.push({
        type: NOTIFICATION_TYPES.OUT_OF_STOCK,
        priority: PRIORITY_LEVELS.HIGH,
        title: 'Out of Stock Alert',
        message: `${product.title} is now out of stock`,
        metadata: {
          storeId,
          productId: product.id,
          productTitle: product.title,
          sku: product.sku
        }
      });
    } else if (quantity <= threshold) {
      notifications.push({
        type: NOTIFICATION_TYPES.LOW_STOCK,
        priority: PRIORITY_LEVELS.MEDIUM,
        title: 'Low Stock Warning',
        message: `${product.title} has only ${quantity} units left`,
        metadata: {
          storeId,
          productId: product.id,
          productTitle: product.title,
          currentStock: quantity,
          threshold: threshold,
          sku: product.sku
        }
      });
    }
  }
  
  return notifications;
};

// Check for large orders
const checkOrderAlerts = async (userId, storeId, order) => {
  const notifications = [];
  const orderTotal = parseFloat(order.total_price || 0);
  
  // Large order threshold (configurable per store)
  const largeOrderThreshold = 500;
  
  if (orderTotal >= largeOrderThreshold) {
    notifications.push({
      type: NOTIFICATION_TYPES.LARGE_ORDER,
      priority: PRIORITY_LEVELS.HIGH,
      title: 'Large Order Received!',
      message: `New order ${order.name} for ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(orderTotal)}`,
      metadata: {
        storeId,
        orderId: order.id,
        orderName: order.name,
        total: orderTotal,
        customerEmail: order.email
      }
    });
  }
  
  return notifications;
};

// Main handler
exports.handler = async (event) => {
  console.log('Notification Handler triggered:', JSON.stringify(event));
  
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
    const userId = event.requestContext?.authorizer?.userId || event.headers?.userId || event.headers?.Userid || event.headers?.userid;
    
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
    
    // GET /notifications - Get user notifications
    if (path.includes('/notifications') && method === 'GET') {
      const queryParams = event.queryStringParameters || {};
      const limit = parseInt(queryParams.limit) || 50;
      const unreadOnly = queryParams.unreadOnly === 'true';
      
      const notifications = await getNotifications(userId, limit, unreadOnly);
      const unreadCount = notifications.filter(n => !n.read).length;
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          notifications,
          unreadCount,
          total: notifications.length
        })
      };
    }
    
    // POST /notifications - Create notification (internal use)
    if (path.includes('/notifications') && method === 'POST') {
      const body = JSON.parse(event.body);
      const notification = await createNotification(userId, body);
      
      return {
        statusCode: 201,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ notification })
      };
    }
    
    // PUT /notifications/:id/read - Mark as read
    if (path.match(/\/notifications\/[^\/]+\/read/) && method === 'PUT') {
      const notificationId = path.split('/')[2];
      await markAsRead(userId, notificationId);
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ success: true })
      };
    }
    
    // PUT /notifications/read-all - Mark all as read
    if (path.includes('/notifications/read-all') && method === 'PUT') {
      const count = await markAllAsRead(userId);
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          success: true,
          markedAsRead: count
        })
      };
    }
    
    // POST /notifications/check-inventory - Check inventory alerts
    if (path.includes('/notifications/check-inventory') && method === 'POST') {
      const body = JSON.parse(event.body);
      const { storeId, products } = body;
      
      const alerts = await checkInventoryAlerts(userId, storeId, products);
      const promises = alerts.map(alert => createNotification(userId, alert));
      const created = await Promise.all(promises);
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          alertsCreated: created.length,
          alerts: created
        })
      };
    }
    
    // POST /notifications/check-order - Check order alerts
    if (path.includes('/notifications/check-order') && method === 'POST') {
      const body = JSON.parse(event.body);
      const { storeId, order } = body;
      
      const alerts = await checkOrderAlerts(userId, storeId, order);
      const promises = alerts.map(alert => createNotification(userId, alert));
      const created = await Promise.all(promises);
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          alertsCreated: created.length,
          alerts: created
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
    console.error('Error in notification handler:', error);
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

// Export notification types and functions for use in other lambdas
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
module.exports.PRIORITY_LEVELS = PRIORITY_LEVELS;
module.exports.createNotification = createNotification;