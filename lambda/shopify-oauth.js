const AWS = require('aws-sdk');
const crypto = require('crypto');
const axios = require('axios');

// Initialize AWS services
const dynamoConfig = {
  region: process.env.AWS_REGION || 'us-west-1'
};

// Only set endpoint for local development
if (process.env.DYNAMODB_ENDPOINT) {
  dynamoConfig.endpoint = process.env.DYNAMODB_ENDPOINT;
}

const dynamodb = new AWS.DynamoDB.DocumentClient(dynamoConfig);

const secretsManager = new AWS.SecretsManager({
  region: process.env.AWS_REGION || 'us-west-1'
});

// Determine environment and set URLs accordingly
const getEnvironmentUrls = () => {
  const env = process.env.ENVIRONMENT || 'local';
  
  switch(env) {
    case 'production':
      return {
        appUrl: 'https://app.ordernimbus.com',
        apiUrl: 'https://api.ordernimbus.com',
        redirectUri: 'https://api.ordernimbus.com/shopify/callback'
      };
    case 'staging':
      return {
        appUrl: 'https://staging.ordernimbus.com',
        apiUrl: 'https://api-staging.ordernimbus.com',
        redirectUri: 'https://api-staging.ordernimbus.com/shopify/callback'
      };
    case 'local':
    default:
      return {
        appUrl: process.env.APP_URL || 'http://localhost:3000',
        apiUrl: 'http://localhost:3001',
        redirectUri: process.env.SHOPIFY_REDIRECT_URI || 'http://localhost:3001/api/shopify/callback'
      };
  }
};

const envUrls = getEnvironmentUrls();

// OrderNimbus Shopify App Configuration
// These credentials are for the SINGLE OrderNimbus app that ALL users connect through
const SHOPIFY_APP_CONFIG = {
  apiKey: process.env.SHOPIFY_API_KEY || 'your-app-api-key',
  apiSecret: process.env.SHOPIFY_API_SECRET || 'your-app-secret',
  scopes: 'read_products,read_orders,write_orders,read_inventory,read_customers,read_analytics,read_locations,read_fulfillments',
  redirectUri: envUrls.redirectUri,
  appUrl: envUrls.appUrl
};

// Check if platform owner has configured the app
const isAppConfigured = () => {
  return SHOPIFY_APP_CONFIG.apiKey !== 'your-app-api-key' && 
         SHOPIFY_APP_CONFIG.apiSecret !== 'your-app-secret';
};

// Generate random nonce for security
const generateNonce = () => {
  return crypto.randomBytes(16).toString('hex');
};

// Verify Shopify webhook/request signature
const verifyShopifyHmac = (query, hmac) => {
  const message = Object.keys(query)
    .filter(key => key !== 'hmac' && key !== 'signature')
    .sort()
    .map(key => `${key}=${query[key]}`)
    .join('&');
  
  const calculatedHmac = crypto
    .createHmac('sha256', SHOPIFY_APP_CONFIG.apiSecret)
    .update(message)
    .digest('hex');
  
  return calculatedHmac === hmac;
};

// Step 1: Initiate OAuth flow
const initiateOAuth = async (userId, storeDomain) => {
  // Clean the domain
  const cleanDomain = storeDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const shopDomain = cleanDomain.includes('.myshopify.com') 
    ? cleanDomain 
    : `${cleanDomain}.myshopify.com`;
  
  // Generate and store nonce for security
  const nonce = generateNonce();
  const stateData = {
    userId,
    nonce,
    shopDomain,
    timestamp: Date.now()
  };
  
  // Store state in DynamoDB for verification
  await dynamodb.put({
    TableName: `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-oauth-states`,
    Item: {
      state: nonce,
      ...stateData,
      ttl: Math.floor(Date.now() / 1000) + 600 // Expire in 10 minutes
    }
  }).promise();
  
  // Build OAuth authorization URL
  const authUrl = `https://${shopDomain}/admin/oauth/authorize?` + 
    `client_id=${SHOPIFY_APP_CONFIG.apiKey}&` +
    `scope=${SHOPIFY_APP_CONFIG.scopes}&` +
    `redirect_uri=${encodeURIComponent(SHOPIFY_APP_CONFIG.redirectUri)}&` +
    `state=${nonce}`;
  
  return {
    authUrl,
    state: nonce
  };
};

