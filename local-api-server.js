const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

// Set environment variables for local development BEFORE importing Lambda functions
process.env.ENVIRONMENT = 'local';
process.env.REGION = 'us-east-1';
process.env.TABLE_PREFIX = 'ordernimbus-local';
process.env.DYNAMODB_ENDPOINT = 'http://localhost:8000';
process.env.AWS_ACCESS_KEY_ID = 'local';
process.env.AWS_SECRET_ACCESS_KEY = 'local';
process.env.SHOPIFY_API_KEY = '56b2e86e830bdfbba86684a6779aa738';
process.env.SHOPIFY_API_SECRET = '7e6cdb173e5a538003719bb89009893c';
process.env.SHOPIFY_REDIRECT_URI = 'http://localhost:3001/api/shopify/callback';
process.env.APP_URL = 'http://localhost:3000';

// Import Lambda functions AFTER setting environment variables
const storeManagement = require('./lambda/store-management');
const shopifyOAuth = require('./lambda/shopify-oauth');
const shopifyIntegration = require('./lambda/shopify-integration');
const dataIngestion = require('./lambda/data-ingestion');
const dataAnalysis = require('./lambda/data-analysis-engine');
const forecastApi = require('./lambda/forecast-api');
const inventoryManagement = require('./lambda/inventory-management');
const orderManagement = require('./lambda/order-management');
const dataUploadHandler = require('./lambda/data-upload-handler');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Helper to convert Express request to Lambda event
const toLambdaEvent = (req, method, pathParams = {}) => ({
  httpMethod: method,
  path: req.path,
  headers: req.headers,
  queryStringParameters: req.query,
  pathParameters: pathParams,
  body: JSON.stringify(req.body),
  requestContext: {
    authorizer: {
      userId: req.headers.userid || req.headers.userId || req.headers.Userid
    }
  }
});

// Helper to send Lambda response
const sendLambdaResponse = (res, lambdaResponse) => {
  res.status(lambdaResponse.statusCode);
  
  // Set headers
  if (lambdaResponse.headers) {
    Object.keys(lambdaResponse.headers).forEach(key => {
      res.set(key, lambdaResponse.headers[key]);
    });
  }
  
  // Send body
  if (lambdaResponse.headers && lambdaResponse.headers['Content-Type'] === 'text/html') {
    res.send(lambdaResponse.body);
  } else {
    try {
      res.json(JSON.parse(lambdaResponse.body));
    } catch {
      res.send(lambdaResponse.body);
    }
  }
};

// Store Management routes
app.get('/api/stores', async (req, res) => {
  try {
    const event = toLambdaEvent(req, 'GET');
    const result = await storeManagement.handler(event);
    sendLambdaResponse(res, result);
  } catch (error) {
    console.error('Error in GET /api/stores:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

app.post('/api/stores', async (req, res) => {
  try {
    const event = toLambdaEvent(req, 'POST');
    const result = await storeManagement.handler(event);
    sendLambdaResponse(res, result);
  } catch (error) {
    console.error('Error in POST /api/stores:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

app.put('/api/stores/:storeId', async (req, res) => {
  try {
    const event = toLambdaEvent(req, 'PUT', { storeId: req.params.storeId });
    const result = await storeManagement.handler(event);
    sendLambdaResponse(res, result);
  } catch (error) {
    console.error('Error in PUT /api/stores/:storeId:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

app.delete('/api/stores/:storeId', async (req, res) => {
  try {
    const event = toLambdaEvent(req, 'DELETE', { storeId: req.params.storeId });
    const result = await storeManagement.handler(event);
    sendLambdaResponse(res, result);
  } catch (error) {
    console.error('Error in DELETE /api/stores/:storeId:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Shopify OAuth routes
app.post('/api/shopify/connect', async (req, res) => {
  try {
    const event = toLambdaEvent(req, 'POST');
    const result = await shopifyOAuth.handler(event);
    sendLambdaResponse(res, result);
  } catch (error) {
    console.error('Error in POST /api/shopify/connect:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

app.get('/api/shopify/callback', async (req, res) => {
  try {
    const event = toLambdaEvent(req, 'GET');
    const result = await shopifyOAuth.handler(event);
    sendLambdaResponse(res, result);
  } catch (error) {
    console.error('Error in GET /api/shopify/callback:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Shopify Sync route
app.post('/api/shopify/sync', async (req, res) => {
  try {
    const event = toLambdaEvent(req, 'POST');
    const result = await shopifyIntegration.handler(event);
    sendLambdaResponse(res, result);
  } catch (error) {
    console.error('Error in POST /api/shopify/sync:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Data Ingestion route
app.post('/api/data/ingest', async (req, res) => {
  try {
    const event = toLambdaEvent(req, 'POST');
    const result = await dataIngestion.handler(event);
    sendLambdaResponse(res, result);
  } catch (error) {
    console.error('Error in POST /api/data/ingest:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Data Analysis route
app.post('/api/data/analyze', async (req, res) => {
  try {
    const event = toLambdaEvent(req, 'POST');
    const result = await dataAnalysis.handler(event);
    sendLambdaResponse(res, result);
  } catch (error) {
    console.error('Error in POST /api/data/analyze:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Forecast API routes
app.get('/api/forecast', async (req, res) => {
  try {
    const event = toLambdaEvent(req, 'GET');
    const result = await forecastApi.handler(event);
    sendLambdaResponse(res, result);
  } catch (error) {
    console.error('Error in GET /api/forecast:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

app.post('/api/forecast', async (req, res) => {
  try {
    const event = toLambdaEvent(req, 'POST');
    const result = await forecastApi.handler(event);
    sendLambdaResponse(res, result);
  } catch (error) {
    console.error('Error in POST /api/forecast:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Inventory Management routes
app.get('/api/inventory', async (req, res) => {
  try {
    const event = toLambdaEvent(req, 'GET');
    const result = await inventoryManagement.handler(event);
    sendLambdaResponse(res, result);
  } catch (error) {
    console.error('Error in GET /api/inventory:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Order Management routes
app.get('/api/orders', async (req, res) => {
  try {
    const event = toLambdaEvent(req, 'GET');
    const result = await orderManagement.handler(event);
    sendLambdaResponse(res, result);
  } catch (error) {
    console.error('Error in GET /api/orders:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

app.post('/api/orders/upload-csv', async (req, res) => {
  try {
    const event = toLambdaEvent(req, 'POST');
    const result = await orderManagement.handler(event);
    sendLambdaResponse(res, result);
  } catch (error) {
    console.error('Error in POST /api/orders/upload-csv:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const event = toLambdaEvent(req, 'POST');
    const result = await orderManagement.handler(event);
    sendLambdaResponse(res, result);
  } catch (error) {
    console.error('Error in POST /api/orders:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Universal Data Upload route
app.post('/api/data/upload-csv', async (req, res) => {
  try {
    const event = toLambdaEvent(req, 'POST');
    const result = await dataUploadHandler.handler(event);
    sendLambdaResponse(res, result);
  } catch (error) {
    console.error('Error in POST /api/data/upload-csv:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'local-api-server' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Local API server running on http://localhost:${PORT}`);
  console.log('Using DynamoDB at:', process.env.DYNAMODB_ENDPOINT);
});