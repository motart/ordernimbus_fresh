const axios = require('axios');

const userId = 'e85183d0-3061-70b8-25f5-171fd848ac9d';

const sampleNotifications = [
  {
    type: 'out_of_stock',
    priority: 'high',
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
    type: 'low_stock',
    priority: 'medium',
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
    type: 'large_order',
    priority: 'high',
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
    type: 'sync_complete',
    priority: 'low',
    title: 'Shopify Sync Complete',
    message: 'Successfully synced 45 products and 120 orders',
    metadata: {
      storeId: 'shopify-store-456',
      productsCount: 45,
      ordersCount: 120
    }
  },
  {
    type: 'reorder_point',
    priority: 'medium',
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
  }
];

async function createNotifications() {
  console.log('Creating sample notifications via API...');
  
  for (const notification of sampleNotifications) {
    try {
      const response = await axios.post('http://127.0.0.1:3001/api/notifications', notification, {
        headers: {
          'Content-Type': 'application/json',
          'userId': userId
        }
      });
      
      if (response.status === 201 || response.status === 200) {
        console.log(`✓ Created notification: ${notification.title}`);
      } else {
        console.error(`✗ Failed to create notification: ${response.status}`);
      }
    } catch (error) {
      console.error('Error creating notification:', error);
    }
  }
  
  console.log('Sample notifications created!');
}

createNotifications().catch(console.error);