// Step 2: Handle OAuth callback
const handleOAuthCallback = async (code, shop, state, hmac) => {
  try {
    // Verify state to prevent CSRF attacks
    const stateResult = await dynamodb.get({
      TableName: `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-oauth-states`,
      Key: { state }
    }).promise();
    
    if (!stateResult.Item) {
      throw new Error('Invalid or expired OAuth state');
    }
    
    const { userId, shopDomain } = stateResult.Item;
    
    // Verify shop domain matches
    if (shop !== shopDomain) {
      throw new Error('Shop domain mismatch');
    }
    
    // Exchange authorization code for access token
    const tokenUrl = `https://${shop}/admin/oauth/access_token`;
    const tokenResponse = await axios.post(tokenUrl, {
      client_id: SHOPIFY_APP_CONFIG.apiKey,
      client_secret: SHOPIFY_APP_CONFIG.apiSecret,
      code
    });
    
    const { access_token, scope } = tokenResponse.data;
    
    // Get shop information
    const shopInfoResponse = await axios.get(`https://${shop}/admin/api/2024-07/shop.json`, {
      headers: {
        'X-Shopify-Access-Token': access_token
      }
    });
    
    const shopInfo = shopInfoResponse.data.shop;
    
    // Get additional shop details
    let locationId = null;
    try {
      // Get primary location for inventory tracking
      const locationsResponse = await axios.get(`https://${shop}/admin/api/2024-07/locations.json`, {
        headers: {
          'X-Shopify-Access-Token': access_token
        }
      });
      
      if (locationsResponse.data.locations && locationsResponse.data.locations.length > 0) {
        // Find primary location or use first one
        const primaryLocation = locationsResponse.data.locations.find(loc => loc.active) || locationsResponse.data.locations[0];
        locationId = primaryLocation.id;
      }
    } catch (locError) {
      console.log('Could not fetch locations:', locError.message);
    }
    
    // Store the access token securely
    const storeId = `store_${crypto.randomBytes(8).toString('hex')}`;
    
    // Save store with comprehensive information from Shopify
    await dynamodb.put({
      TableName: `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-stores`,
      Item: {
        userId,
        id: storeId,
        name: shopInfo.name || shop.replace('.myshopify.com', ''),
        displayName: shopInfo.name,
        type: 'shopify',
        shopifyDomain: shop,
        apiKey: access_token, // In production, encrypt this
        shopifyShopId: shopInfo.id,
        email: shopInfo.email,
        phone: shopInfo.phone || null,
        country: shopInfo.country_name,
        countryCode: shopInfo.country_code,
        province: shopInfo.province || null,
        provinceCode: shopInfo.province_code || null,
        city: shopInfo.city || null,
        address1: shopInfo.address1 || null,
        address2: shopInfo.address2 || null,
        zip: shopInfo.zip || null,
        currency: shopInfo.currency,
        moneyFormat: shopInfo.money_format,
        moneyWithCurrencyFormat: shopInfo.money_with_currency_format,
        timezone: shopInfo.iana_timezone,
        timezoneOffset: shopInfo.timezone,
        weightUnit: shopInfo.weight_unit,
        taxesIncluded: shopInfo.taxes_included,
        taxShipping: shopInfo.tax_shipping,
        planName: shopInfo.plan_name,
        planDisplayName: shopInfo.plan_display_name,
        primaryDomain: shopInfo.domain,
        myshopifyDomain: shopInfo.myshopify_domain,
        primaryLocationId: locationId,
        shopOwner: shopInfo.shop_owner,
        customerEmail: shopInfo.customer_email,
        hasStorefront: shopInfo.has_storefront,
        hasDiscounts: shopInfo.has_discounts,
        hasGiftCards: shopInfo.has_gift_cards,
        eligibleForPayments: shopInfo.eligible_for_payments,
        eligibleForCardReaderGiveaway: shopInfo.eligible_for_card_reader_giveaway,
        passwordEnabled: shopInfo.password_enabled,
        setupRequired: shopInfo.setup_required,
        checkoutApiSupported: shopInfo.checkout_api_supported,
        multiLocationEnabled: shopInfo.multi_location_enabled,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        shopifyCreatedAt: shopInfo.created_at,
        shopifyUpdatedAt: shopInfo.updated_at,
        syncStatus: 'pending',
        lastSync: null,
        shopifyData: {
          planName: shopInfo.plan_name,
          primaryDomain: shopInfo.domain,
          createdAt: shopInfo.created_at,
          googleAppsDomain: shopInfo.google_apps_domain,
          googleAppsLoginEnabled: shopInfo.google_apps_login_enabled,
          source: shopInfo.source,
          forceSsl: shopInfo.force_ssl,
          prelaunchEnabled: shopInfo.pre_launch_enabled,
          enabledPresentmentCurrencies: shopInfo.enabled_presentment_currencies
        }
      }
    }).promise();
    
    // Clean up used OAuth state
    await dynamodb.delete({
      TableName: `${process.env.TABLE_PREFIX || 'ordernimbus-local'}-oauth-states`,
      Key: { state }
    }).promise();
    
    // Trigger initial sync
    // In local environment, call the function directly
    if (process.env.ENVIRONMENT === 'local') {
      try {
        console.log('Triggering initial sync for store:', shop);
        
        // Directly call the shopify-integration handler
        const shopifyIntegration = require('./shopify-integration');
        const syncEvent = {
          body: JSON.stringify({
            userId,
            storeId,
            shopifyDomain: shop,
            apiKey: access_token,
            syncType: 'full',
            locationId: locationId
          })
        };
        
        const syncResponse = await shopifyIntegration.handler(syncEvent);
        console.log('Local sync triggered:', JSON.parse(syncResponse.body));
      } catch (syncError) {
        console.log('Sync will be performed later:', syncError.message);
        // Don't fail the OAuth flow if sync fails
      }
    } else {
      // In AWS, use Lambda invoke
      const lambda = new AWS.Lambda();
      await lambda.invoke({
        FunctionName: process.env.SHOPIFY_SYNC_FUNCTION || 'ordernimbus-local-shopify-integration',
        InvocationType: 'Event',
        Payload: JSON.stringify({
          userId,
          storeId,
          shopifyDomain: shop,
          apiKey: access_token,
          syncType: 'full',
          locationId: locationId
        })
      }).promise();
    }
    
    return {
      success: true,
      storeId,
      storeName: shopInfo.name,
      userId
    };
    
  } catch (error) {
    console.error('OAuth callback error:', error);
    throw error;
  }
};

