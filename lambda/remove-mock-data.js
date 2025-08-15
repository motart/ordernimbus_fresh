// This file documents the removal of mock data from production Lambda
// Date: 2025-08-15
// Issue: Production was showing hardcoded mock stores that couldn't be deleted

// Changes made to the main Lambda function:

// 1. STORES ENDPOINT - Removed hardcoded mock data and added real DynamoDB queries
// Before:
/*
case 'stores':
  responseData = {
    stores: [
      { id: '1', name: 'Main Store', domain: 'main.myshopify.com' },
      { id: '2', name: 'Secondary Store', domain: 'secondary.myshopify.com' }
    ],
    count: 2
  };
  break;
*/

// After: Now queries real stores from DynamoDB using userId
// Also added DELETE method support to allow store deletion

// 2. CUSTOMERS ENDPOINT - Removed mock fallback data
// Removed hardcoded John Doe and Jane Smith mock customers

// 3. ORDERS ENDPOINT - Removed mock fallback data  
// Removed hardcoded mock orders

// 4. Added proper DELETE functionality for stores
// - Deletes store metadata from DynamoDB
// - Deletes all associated products and orders for that store
// - Returns success/error response

// Key improvements:
// - All endpoints now return real data from DynamoDB
// - No more hardcoded mock/seed data in production
// - Stores can now be properly deleted
// - Error cases return empty arrays instead of mock data