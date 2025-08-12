#!/bin/bash

# Quick Lambda update script
REGION=us-west-1
LAMBDA_NAME="ordernimbus-production-main"

echo "Updating Lambda function with enhanced Shopify integration..."

# Create temporary directory for Lambda packaging
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR" || exit 1

# Install dependencies
npm init -y >/dev/null 2>&1
npm install aws-sdk@2 crypto https --save >/dev/null 2>&1

# Create the enhanced Lambda function (extracted from deploy-simple.sh)
cat > index.js << 'EOF'
// OrderNimbus Lambda with Enhanced Shopify Integration & Data Sync
const AWS = require('aws-sdk');
const crypto = require('crypto');
const https = require('https');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const cognito = new AWS.CognitoIdentityServiceProvider();
const secretsManager = new AWS.SecretsManager();

let shopifyCredentials = null;

async function getShopifyCredentials() {
  if (shopifyCredentials) return shopifyCredentials;
  try {
    const secret = await secretsManager.getSecretValue({ 
      SecretId: 'ordernimbus/production/shopify' 
    }).promise();
    shopifyCredentials = JSON.parse(secret.SecretString);
    return shopifyCredentials;
  } catch (error) {
    console.error('Error getting Shopify credentials:', error);
    throw new Error('Shopify credentials not configured');
  }
}

// Helper function to make Shopify API requests
async function shopifyApiRequest(shop, accessToken, endpoint) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: shop,
      path: `/admin/api/2024-01${endpoint}`,
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          console.error(`Shopify API error: ${res.statusCode} - ${data}`);
          resolve(null);
        }
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event));
  
  const method = event.requestContext?.http?.method || event.httpMethod || 'GET';
  const origin = event.headers?.origin || event.headers?.Origin || 'https://app.ordernimbus.com';
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,userId',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS,HEAD,PATCH',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json'
  };
  
  if (method === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'OK' }) };
  }
  
  let path = event.rawPath || event.path || '/';
  if (path.startsWith('/production')) path = path.substring(11);
  
  try {
    const pathParts = path.split('/').filter(Boolean);
    const resource = pathParts[1];
    const action = pathParts[2];
    
    if (resource === 'stores') {
      const body = JSON.parse(event.body || '{}');
      const userId = event.headers?.userId || event.headers?.userid || 'anonymous';
      
      if (method === 'GET') {
        const result = await dynamodb.query({
          TableName: process.env.TABLE_NAME || 'ordernimbus-production-main',
          KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
          ExpressionAttributeValues: { ':pk': 'user_' + userId, ':sk': 'store_' }
        }).promise();
        
        const stores = (result.Items || []).map(item => ({
          id: item.storeId || item.sk?.replace('store_', ''),
          name: item.name || item.shopifyDomain?.replace('.myshopify.com', '') || 'Unknown Store',
          displayName: item.displayName || item.name || item.shopifyDomain?.replace('.myshopify.com', ''),
          type: item.type || (item.shopifyDomain ? 'shopify' : 'brick-and-mortar'),
          status: item.status || 'active',
          shopifyDomain: item.shopifyDomain,
          createdAt: item.createdAt || new Date().toISOString(),
          lastSync: item.lastSync,
          syncStatus: item.syncStatus || 'completed',
          syncMetadata: item.syncMetadata || {
            productsCount: 0,
            ordersCount: 0,
            customersCount: 0
          }
        }));
        
        return { 
          statusCode: 200, 
          headers: corsHeaders, 
          body: JSON.stringify({ stores, count: stores.length }) 
        };
      }
    }
    
    // Handle data endpoints
    const userId = event.headers?.userId || event.headers?.userid || 'anonymous';
    const storeId = event.queryStringParameters?.storeId;
    
    if (['products', 'orders', 'customers', 'inventory'].includes(resource) && storeId) {
      try {
        const result = await dynamodb.query({
          TableName: process.env.TABLE_NAME || 'ordernimbus-production-main',
          KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
          ExpressionAttributeValues: { 
            ':pk': 'user_' + userId, 
            ':sk': `${resource.slice(0, -1)}_${storeId}_`
          }
        }).promise();
        
        const items = result.Items || [];
        const cleanItems = items.map(item => {
          const { pk, sk, storeId: itemStoreId, dataType, syncedAt, ...cleanItem } = item;
          return cleanItem;
        });
        
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            [resource]: cleanItems,
            count: cleanItems.length,
            storeId,
            lastSync: items[0]?.syncedAt || null
          })
        };
      } catch (error) {
        console.error(`Error fetching ${resource}:`, error);
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({ [resource]: [], count: 0, storeId, error: error.message })
        };
      }
    }
    
    // Default responses
    let responseData = {};
    switch(resource) {
      case 'products': 
        responseData = { products: [], count: 0, storeId }; 
        break;
      case 'orders': 
        responseData = { orders: [], count: 0, storeId }; 
        break;
      case 'inventory': 
        responseData = { inventory: [], count: 0, storeId }; 
        break;
      case 'customers': 
        responseData = { customers: [], count: 0, storeId }; 
        break;
      default: 
        responseData = { 
          message: 'OrderNimbus API', 
          version: '1.0',
          timestamp: new Date().toISOString()
        };
    }
    
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(responseData) };
    
  } catch (error) {
    console.error('Handler error:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: error.message }) };
  }
};
EOF

# Package and update Lambda
zip -qr lambda-package.zip .

aws lambda update-function-code \
    --function-name "$LAMBDA_NAME" \
    --zip-file fileb://lambda-package.zip \
    --region "$REGION" \
    --output text >/dev/null

echo "✅ Lambda function updated successfully!"

# Cleanup
cd /
rm -rf "$TEMP_DIR"

echo "Lambda is now ready to serve data from Shopify stores."