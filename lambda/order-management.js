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

// Generate sample orders based on sales data and products
const generateSampleOrdersFromSales = (salesData, products) => {
  const orders = [];
  const today = new Date();
  
  // Create sample orders based on the product sales in the aggregated data
  Object.entries(salesData.productSales || {}).forEach(([productId, salesInfo], index) => {
    const product = products.find(p => p.productId === productId);
    const quantity = salesInfo.quantity || 1;
    const revenue = salesInfo.revenue || 0;
    const price = quantity > 0 ? (revenue / quantity).toFixed(2) : '0.00';
    
    // Create multiple orders to match the quantity sold
    for (let i = 0; i < Math.min(quantity, 10); i++) { // Limit to 10 orders per product for performance
      const orderDate = new Date(today);
      orderDate.setDate(orderDate.getDate() - Math.floor(Math.random() * 30)); // Orders within last 30 days
      orderDate.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));
      
      const orderNumber = 1000 + orders.length + 1;
      const orderId = `${salesData.storeId}_order_${orderNumber}`;
      
      // Generate customer data
      const customerEmails = [
        'john.doe@example.com',
        'jane.smith@example.com',
        'mike.johnson@example.com',
        'sarah.wilson@example.com',
        'david.brown@example.com',
        'lisa.davis@example.com',
        'tom.miller@example.com',
        'amy.taylor@example.com'
      ];
      
      const customerNames = [
        'John Doe',
        'Jane Smith',
        'Mike Johnson',
        'Sarah Wilson',
        'David Brown',
        'Lisa Davis',
        'Tom Miller',
        'Amy Taylor'
      ];
      
      const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego'];
      const states = ['NY', 'CA', 'IL', 'TX', 'AZ', 'PA', 'TX', 'CA'];
      
      const customerIndex = Math.floor(Math.random() * customerEmails.length);
      const locationIndex = Math.floor(Math.random() * cities.length);
      
      const itemQuantity = Math.floor(Math.random() * 3) + 1; // 1-3 items per order
      const itemPrice = (parseFloat(price) / itemQuantity).toFixed(2);
      
      const order = {
        id: orderId,
        storeId: salesData.storeId,
        name: `#${orderNumber}`,
        email: customerEmails[customerIndex],
        phone: `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
        total_price: (parseFloat(itemPrice) * itemQuantity).toFixed(2),
        currency: 'USD',
        financial_status: Math.random() > 0.2 ? 'paid' : (Math.random() > 0.5 ? 'pending' : 'cancelled'),
        fulfillment_status: Math.random() > 0.3 ? 'fulfilled' : (Math.random() > 0.5 ? 'partial' : null),
        created_at: orderDate.toISOString(),
        updated_at: orderDate.toISOString(),
        tags: '',
        note: '',
        line_items: [
          {
            id: `${orderId}_item_${productId}`,
            product_id: productId,
            title: product?.title || 'Unknown Product',
            quantity: itemQuantity,
            price: itemPrice,
            variant_title: product?.variants?.[0]?.title || 'Default Title',
            sku: product?.variants?.[0]?.sku || ''
          }
        ],
        shipping_address: {
          first_name: customerNames[customerIndex].split(' ')[0],
          last_name: customerNames[customerIndex].split(' ')[1],
          company: Math.random() > 0.7 ? 'Acme Corp' : '',
          address1: `${Math.floor(Math.random() * 9999) + 1} Main St`,
          city: cities[locationIndex],
          province: states[locationIndex],
          country: 'United States',
          zip: `${Math.floor(Math.random() * 90000) + 10000}`
        },
        billing_address: {
          first_name: customerNames[customerIndex].split(' ')[0],
          last_name: customerNames[customerIndex].split(' ')[1],
          company: Math.random() > 0.7 ? 'Acme Corp' : '',
          address1: `${Math.floor(Math.random() * 9999) + 1} Main St`,
          city: cities[locationIndex],
          province: states[locationIndex],
          country: 'United States',
          zip: `${Math.floor(Math.random() * 90000) + 10000}`
        },
        sample_data: true
      };
      
      orders.push(order);
    }
  });
  
  // Sort orders by creation date (newest first)
  orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  
  return orders;
};

// Get orders for a specific store
const getOrdersForStore = async (userId, storeId) => {
  try {
    const ordersTable = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-orders`;
    const salesTable = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-sales`;
    const productsTable = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-products`;
    
    console.log(`Getting orders for store: ${storeId}`);
    console.log(`Using tables: ${ordersTable}, ${salesTable}, ${productsTable}`);
    console.log(`DynamoDB endpoint: ${dynamoConfig.endpoint || 'AWS'}`);
    
    // Try to get real orders first (if orders table exists and has data)
    let orders = [];
    try {
      const ordersResult = await dynamodb.scan({
        TableName: ordersTable,
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
      
      orders = ordersResult.Items || [];
      console.log(`Found ${orders.length} real orders`);
    } catch (ordersError) {
      console.log('Orders table not available or empty, generating from sales data');
    }
    
    // If no real orders found, generate sample orders from sales data
    if (orders.length === 0) {
      try {
        // Get sales data
        const salesResult = await dynamodb.scan({
          TableName: salesTable,
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
        
        console.log(`Found ${salesResult.Items?.length || 0} sales records`);
        console.log(`Found ${productsResult.Items?.length || 0} products`);
        
        if (salesResult.Items && salesResult.Items.length > 0) {
          // Generate orders from the most recent sales data
          const latestSalesData = salesResult.Items[0]; // Assuming most recent is first
          orders = generateSampleOrdersFromSales(latestSalesData, productsResult.Items || []);
          console.log(`Generated ${orders.length} sample orders from sales data`);
        }
      } catch (salesError) {
        console.error('Error generating orders from sales data:', salesError);
      }
    }
    
    return orders;
    
  } catch (error) {
    console.error('Error getting orders:', error);
    throw error;
  }
};

// Get all orders across all user stores
const getAllOrdersForUser = async (userId) => {
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
    
    // Get orders for each store
    const allOrders = [];
    for (const store of storesResult.Items) {
      const storeOrders = await getOrdersForStore(userId, store.id);
      allOrders.push(...storeOrders);
    }
    
    // Sort by creation date (newest first)
    allOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    return allOrders;
    
  } catch (error) {
    console.error('Error getting all orders:', error);
    throw error;
  }
};

// Store individual order (for future real order storage)
const storeOrder = async (userId, storeId, orderData) => {
  const ordersTable = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-orders`;
  const timestamp = Date.now();
  
  const item = {
    userId,
    id: orderData.id,
    storeId,
    ...orderData,
    syncedAt: timestamp,
    updatedAt: new Date().toISOString()
  };
  
  try {
    await dynamodb.put({
      TableName: ordersTable,
      Item: item
    }).promise();
    
    console.log(`Stored order ${orderData.id} for store ${storeId}`);
    return item;
  } catch (error) {
    console.error('Error storing order:', error);
    throw error;
  }
};

// Process CSV upload and convert to Shopify order format
const processCSVUpload = async (userId, storeId, csvData, columnMappings) => {
  const ordersTable = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-orders`;
  const timestamp = Date.now();
  
  console.log(`Processing CSV upload for store ${storeId} with ${csvData.length} rows`);
  console.log('Column mappings:', columnMappings);
  
  const processedOrders = [];
  const errors = [];
  
  // Create DynamoDB table if it doesn't exist (in production, this would be pre-created)
  try {
    await dynamodb.describeTable({ TableName: ordersTable }).promise();
  } catch (error) {
    if (error.code === 'ResourceNotFoundException') {
      console.log('Orders table does not exist, creating it...');
      try {
        await dynamodb.createTable({
          TableName: ordersTable,
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
        await new Promise(resolve => setTimeout(resolve, 5000));
        console.log('Orders table created successfully');
      } catch (createError) {
        console.error('Error creating orders table:', createError);
      }
    }
  }
  
  for (let i = 0; i < csvData.length; i++) {
    const row = csvData[i];
    
    try {
      // Map CSV row to Shopify order format
      const order = mapCSVRowToOrder(row, columnMappings, storeId, i + 1);
      
      // Store the order
      const storedOrder = await storeOrder(userId, storeId, order);
      processedOrders.push(storedOrder);
      
    } catch (error) {
      console.error(`Error processing row ${i + 1}:`, error);
      errors.push({
        row: i + 1,
        error: error.message,
        data: row
      });
    }
  }
  
  console.log(`Successfully processed ${processedOrders.length} orders, ${errors.length} errors`);
  
  return {
    ordersCreated: processedOrders.length,
    errors: errors,
    orders: processedOrders
  };
};

// Map CSV row to Shopify order format
const mapCSVRowToOrder = (row, columnMappings, storeId, rowNumber) => {
  const now = new Date().toISOString();
  
  // Helper function to get value from CSV row using column mapping
  const getValue = (shopifyField, defaultValue = '') => {
    const csvColumn = Object.keys(columnMappings).find(col => columnMappings[col] === shopifyField);
    return csvColumn ? (row[csvColumn] || defaultValue) : defaultValue;
  };
  
  // Generate order ID if not provided
  let orderId = getValue('id');
  if (!orderId) {
    orderId = getValue('name');
    if (!orderId) {
      orderId = `${storeId}_csv_order_${Date.now()}_${rowNumber}`;
    }
  }
  
  // Ensure order ID is unique and clean
  orderId = orderId.toString().replace(/[^a-zA-Z0-9_-]/g, '_');
  
  // Parse price
  const totalPriceStr = getValue('total_price', '0');
  const totalPrice = parseFloat(totalPriceStr.replace(/[^0-9.-]/g, '')) || 0;
  
  // Parse dates
  const createdAt = getValue('created_at') || now;
  const updatedAt = getValue('updated_at') || createdAt;
  
  // Build the order object
  const order = {
    id: orderId,
    storeId: storeId,
    name: getValue('name') || `#${rowNumber}`,
    email: getValue('email'),
    phone: getValue('phone'),
    total_price: totalPrice.toFixed(2),
    currency: getValue('currency') || 'USD',
    financial_status: getValue('financial_status') || 'paid',
    fulfillment_status: getValue('fulfillment_status') || null,
    created_at: new Date(createdAt).toISOString(),
    updated_at: new Date(updatedAt).toISOString(),
    tags: getValue('tags'),
    note: getValue('note'),
    
    // Billing address
    billing_address: {
      first_name: getValue('billing_first_name'),
      last_name: getValue('billing_last_name'),
      company: getValue('billing_company'),
      address1: getValue('billing_address1'),
      city: getValue('billing_city'),
      province: getValue('billing_province'),
      country: getValue('billing_country') || 'United States',
      zip: getValue('billing_zip')
    },
    
    // Shipping address (default to billing if not provided)
    shipping_address: {
      first_name: getValue('shipping_first_name') || getValue('billing_first_name'),
      last_name: getValue('shipping_last_name') || getValue('billing_last_name'),
      company: getValue('shipping_company') || getValue('billing_company'),
      address1: getValue('shipping_address1') || getValue('billing_address1'),
      city: getValue('shipping_city') || getValue('billing_city'),
      province: getValue('shipping_province') || getValue('billing_province'),
      country: getValue('shipping_country') || getValue('billing_country') || 'United States',
      zip: getValue('shipping_zip') || getValue('billing_zip')
    },
    
    // Line items
    line_items: [],
    
    // Mark as CSV upload
    csv_upload: true,
    upload_timestamp: now
  };
  
  // Handle line items
  const lineItemName = getValue('lineitem_name');
  if (lineItemName) {
    const quantity = parseInt(getValue('lineitem_quantity', '1')) || 1;
    const price = parseFloat(getValue('lineitem_price', totalPrice.toString()).replace(/[^0-9.-]/g, '')) || totalPrice;
    
    order.line_items.push({
      id: `${orderId}_item_1`,
      product_id: `csv_product_${rowNumber}`,
      title: lineItemName,
      quantity: quantity,
      price: price.toFixed(2),
      variant_title: getValue('lineitem_variant_title') || 'Default Title',
      sku: getValue('lineitem_sku')
    });
  } else {
    // If no line items specified, create a generic one
    order.line_items.push({
      id: `${orderId}_item_1`,
      product_id: `csv_product_${rowNumber}`,
      title: 'CSV Import Item',
      quantity: 1,
      price: totalPrice.toFixed(2),
      variant_title: 'Default Title',
      sku: ''
    });
  }
  
  return order;
};

// Main handler
exports.handler = async (event) => {
  console.log('Order Management Lambda triggered:', JSON.stringify(event));
  
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
    
    if (path.includes('/orders') && method === 'GET') {
      const queryParams = event.queryStringParameters || {};
      const storeId = queryParams.storeId;
      
      let orders;
      if (storeId) {
        // Get orders for specific store
        orders = await getOrdersForStore(userId, storeId);
      } else {
        // Get orders for all user stores
        orders = await getAllOrdersForUser(userId);
      }
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          orders,
          count: orders.length
        })
      };
    }
    
    if (path.includes('/orders/upload-csv') && method === 'POST') {
      // Handle CSV upload
      const body = JSON.parse(event.body);
      const { storeId, csvData, columnMappings } = body;
      
      if (!storeId || !csvData || !columnMappings) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            error: 'Store ID, CSV data, and column mappings required'
          })
        };
      }
      
      const result = await processCSVUpload(userId, storeId, csvData, columnMappings);
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify(result)
      };
    }
    
    if (path.includes('/orders') && method === 'POST') {
      // Store new order
      const body = JSON.parse(event.body);
      const { storeId, orderData } = body;
      
      if (!storeId || !orderData) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            error: 'Store ID and order data required'
          })
        };
      }
      
      const storedOrder = await storeOrder(userId, storeId, orderData);
      
      return {
        statusCode: 201,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          order: storedOrder
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
    console.error('Error in order management:', error);
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