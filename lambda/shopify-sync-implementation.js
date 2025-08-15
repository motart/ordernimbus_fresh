// This file documents the Shopify sync implementation added to the main Lambda
// The actual implementation is deployed directly to AWS Lambda

// Helper function to make Shopify API requests
const makeShopifyRequest = async (shop, accessToken, endpoint, method = 'GET', body = null) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: shop,
      path: `/admin/api/2024-10${endpoint}`,
      method: method,
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(result);
          } else {
            console.error('Shopify API error:', result);
            reject(new Error(`Shopify API error: ${result.errors || JSON.stringify(result)}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
};

// The sync implementation fetches real data from Shopify:
// 1. Products with variants and inventory
// 2. Orders with financial and fulfillment status
// 3. Customers
// 
// Data is stored in DynamoDB with proper partition keys:
// - Products: pk=user_{userId}, sk=product_{productId}_{variantId}
// - Orders: pk=user_{userId}, sk=order_{orderId}
// - Metadata: pk=user_{userId}, sk=store_{storeDomain}_metadata
//
// The sync returns actual counts and totals instead of mock data