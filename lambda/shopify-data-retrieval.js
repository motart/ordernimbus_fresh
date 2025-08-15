// This file documents the Shopify data retrieval implementation added to the main Lambda
// The actual implementation is deployed directly to AWS Lambda

// Data Retrieval Flow:
// 1. Frontend calls /api/products, /api/orders, /api/inventory, /api/customers
// 2. Lambda receives userId from headers
// 3. Lambda queries DynamoDB using partition key: user_{userId}
// 4. Returns actual synced data instead of mock data

// DynamoDB Query Patterns:
// - Products: pk=user_{userId}, sk=product_{productId}_{variantId}
// - Orders: pk=user_{userId}, sk=order_{orderId}
// - Inventory: Same as products (inventory is stored with products)
// - Metadata: pk=user_{userId}, sk=store_{storeDomain}_metadata

// Response Format:
// {
//   products: [...],  // Actual product data from Shopify
//   count: n,         // Real count
//   source: 'dynamodb' // Indicates data source
// }

// Error Handling:
// - If DynamoDB query fails, falls back to mock data
// - Returns source: 'mock' to indicate fallback
// - Logs errors for debugging