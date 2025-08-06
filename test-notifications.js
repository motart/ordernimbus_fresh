const AWS = require('aws-sdk');

// Configure DynamoDB
const dynamodb = new AWS.DynamoDB.DocumentClient({
  endpoint: 'http://localhost:8000',
  region: 'us-east-1'
});

const notificationTypes = {
  LOW_STOCK: 'low_stock',
  OUT_OF_STOCK: 'out_of_stock',
  NEW_ORDER: 'new_order',
  LARGE_ORDER: 'large_order',
  SYNC_COMPLETE: 'sync_complete',
  REORDER_POINT: 'reorder_point'
};

const priorities = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
};

const sampleNotifications = [
  {
    type: notificationTypes.OUT_OF_STOCK,
    priority: priorities.HIGH,
    title: 'Out of Stock Alert',
    message: 'Classic White T-Shirt is now out of stock',
    metadata: {
      storeId: 'store-123',
      productId: 'prod-1',
      productTitle: 'Classic White T-Shirt',
      sku: 'WT-001'
    }
  },
  {
    type: notificationTypes.LOW_STOCK,
    priority: priorities.MEDIUM,
    title: 'Low Stock Warning',
    message: 'Blue Denim Jeans has only 5 units left',
    metadata: {
      storeId: 'store-123',
      productId: 'prod-2',
      productTitle: 'Blue Denim Jeans',
      currentStock: 5,
      threshold: 10,
      sku: 'BDJ-002'
    }
  },
  {
    type: notificationTypes.LARGE_ORDER,
    priority: priorities.HIGH,
    title: 'Large Order Received!',
    message: 'New order #ORD-2024-1005 for $445.99',
    metadata: {
      storeId: 'store-123',
      orderId: '1005',
      orderName: '#ORD-2024-1005',
      total: 445.99,
      customerEmail: 'james.brown@email.com'
    }
  },
  {
    type: notificationTypes.SYNC_COMPLETE,
    priority: priorities.LOW,
    title: 'Shopify Sync Complete',
    message: 'Successfully synced 45 products and 120 orders',
    metadata: {
      storeId: 'shopify-store-456',
      productsCount: 45,
      ordersCount: 120
    }
  },
  {
    type: notificationTypes.REORDER_POINT,
    priority: priorities.MEDIUM,
    title: 'Reorder Point Reached',
    message: 'Running Shoes inventory (8 units) has reached reorder point',
    metadata: {
      storeId: 'store-123',
      productId: 'prod-3',
      productTitle: 'Running Shoes',
      currentStock: 8,
      reorderPoint: 10,
      sku: 'RS-003'
    }
  },
  {
    type: notificationTypes.NEW_ORDER,
    priority: priorities.LOW,
    title: 'New Order Received',
    message: 'Order #ORD-2024-1025 from Michael Wright',
    metadata: {
      storeId: 'store-123',
      orderId: '1025',
      orderName: '#ORD-2024-1025',
      customerName: 'Michael Wright',
      total: 234.50
    }
  }
];

async function createNotifications() {
  const tableName = 'ordernimbus-local-notifications';
  const userId = 'e85183d0-3061-70b8-25f5-171fd848ac9d'; // Default test user
  
  // Create table if it doesn't exist
  try {
    await dynamodb.describeTable({ TableName: tableName }).promise();
    console.log('Notifications table already exists');
  } catch (error) {
    if (error.code === 'ResourceNotFoundException') {
      console.log('Creating notifications table...');
      const dynamoDbService = new AWS.DynamoDB({ endpoint: 'http://localhost:8000', region: 'us-east-1' });
      
      await dynamoDbService.createTable({
        TableName: tableName,
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
      
      console.log('Notifications table created successfully');
      // Wait for table to be active
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  // Create sample notifications
  console.log('Creating sample notifications...');
  
  for (let i = 0; i < sampleNotifications.length; i++) {
    const notification = sampleNotifications[i];
    const timestamp = Date.now() - (i * 3600000); // Space out by 1 hour
    
    const item = {
      userId,
      id: `notif_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
      type: notification.type,
      priority: notification.priority,
      title: notification.title,
      message: notification.message,
      metadata: notification.metadata,
      read: i > 2, // First 3 are unread
      createdAt: new Date(timestamp).toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };
    
    await dynamodb.put({
      TableName: tableName,
      Item: item
    }).promise();
    
    console.log(`Created notification: ${notification.title}`);
  }
  
  console.log('Sample notifications created successfully!');
}

createNotifications().catch(console.error);