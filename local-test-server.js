const express = require('express');
const cors = require('cors');
const AWS = require('aws-sdk');

// Import Lambda handlers
const storeHandler = require('./lambda/store-management');
const shopifyHandler = require('./lambda/shopify-integration');
const orderHandler = require('./lambda/order-management');
const productHandler = require('./lambda/product-management');
const inventoryHandler = require('./lambda/inventory-management');
const customerHandler = require('./lambda/customer-management');
const dataUploadHandler = require('./lambda/data-upload-handler');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Middleware to convert Express req/res to Lambda event format
const expressToLambda = (handler) => async (req, res) => {
  const event = {
    httpMethod: req.method,
    path: req.path,
    headers: req.headers,
    body: JSON.stringify(req.body),
    queryStringParameters: req.query,
    pathParameters: req.params
  };

  try {
    const result = await handler.handler(event);
    res.status(result.statusCode).json(JSON.parse(result.body));
  } catch (error) {
    console.error('Handler error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Store routes
app.get('/api/stores', expressToLambda(storeHandler));
app.post('/api/stores', expressToLambda(storeHandler));
app.put('/api/stores/:storeId', expressToLambda(storeHandler));
app.delete('/api/stores/:storeId', expressToLambda(storeHandler));

// Shopify routes
app.post('/api/shopify/sync', expressToLambda(shopifyHandler));

// Order routes
app.get('/api/orders', expressToLambda(orderHandler));
app.post('/api/orders', expressToLambda(orderHandler));
app.post('/api/orders/upload-csv', expressToLambda(orderHandler));

// Product routes
app.get('/api/products', expressToLambda(productHandler));
app.post('/api/products', expressToLambda(productHandler));

// Inventory routes
app.get('/api/inventory', expressToLambda(inventoryHandler));
app.post('/api/inventory', expressToLambda(inventoryHandler));

// Customer routes
app.get('/api/customers', expressToLambda(customerHandler));
app.post('/api/customers', expressToLambda(customerHandler));

// Data upload routes
app.post('/api/data/upload-csv', expressToLambda(dataUploadHandler));

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Local test server running on http://localhost:${PORT}`);
});