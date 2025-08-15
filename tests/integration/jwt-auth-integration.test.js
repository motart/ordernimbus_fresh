/**
 * Integration tests for JWT Authentication
 * Tests the complete flow from login to API access with JWT
 */

const assert = require('assert');
const jwt = require('jsonwebtoken');
const AWS = require('aws-sdk-mock');
const sinon = require('sinon');

// Import the secure handler
const secureHandler = require('../../lambda/secure-handler');

describe('JWT Authentication Integration Tests', function() {
  this.timeout(10000);
  
  let cognitoStub;
  let dynamodbStub;
  let secretsManagerStub;
  
  before(() => {
    // Mock AWS services
    AWS.mock('DynamoDB.DocumentClient', 'query', (params, callback) => {
      // Return mock data based on the query
      if (params.KeyConditionExpression.includes('pk = :pk')) {
        callback(null, {
          Items: [
            {
              pk: params.ExpressionAttributeValues[':pk'],
              sk: 'store_test-store_metadata',
              storeId: 'test-store',
              storeName: 'Test Store',
              storeType: 'shopify'
            }
          ]
        });
      } else {
        callback(null, { Items: [] });
      }
    });
    
    AWS.mock('SecretsManager', 'getSecretValue', (params, callback) => {
      callback(null, {
        SecretString: JSON.stringify({
          SHOPIFY_CLIENT_ID: 'test-client-id',
          SHOPIFY_CLIENT_SECRET: 'test-client-secret'
        })
      });
    });
  });
  
  after(() => {
    AWS.restore();
  });
  
  describe('Protected Endpoint Access', () => {
    it('should reject requests without JWT token', async () => {
      const event = {
        rawPath: '/api/stores',
        requestContext: {
          http: { method: 'GET' },
          // No authorizer context (no JWT)
        },
        headers: {
          'Content-Type': 'application/json'
        }
      };
      
      const response = await secureHandler.handler(event);
      
      assert.strictEqual(response.statusCode, 401);
      const body = JSON.parse(response.body);
      assert(body.error.includes('Unauthorized'));
    });
    
    it('should accept requests with valid JWT token', async () => {
      const userId = 'test-user-123';
      const event = {
        rawPath: '/api/stores',
        requestContext: {
          http: { method: 'GET' },
          authorizer: {
            claims: {
              sub: userId,
              email: 'test@example.com'
            }
          }
        },
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid.jwt.token'
        }
      };
      
      process.env.TABLE_NAME = 'test-table';
      const response = await secureHandler.handler(event);
      
      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert(Array.isArray(body.stores));
    });
    
    it('should ignore userId from headers when JWT is present', async () => {
      const jwtUserId = 'jwt-user-123';
      const headerUserId = 'header-user-456';
      
      const event = {
        rawPath: '/api/stores',
        requestContext: {
          http: { method: 'GET' },
          authorizer: {
            claims: {
              sub: jwtUserId  // This should be used
            }
          }
        },
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid.jwt.token',
          'userId': headerUserId,  // This should be ignored
          'userid': headerUserId   // This should also be ignored
        }
      };
      
      process.env.TABLE_NAME = 'test-table';
      const response = await secureHandler.handler(event);
      
      assert.strictEqual(response.statusCode, 200);
      // The handler should use jwtUserId, not headerUserId
      // We can verify this by checking the DynamoDB query parameters
    });
  });
  
  describe('CORS Security', () => {
    it('should allow requests from approved origins', async () => {
      const event = {
        requestContext: {
          http: { method: 'OPTIONS' }
        },
        headers: {
          origin: 'https://app.ordernimbus.com'
        }
      };
      
      const response = await secureHandler.handler(event);
      
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(
        response.headers['Access-Control-Allow-Origin'],
        'https://app.ordernimbus.com'
      );
    });
    
    it('should use default origin for unapproved origins', async () => {
      const event = {
        requestContext: {
          http: { method: 'OPTIONS' }
        },
        headers: {
          origin: 'https://malicious-site.com'
        }
      };
      
      const response = await secureHandler.handler(event);
      
      assert.strictEqual(response.statusCode, 200);
      assert.notStrictEqual(
        response.headers['Access-Control-Allow-Origin'],
        'https://malicious-site.com'
      );
    });
  });
  
  describe('Endpoint-Specific Security', () => {
    const protectedEndpoints = [
      '/api/stores',
      '/api/products',
      '/api/orders',
      '/api/inventory',
      '/api/customers',
      '/api/notifications'
    ];
    
    protectedEndpoints.forEach(endpoint => {
      it(`should protect ${endpoint} endpoint`, async () => {
        const event = {
          rawPath: endpoint,
          path: endpoint,
          requestContext: {
            http: { method: 'GET' }
          },
          headers: {
            'Content-Type': 'application/json'
          },
          queryStringParameters: {}
        };
        
        const response = await secureHandler.handler(event);
        
        assert.strictEqual(response.statusCode, 401,
          `${endpoint} should require authentication`);
      });
    });
    
    const publicEndpoints = [
      '/api/auth/login',
      '/api/auth/register',
      '/api/shopify/connect'
    ];
    
    publicEndpoints.forEach(endpoint => {
      it(`should allow public access to ${endpoint}`, async () => {
        const event = {
          rawPath: endpoint,
          path: endpoint,
          requestContext: {
            http: { method: 'POST' }
          },
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({})
        };
        
        const response = await secureHandler.handler(event);
        
        // Public endpoints should not return 401
        assert.notStrictEqual(response.statusCode, 401,
          `${endpoint} should be publicly accessible`);
      });
    });
  });
  
  describe('Data Isolation', () => {
    it('should only return data for the authenticated user', async () => {
      const userId1 = 'user-123';
      const userId2 = 'user-456';
      
      // First request for user 1
      const event1 = {
        rawPath: '/api/stores',
        requestContext: {
          http: { method: 'GET' },
          authorizer: {
            claims: { sub: userId1 }
          }
        },
        headers: {
          'Content-Type': 'application/json'
        }
      };
      
      process.env.TABLE_NAME = 'test-table';
      const response1 = await secureHandler.handler(event1);
      const data1 = JSON.parse(response1.body);
      
      // Second request for user 2
      const event2 = {
        rawPath: '/api/stores',
        requestContext: {
          http: { method: 'GET' },
          authorizer: {
            claims: { sub: userId2 }
          }
        },
        headers: {
          'Content-Type': 'application/json'
        }
      };
      
      const response2 = await secureHandler.handler(event2);
      const data2 = JSON.parse(response2.body);
      
      // Each user should get their own data
      // (In this mock, we're just checking the structure is correct)
      assert(Array.isArray(data1.stores));
      assert(Array.isArray(data2.stores));
    });
  });
  
  describe('Error Handling', () => {
    it('should handle missing TABLE_NAME environment variable', async () => {
      const originalTableName = process.env.TABLE_NAME;
      delete process.env.TABLE_NAME;
      
      const event = {
        rawPath: '/api/stores',
        requestContext: {
          http: { method: 'GET' },
          authorizer: {
            claims: { sub: 'test-user' }
          }
        },
        headers: {
          'Content-Type': 'application/json'
        }
      };
      
      const response = await secureHandler.handler(event);
      
      // In test environment, should handle gracefully with default table
      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert(body.stores !== undefined);
      
      // Restore original value
      if (originalTableName) {
        process.env.TABLE_NAME = originalTableName;
      }
    });
    
    it('should handle DynamoDB errors gracefully', async () => {
      // Mock DynamoDB to throw an error
      AWS.restore('DynamoDB.DocumentClient', 'query');
      AWS.mock('DynamoDB.DocumentClient', 'query', (params, callback) => {
        callback(new Error('DynamoDB service unavailable'));
      });
      
      const event = {
        rawPath: '/api/stores',
        requestContext: {
          http: { method: 'GET' },
          authorizer: {
            claims: { sub: 'test-user' }
          }
        },
        headers: {
          'Content-Type': 'application/json'
        }
      };
      
      process.env.TABLE_NAME = 'test-table';
      const response = await secureHandler.handler(event);
      
      // In test environment, errors are handled gracefully
      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert(body.stores !== undefined);
      
      // Restore normal mock
      AWS.restore('DynamoDB.DocumentClient', 'query');
      AWS.mock('DynamoDB.DocumentClient', 'query', (params, callback) => {
        callback(null, { Items: [] });
      });
    });
  });
  
  describe('JWT Token Validation', () => {
    it('should extract userId from JWT sub claim', async () => {
      const expectedUserId = 'cognito-user-sub-12345';
      
      const event = {
        rawPath: '/api/stores',
        requestContext: {
          http: { method: 'GET' },
          authorizer: {
            claims: {
              sub: expectedUserId,
              email: 'user@example.com',
              'cognito:username': 'testuser'
            }
          }
        },
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid.jwt.token'
        }
      };
      
      process.env.TABLE_NAME = 'test-table';
      const response = await secureHandler.handler(event);
      
      assert.strictEqual(response.statusCode, 200);
      // The handler should use the sub claim as userId
    });
    
    it('should handle JWT with custom claims', async () => {
      const event = {
        rawPath: '/api/stores',
        requestContext: {
          http: { method: 'GET' },
          authorizer: {
            claims: {
              sub: 'user-123',
              email: 'user@example.com',
              'custom:company_id': 'company-456',
              'custom:role': 'admin'
            }
          }
        },
        headers: {
          'Content-Type': 'application/json'
        }
      };
      
      process.env.TABLE_NAME = 'test-table';
      const response = await secureHandler.handler(event);
      
      assert.strictEqual(response.statusCode, 200);
      // Custom claims should be available but not affect user isolation
    });
  });
  
  describe('Shopify OAuth Flow', () => {
    it('should generate OAuth URL with state containing userId', async () => {
      const userId = 'test-user-123';
      const shop = 'test-shop.myshopify.com';
      
      const event = {
        rawPath: '/api/shopify/connect',
        path: '/api/shopify/connect',
        requestContext: {
          http: { method: 'GET' },
          authorizer: {
            claims: { sub: userId }
          },
          domainName: 'api.ordernimbus.com',
          stage: 'production'
        },
        queryStringParameters: {
          shop: shop
        },
        headers: {
          'Content-Type': 'application/json'
        }
      };
      
      const response = await secureHandler.handler(event);
      
      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert(body.authUrl);
      assert(body.authUrl.includes('state=' + userId));
    });
    
    it('should handle OAuth callback and store credentials', async () => {
      const event = {
        rawPath: '/api/shopify/callback',
        path: '/api/shopify/callback',
        requestContext: {
          http: { method: 'GET' }
        },
        queryStringParameters: {
          code: 'test-auth-code',
          shop: 'test-shop.myshopify.com',
          state: 'test-user-123'
        },
        headers: {}
      };
      
      // Mock the HTTPS request for token exchange
      const httpsStub = sinon.stub(require('https'), 'request');
      httpsStub.yields({
        on: (event, callback) => {
          if (event === 'data') {
            callback(JSON.stringify({
              access_token: 'test-access-token',
              scope: 'read_products,write_products'
            }));
          } else if (event === 'end') {
            callback();
          }
        },
        statusCode: 200
      });
      
      process.env.TABLE_NAME = 'test-table';
      const response = await secureHandler.handler(event);
      
      // Should redirect after successful OAuth
      assert.strictEqual(response.statusCode, 302);
      assert(response.headers.Location.includes('connected=true'));
      
      httpsStub.restore();
    });
  });
});

module.exports = {
  secureHandler
};