// Create embedded app installation URL (for seamless experience)
const createEmbeddedAppUrl = async (userId) => {
  // This would create a custom Shopify app installation URL
  // For public apps, you'd register on Shopify App Store
  // For custom apps, use Shopify CLI
  
  const installUrl = 'https://apps.shopify.com/ordernimbus'; // Would be your actual app URL
  
  return {
    installUrl,
    instructions: [
      'Click the link to install OrderNimbus from Shopify App Store',
      'Approve the requested permissions',
      'You\'ll be redirected back to OrderNimbus automatically'
    ]
  };
};

// Main handler
exports.handler = async (event) => {
  console.log('Shopify OAuth Lambda triggered:', JSON.stringify(event));
  
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
    
    // Handle different OAuth endpoints
    if (path.includes('/shopify/connect') && method === 'POST') {
      // Step 1: Initiate OAuth
      const { userId, storeDomain } = JSON.parse(event.body);
      
      if (!userId || !storeDomain) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            error: 'Missing userId or storeDomain'
          })
        };
      }
      
      // Check if platform owner has configured the app
      if (!isAppConfigured()) {
        console.error('Shopify Public App not configured!');
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            error: 'Configuration Required',
            message: 'OrderNimbus needs a Shopify Public App configured. See CREATE_PUBLIC_APP_GUIDE.md',
            details: 'You need to create a PUBLIC app (not Custom app) in Shopify Partners and add the API key/secret to env.json',
            setupRequired: true
          })
        };
      }
      
      const oauthData = await initiateOAuth(userId, storeDomain);
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify(oauthData)
      };
      
    } else if (path.includes('/shopify/callback') && method === 'GET') {
      // Step 2: Handle OAuth callback
      const { code, shop, state, hmac } = event.queryStringParameters || {};
      
      if (!code || !shop || !state) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'text/html',
            'Access-Control-Allow-Origin': '*'
          },
          body: `
            <html>
              <body>
                <script>
                  window.opener.postMessage({ 
                    type: 'shopify-oauth-error', 
                    error: 'Missing required parameters' 
                  }, '*');
                  window.close();
                </script>
              </body>
            </html>
          `
        };
      }
      
      try {
        const result = await handleOAuthCallback(code, shop, state, hmac);
        
        // Return HTML that posts message to parent window and closes
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'text/html',
            'Access-Control-Allow-Origin': '*'
          },
          body: `
            <!DOCTYPE html>
            <html>
              <head>
                <title>Connection Successful - OrderNimbus</title>
                <style>
                  body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                  }
                  .success {
                    text-align: center;
                    padding: 40px;
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.1);
                    color: #333;
                    max-width: 400px;
                  }
                  .success h1 { 
                    color: #10b981;
                    font-size: 28px;
                    margin-bottom: 10px;
                  }
                  .success p {
                    color: #6b7280;
                    line-height: 1.5;
                  }
                  .spinner {
                    margin: 20px auto;
                    width: 40px;
                    height: 40px;
                    border: 4px solid #f3f4f6;
                    border-top: 4px solid #667eea;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                  }
                  @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                  }
                </style>
              </head>
              <body>
                <div class="success">
                  <h1>✅ Connected Successfully!</h1>
                  <p><strong>${result.storeName}</strong> has been connected to OrderNimbus.</p>
                  <div class="spinner"></div>
                  <p>Syncing your store data...</p>
                  <p style="font-size: 14px; color: #9ca3af;">This window will close automatically.</p>
                </div>
                <script>
                  // Post success message to parent window
                  if (window.opener) {
                    window.opener.postMessage({ 
                      type: 'shopify-oauth-success', 
                      data: ${JSON.stringify(result)}
                    }, '*');
                    
                    // Close window after 3 seconds
                    setTimeout(() => {
                      window.close();
                    }, 3000);
                  } else if (window.parent !== window) {
                    // In iframe
                    window.parent.postMessage({ 
                      type: 'shopify-oauth-success', 
                      data: ${JSON.stringify(result)}
                    }, '*');
                  } else {
                    // Redirect to stores page
                    setTimeout(() => {
                      window.location.href = '${envUrls.appUrl}/#/stores';
                    }, 3000);
                  }
                </script>
              </body>
            </html>
          `
        };
      } catch (error) {
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'text/html',
            'Access-Control-Allow-Origin': '*'
          },
          body: `
            <html>
              <body>
                <script>
                  window.opener.postMessage({ 
                    type: 'shopify-oauth-error', 
                    error: '${error.message}' 
                  }, '*');
                  window.close();
                </script>
              </body>
            </html>
          `
        };
      }
      
    } else if (path.includes('/shopify/embedded') && method === 'GET') {
      // Get embedded app URL
      const { userId } = event.queryStringParameters || {};
      const embedData = await createEmbeddedAppUrl(userId);
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify(embedData)
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
    console.error('Error in Shopify OAuth:', error);
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