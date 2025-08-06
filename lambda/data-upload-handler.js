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

// Process different data types
const processDataUpload = async (userId, storeId, csvData, columnMappings, dataType) => {
  console.log(`Processing ${dataType} upload for store ${storeId} with ${csvData.length} rows`);
  
  const timestamp = Date.now();
  const results = {
    itemsCreated: 0,
    errors: []
  };
  
  switch (dataType) {
    case 'orders':
      // Forward to order management handler
      return processOrderUpload(userId, storeId, csvData, columnMappings);
      
    case 'products':
      return processProductUpload(userId, storeId, csvData, columnMappings);
      
    case 'inventory':
      return processInventoryUpload(userId, storeId, csvData, columnMappings);
      
    case 'customers':
      return processCustomerUpload(userId, storeId, csvData, columnMappings);
      
    default:
      throw new Error(`Unsupported data type: ${dataType}`);
  }
};

// Process product uploads
const processProductUpload = async (userId, storeId, csvData, columnMappings) => {
  const productsTable = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-products`;
  const timestamp = Date.now();
  
  const processedProducts = [];
  const errors = [];
  
  // Ensure table exists
  await ensureTableExists(productsTable, [
    { AttributeName: 'userId', KeyType: 'HASH' },
    { AttributeName: 'id', KeyType: 'RANGE' }
  ]);
  
  for (let i = 0; i < csvData.length; i++) {
    const row = csvData[i];
    
    try {
      const product = mapCSVRowToProduct(row, columnMappings, storeId, i + 1);
      
      // Store the product
      await dynamodb.put({
        TableName: productsTable,
        Item: {
          userId,
          id: product.id,  // Changed from productId to id
          storeId,
          ...product,
          uploadedAt: timestamp,
          updatedAt: new Date().toISOString()
        }
      }).promise();
      
      processedProducts.push(product);
      
    } catch (error) {
      console.error(`Error processing product row ${i + 1}:`, error);
      errors.push({
        row: i + 1,
        error: error.message,
        data: row
      });
    }
  }
  
  console.log(`Successfully processed ${processedProducts.length} products, ${errors.length} errors`);
  
  return {
    productsCreated: processedProducts.length,
    errors: errors,
    products: processedProducts
  };
};

// Process inventory uploads
const processInventoryUpload = async (userId, storeId, csvData, columnMappings) => {
  const inventoryTable = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-inventory`;
  const productsTable = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-products`;
  const timestamp = Date.now();
  
  const processedInventory = [];
  const processedProducts = [];
  const errors = [];
  
  // Ensure tables exist
  await ensureTableExists(inventoryTable, [
    { AttributeName: 'userId', KeyType: 'HASH' },
    { AttributeName: 'inventoryId', KeyType: 'RANGE' }
  ]);
  
  await ensureTableExists(productsTable, [
    { AttributeName: 'userId', KeyType: 'HASH' },
    { AttributeName: 'id', KeyType: 'RANGE' }
  ]);
  
  // Group inventory by SKU to create products
  const skuGroups = {};
  for (let i = 0; i < csvData.length; i++) {
    const row = csvData[i];
    const sku = getValue(row, columnMappings, 'sku') || `SKU_${i + 1}`;
    
    if (!skuGroups[sku]) {
      skuGroups[sku] = [];
    }
    skuGroups[sku].push({ row, index: i });
  }
  
  // Create products for each unique SKU
  for (const [sku, items] of Object.entries(skuGroups)) {
    const productId = `${storeId}_product_${sku}_${timestamp}`;
    const inventoryItemId = `${storeId}_inv_item_${sku}_${timestamp}`;
    
    // Create product record
    const product = {
      userId,
      id: productId,  // Changed from productId to id
      storeId,
      title: sku, // Use SKU as title for inventory uploads
      vendor: 'Inventory Import',
      productType: 'General',
      price: '0.00',
      sku: sku,
      inventory_quantity: 0, // Will be updated from inventory records
      variants: [{
        id: `${productId}_var_1`,
        title: 'Default',
        price: '0.00',
        sku: sku,
        inventory_item_id: inventoryItemId
      }],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      csv_upload: true
    };
    
    try {
      // Debug: log what we're trying to store
      console.log(`Storing product with userId: ${product.userId}, id: ${product.id}`);
      console.log('Product object:', JSON.stringify(product, null, 2));
      
      // Store the product
      await dynamodb.put({
        TableName: productsTable,
        Item: product
      }).promise();
      
      processedProducts.push(product);
      
      // Process inventory records for this SKU
      let totalQuantity = 0;
      for (const item of items) {
        const { row, index } = item;
        
        try {
          const inventory = mapCSVRowToInventory(row, columnMappings, storeId, index + 1);
          
          // Update inventory to link with product
          inventory.inventoryItemId = inventoryItemId;
          
          // Store the inventory
          await dynamodb.put({
            TableName: inventoryTable,
            Item: {
              userId,
              inventoryId: inventory.id,
              storeId,
              ...inventory,
              inventoryItemId: inventoryItemId, // Link to product variant
              uploadedAt: timestamp,
              updatedAt: new Date().toISOString()
            }
          }).promise();
          
          processedInventory.push(inventory);
          totalQuantity += inventory.available;
          
        } catch (error) {
          console.error(`Error processing inventory row ${index + 1}:`, error);
          errors.push({
            row: index + 1,
            error: error.message,
            data: row
          });
        }
      }
      
      // Update product with total inventory quantity
      product.inventory_quantity = totalQuantity;
      await dynamodb.update({
        TableName: productsTable,
        Key: {
          userId,
          id: productId  // Changed from productId to id
        },
        UpdateExpression: 'SET inventory_quantity = :qty',
        ExpressionAttributeValues: {
          ':qty': totalQuantity
        }
      }).promise();
      
    } catch (error) {
      console.error(`Error creating product for SKU ${sku}:`, error);
      errors.push({
        sku,
        error: error.message
      });
    }
  }
  
  console.log(`Successfully processed ${processedInventory.length} inventory items and ${processedProducts.length} products, ${errors.length} errors`);
  
  return {
    inventoryCreated: processedInventory.length,
    productsCreated: processedProducts.length,
    errors: errors,
    inventory: processedInventory,
    products: processedProducts
  };
};

// Process customer uploads
const processCustomerUpload = async (userId, storeId, csvData, columnMappings) => {
  const customersTable = `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-customers`;
  const timestamp = Date.now();
  
  const processedCustomers = [];
  const errors = [];
  
  // Ensure table exists
  await ensureTableExists(customersTable, [
    { AttributeName: 'userId', KeyType: 'HASH' },
    { AttributeName: 'customerId', KeyType: 'RANGE' }
  ]);
  
  for (let i = 0; i < csvData.length; i++) {
    const row = csvData[i];
    
    try {
      const customer = mapCSVRowToCustomer(row, columnMappings, storeId, i + 1);
      
      // Store the customer
      await dynamodb.put({
        TableName: customersTable,
        Item: {
          userId,
          customerId: customer.id,
          storeId,
          ...customer,
          uploadedAt: timestamp,
          updatedAt: new Date().toISOString()
        }
      }).promise();
      
      processedCustomers.push(customer);
      
    } catch (error) {
      console.error(`Error processing customer row ${i + 1}:`, error);
      errors.push({
        row: i + 1,
        error: error.message,
        data: row
      });
    }
  }
  
  console.log(`Successfully processed ${processedCustomers.length} customers, ${errors.length} errors`);
  
  return {
    customersCreated: processedCustomers.length,
    errors: errors,
    customers: processedCustomers
  };
};

// Process order uploads (forward to existing order management)
const processOrderUpload = async (userId, storeId, csvData, columnMappings) => {
  // Import the existing order upload functionality
  const orderManagement = require('./order-management');
  
  // Create a mock event for the order management handler
  const mockEvent = {
    httpMethod: 'POST',
    path: '/api/orders/upload-csv',
    body: JSON.stringify({
      storeId,
      csvData,
      columnMappings
    }),
    requestContext: {
      authorizer: {
        userId
      }
    }
  };
  
  const result = await orderManagement.handler(mockEvent);
  const body = JSON.parse(result.body);
  
  return {
    ordersCreated: body.ordersCreated,
    errors: body.errors,
    orders: body.orders
  };
};

// Helper function to get value from CSV row using column mapping
const getValue = (row, columnMappings, field, defaultValue = '') => {
  const csvColumn = Object.keys(columnMappings).find(col => columnMappings[col] === field);
  return csvColumn ? (row[csvColumn] || defaultValue) : defaultValue;
};

// Map CSV row to Product format
const mapCSVRowToProduct = (row, columnMappings, storeId, rowNumber) => {
  const now = new Date().toISOString();
  
  // Generate product ID if not provided
  let productId = getValue(row, columnMappings, 'id');
  if (!productId) {
    productId = getValue(row, columnMappings, 'sku');
    if (!productId) {
      productId = `${storeId}_product_${Date.now()}_${rowNumber}`;
    }
  }
  
  // Parse price
  const priceStr = getValue(row, columnMappings, 'price', '0');
  const price = parseFloat(priceStr.replace(/[^0-9.-]/g, '')) || 0;
  
  // Parse inventory quantity
  const quantityStr = getValue(row, columnMappings, 'inventory_quantity', '0');
  const quantity = parseInt(quantityStr) || 0;
  
  return {
    id: productId,
    storeId: storeId,
    title: getValue(row, columnMappings, 'title') || `Product ${rowNumber}`,
    vendor: getValue(row, columnMappings, 'vendor'),
    product_type: getValue(row, columnMappings, 'product_type'),
    price: price.toFixed(2),
    sku: getValue(row, columnMappings, 'sku'),
    inventory_quantity: quantity,
    description: getValue(row, columnMappings, 'description'),
    tags: getValue(row, columnMappings, 'tags'),
    weight: getValue(row, columnMappings, 'weight'),
    compare_at_price: getValue(row, columnMappings, 'compare_at_price'),
    created_at: now,
    updated_at: now,
    csv_upload: true,
    upload_timestamp: now
  };
};

// Map CSV row to Inventory format
const mapCSVRowToInventory = (row, columnMappings, storeId, rowNumber) => {
  const now = new Date().toISOString();
  
  const sku = getValue(row, columnMappings, 'sku');
  const location = getValue(row, columnMappings, 'location') || storeId;
  
  // Generate inventory ID
  const inventoryId = `${storeId}_${location}_${sku || rowNumber}_${Date.now()}`;
  
  // Parse quantities
  const quantity = parseInt(getValue(row, columnMappings, 'quantity', '0')) || 0;
  const reserved = parseInt(getValue(row, columnMappings, 'reserved', '0')) || 0;
  const available = parseInt(getValue(row, columnMappings, 'available', quantity.toString())) || quantity;
  const incoming = parseInt(getValue(row, columnMappings, 'incoming', '0')) || 0;
  
  return {
    id: inventoryId,
    storeId: storeId,
    sku: sku || `SKU_${rowNumber}`,
    location: location,
    quantity: quantity,
    reserved: reserved,
    available: available,
    incoming: incoming,
    updated_at: getValue(row, columnMappings, 'updated_at') || now,
    created_at: now,
    csv_upload: true,
    upload_timestamp: now
  };
};

// Map CSV row to Customer format
const mapCSVRowToCustomer = (row, columnMappings, storeId, rowNumber) => {
  const now = new Date().toISOString();
  
  // Generate customer ID if not provided
  let customerId = getValue(row, columnMappings, 'id');
  if (!customerId) {
    const email = getValue(row, columnMappings, 'email');
    customerId = email ? email.replace(/[^a-zA-Z0-9]/g, '_') : `${storeId}_customer_${Date.now()}_${rowNumber}`;
  }
  
  return {
    id: customerId,
    storeId: storeId,
    email: getValue(row, columnMappings, 'email'),
    first_name: getValue(row, columnMappings, 'first_name'),
    last_name: getValue(row, columnMappings, 'last_name'),
    phone: getValue(row, columnMappings, 'phone'),
    address: getValue(row, columnMappings, 'address'),
    city: getValue(row, columnMappings, 'city'),
    state: getValue(row, columnMappings, 'state'),
    zip: getValue(row, columnMappings, 'zip'),
    country: getValue(row, columnMappings, 'country') || 'United States',
    tags: getValue(row, columnMappings, 'tags'),
    notes: getValue(row, columnMappings, 'notes'),
    created_at: now,
    updated_at: now,
    csv_upload: true,
    upload_timestamp: now
  };
};

// Ensure DynamoDB table exists (for local development)
const ensureTableExists = async (tableName, keySchema) => {
  const dynamodbAdmin = new AWS.DynamoDB(dynamoConfig);
  
  try {
    await dynamodbAdmin.describeTable({ TableName: tableName }).promise();
  } catch (error) {
    if (error.code === 'ResourceNotFoundException') {
      console.log(`Table ${tableName} does not exist, creating it...`);
      
      const attributeDefinitions = keySchema.map(key => ({
        AttributeName: key.AttributeName,
        AttributeType: 'S'
      }));
      
      try {
        await dynamodbAdmin.createTable({
          TableName: tableName,
          KeySchema: keySchema,
          AttributeDefinitions: attributeDefinitions,
          BillingMode: 'PAY_PER_REQUEST'
        }).promise();
        
        // Wait for table to be active
        await new Promise(resolve => setTimeout(resolve, 5000));
        console.log(`Table ${tableName} created successfully`);
      } catch (createError) {
        console.error(`Error creating table ${tableName}:`, createError);
      }
    }
  }
};

// Main handler
exports.handler = async (event) => {
  console.log('Data Upload Handler triggered:', JSON.stringify(event));
  
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
    
    if (path.includes('/data/upload-csv') && method === 'POST') {
      // Handle CSV upload
      const body = JSON.parse(event.body);
      const { storeId, csvData, columnMappings, dataType } = body;
      
      if (!storeId || !csvData || !columnMappings || !dataType) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            error: 'Store ID, CSV data, column mappings, and data type are required'
          })
        };
      }
      
      const result = await processDataUpload(userId, storeId, csvData, columnMappings, dataType);
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify(result)
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
    console.error('Error in data upload handler:', error);
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