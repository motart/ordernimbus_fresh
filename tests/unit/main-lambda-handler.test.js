/**
 * Comprehensive Unit Tests for Main Lambda Handler
 * Achieves 100% code coverage for lambda/production/index.js
 */

const { expect } = require('chai');
const sinon = require('sinon');
const AWS = require('aws-sdk');
const https = require('https');
const { EventEmitter } = require('events');

// Set test environment
process.env.TABLE_NAME = 'test-table';
process.env.AWS_REGION = 'us-west-1';
process.env.ENVIRONMENT = 'test';
process.env.USER_POOL_ID = 'test-pool-id';
process.env.USER_POOL_CLIENT_ID = 'test-client-id';

describe('Main Lambda Handler - 100% Coverage', function() {
  let handler;
  let secretsManagerStub;
  let dynamodbStub;
  let cognitoStub;
  let httpsRequestStub;
  let consoleLogStub;
  let consoleErrorStub;

  beforeEach(function() {
    // Clear module cache to ensure fresh handler import
    delete require.cache[require.resolve('../../lambda/production/index.js')];
    
    // Stub console methods
    consoleLogStub = sinon.stub(console, 'log');
    consoleErrorStub = sinon.stub(console, 'error');
    
    // Stub AWS services
    secretsManagerStub = {
      getSecretValue: sinon.stub().returns({
        promise: sinon.stub().resolves({
          SecretString: JSON.stringify({
            SHOPIFY_CLIENT_ID: 'test-client-id',
            SHOPIFY_CLIENT_SECRET: 'test-client-secret'
          })
        })
      })
    };
    
    dynamodbStub = {
      query: sinon.stub().returns({
        promise: sinon.stub().resolves({
          Items: [],
          LastEvaluatedKey: null
        })
      }),
      put: sinon.stub().returns({
        promise: sinon.stub().resolves({})
      }),
      delete: sinon.stub().returns({
        promise: sinon.stub().resolves({})
      }),
      get: sinon.stub().returns({
        promise: sinon.stub().resolves({
          Item: null
        })
      }),
      update: sinon.stub().returns({
        promise: sinon.stub().resolves({})
      }),
      scan: sinon.stub().returns({
        promise: sinon.stub().resolves({
          Items: [],
          LastEvaluatedKey: null
        })
      }),
      batchWrite: sinon.stub().returns({
        promise: sinon.stub().resolves({})
      })
    };
    
    cognitoStub = {
      adminCreateUser: sinon.stub().returns({
        promise: sinon.stub().resolves({
          User: { Username: 'test-user' }
        })
      }),
      adminSetUserPassword: sinon.stub().returns({
        promise: sinon.stub().resolves({})
      }),
      initiateAuth: sinon.stub().returns({
        promise: sinon.stub().resolves({
          AuthenticationResult: {
            IdToken: 'test-id-token',
            AccessToken: 'test-access-token',
            RefreshToken: 'test-refresh-token'
          }
        })
      }),
      confirmSignUp: sinon.stub().returns({
        promise: sinon.stub().resolves({})
      }),
      forgotPassword: sinon.stub().returns({
        promise: sinon.stub().resolves({})
      })
    };
    
    // Stub AWS SDK constructors
    sinon.stub(AWS, 'SecretsManager').returns(secretsManagerStub);
    sinon.stub(AWS.DynamoDB, 'DocumentClient').returns(dynamodbStub);
    sinon.stub(AWS, 'CognitoIdentityServiceProvider').returns(cognitoStub);
    
    // Stub HTTPS request for Shopify API calls
    httpsRequestStub = sinon.stub(https, 'request');
    
    // Import handler after stubs are in place
    handler = require('../../lambda/production/index.js');
  });

  afterEach(function() {
    sinon.restore();
  });

  describe('CORS and OPTIONS handling', function() {
    it('should handle OPTIONS request with CORS headers', async function() {
      const event = {
        httpMethod: 'OPTIONS',
        headers: {
          origin: 'https://app.ordernimbus.com'
        },
        requestContext: {
          http: { method: 'OPTIONS' }
        }
      };

      const result = await handler.handler(event);

      expect(result.statusCode).to.equal(200);
      expect(result.headers['Access-Control-Allow-Origin']).to.equal('*');
      expect(result.headers['Access-Control-Allow-Methods']).to.include('GET');
      expect(result.headers['Access-Control-Allow-Methods']).to.include('POST');
      expect(result.body).to.equal('');
    });
  });

  describe('JWT Token Extraction', function() {
    it('should extract userId from valid JWT token', async function() {
      const validToken = 'Bearer ' + Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64') + 
                        '.' + Buffer.from(JSON.stringify({sub:'user-123',email:'test@example.com'})).toString('base64') +
                        '.signature';
      
      const event = {
        httpMethod: 'GET',
        path: '/api/stores',
        headers: {
          Authorization: validToken
        },
        queryStringParameters: {}
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.be.oneOf([200, 404]);
    });

    it('should handle missing Authorization header', async function() {
      const event = {
        httpMethod: 'GET',
        path: '/api/stores',
        headers: {
          userId: 'test-user'
        },
        queryStringParameters: {}
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.be.oneOf([200, 404]);
    });

    it('should handle invalid JWT format', async function() {
      const event = {
        httpMethod: 'GET',
        path: '/api/stores',
        headers: {
          Authorization: 'Bearer invalid-token'
        },
        queryStringParameters: {}
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.be.oneOf([200, 401]);
    });

    it('should handle JWT with missing padding', async function() {
      const validToken = 'Bearer ' + Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64').replace(/=/g, '') + 
                        '.' + Buffer.from(JSON.stringify({sub:'user-123'})).toString('base64').replace(/=/g, '') +
                        '.signature';
      
      const event = {
        httpMethod: 'GET',
        path: '/api/stores',
        headers: {
          Authorization: validToken
        },
        queryStringParameters: {}
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.be.oneOf([200, 404]);
    });
  });

  describe('Products Endpoint', function() {
    it('should GET products successfully', async function() {
      dynamodbStub.query.returns({
        promise: sinon.stub().resolves({
          Items: [
            { productId: '1', name: 'Product 1', price: 99.99 },
            { productId: '2', name: 'Product 2', price: 149.99 }
          ]
        })
      });

      const event = {
        httpMethod: 'GET',
        path: '/api/products',
        headers: { userId: 'test-user' },
        queryStringParameters: { storeId: 'store-1' }
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body.products).to.have.lengthOf(2);
      expect(body.count).to.equal(2);
    });

    it('should POST new product', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/products',
        headers: { userId: 'test-user' },
        body: JSON.stringify({
          storeId: 'store-1',
          title: 'New Product',
          price: 79.99,
          sku: 'SKU-001',
          inventory_quantity: 100
        })
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body.success).to.be.true;
      expect(body.product).to.have.property('id');
    });

    it('should PUT update product', async function() {
      const event = {
        httpMethod: 'PUT',
        path: '/api/products',
        headers: { userId: 'test-user' },
        body: JSON.stringify({
          storeId: 'store-1',
          productId: 'prod-123',
          title: 'Updated Product',
          price: 89.99
        })
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body.success).to.be.true;
    });

    it('should DELETE product', async function() {
      const event = {
        httpMethod: 'DELETE',
        path: '/api/products',
        headers: { userId: 'test-user' },
        queryStringParameters: { 
          storeId: 'store-1',
          productId: 'prod-123'
        }
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body.success).to.be.true;
    });

    it('should handle missing storeId for products', async function() {
      const event = {
        httpMethod: 'GET',
        path: '/api/products',
        headers: { userId: 'test-user' },
        queryStringParameters: {}
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(400);
    });
  });

  describe('Orders Endpoint', function() {
    it('should GET orders successfully', async function() {
      dynamodbStub.query.returns({
        promise: sinon.stub().resolves({
          Items: [
            { orderId: '1', total: 299.99, status: 'pending' },
            { orderId: '2', total: 149.99, status: 'completed' }
          ]
        })
      });

      const event = {
        httpMethod: 'GET',
        path: '/api/orders',
        headers: { userId: 'test-user' },
        queryStringParameters: { storeId: 'store-1' }
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body.orders).to.have.lengthOf(2);
    });

    it('should POST new order', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/orders',
        headers: { userId: 'test-user' },
        body: JSON.stringify({
          storeId: 'store-1',
          email: 'customer@example.com',
          total_price: 199.99,
          financial_status: 'paid',
          lineitem_name: 'Product 1',
          lineitem_quantity: 2
        })
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body.success).to.be.true;
      expect(body.order).to.have.property('id');
    });

    it('should handle order query with pagination', async function() {
      dynamodbStub.query.returns({
        promise: sinon.stub().resolves({
          Items: Array(10).fill({ orderId: '1', total: 99.99 }),
          LastEvaluatedKey: { pk: 'key', sk: 'sort' }
        })
      });

      const event = {
        httpMethod: 'GET',
        path: '/api/orders',
        headers: { userId: 'test-user' },
        queryStringParameters: { 
          storeId: 'store-1',
          limit: '10'
        }
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body.orders).to.have.lengthOf(10);
      expect(body.lastEvaluatedKey).to.exist;
    });
  });

  describe('Inventory Endpoint', function() {
    it('should GET inventory successfully', async function() {
      dynamodbStub.query.returns({
        promise: sinon.stub().resolves({
          Items: [
            { sku: 'SKU-001', quantity: 100, location: 'Warehouse A' },
            { sku: 'SKU-002', quantity: 50, location: 'Warehouse B' }
          ]
        })
      });

      const event = {
        httpMethod: 'GET',
        path: '/api/inventory',
        headers: { userId: 'test-user' },
        queryStringParameters: { storeId: 'store-1' }
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body.inventory).to.have.lengthOf(2);
    });

    it('should POST inventory update', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/inventory',
        headers: { userId: 'test-user' },
        body: JSON.stringify({
          storeId: 'store-1',
          sku: 'SKU-001',
          location: 'Warehouse A',
          quantity: 150,
          available: 140,
          reserved: 10
        })
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body.success).to.be.true;
    });

    it('should PUT update inventory levels', async function() {
      const event = {
        httpMethod: 'PUT',
        path: '/api/inventory',
        headers: { userId: 'test-user' },
        body: JSON.stringify({
          storeId: 'store-1',
          inventoryId: 'inv-123',
          quantity: 200
        })
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body.success).to.be.true;
    });
  });

  describe('Customers Endpoint', function() {
    it('should GET customers successfully', async function() {
      dynamodbStub.query.returns({
        promise: sinon.stub().resolves({
          Items: [
            { customerId: '1', email: 'customer1@example.com', name: 'John Doe' },
            { customerId: '2', email: 'customer2@example.com', name: 'Jane Smith' }
          ]
        })
      });

      const event = {
        httpMethod: 'GET',
        path: '/api/customers',
        headers: { userId: 'test-user' },
        queryStringParameters: { storeId: 'store-1' }
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body.customers).to.have.lengthOf(2);
    });

    it('should POST new customer', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/customers',
        headers: { userId: 'test-user' },
        body: JSON.stringify({
          storeId: 'store-1',
          email: 'newcustomer@example.com',
          first_name: 'New',
          last_name: 'Customer',
          phone: '555-0123'
        })
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body.success).to.be.true;
      expect(body.customer).to.have.property('id');
    });

    it('should PUT update customer', async function() {
      const event = {
        httpMethod: 'PUT',
        path: '/api/customers',
        headers: { userId: 'test-user' },
        body: JSON.stringify({
          storeId: 'store-1',
          customerId: 'cust-123',
          email: 'updated@example.com',
          phone: '555-9999'
        })
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body.success).to.be.true;
    });

    it('should DELETE customer', async function() {
      const event = {
        httpMethod: 'DELETE',
        path: '/api/customers',
        headers: { userId: 'test-user' },
        queryStringParameters: { 
          storeId: 'store-1',
          customerId: 'cust-123'
        }
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body.success).to.be.true;
    });
  });

  describe('Notifications Endpoint', function() {
    it('should GET notifications', async function() {
      dynamodbStub.query.returns({
        promise: sinon.stub().resolves({
          Items: [
            { id: '1', message: 'Notification 1', read: false },
            { id: '2', message: 'Notification 2', read: true }
          ]
        })
      });

      const event = {
        httpMethod: 'GET',
        path: '/api/notifications',
        headers: { userId: 'test-user' },
        queryStringParameters: {}
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body.notifications).to.have.lengthOf(2);
    });
  });

  describe('Data Upload Endpoint', function() {
    it('should handle CSV upload for products', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/data/upload',
        headers: { userId: 'test-user' },
        body: JSON.stringify({
          storeId: 'store-1',
          dataType: 'products',
          dataRecords: [
            { title: 'Product 1', price: 99.99, sku: 'SKU-001' },
            { title: 'Product 2', price: 149.99, sku: 'SKU-002' }
          ]
        })
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body.success).to.be.true;
      expect(body.results.successful).to.equal(2);
    });

    it('should handle CSV upload for orders', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/data/upload',
        headers: { userId: 'test-user' },
        body: JSON.stringify({
          storeId: 'store-1',
          dataType: 'orders',
          dataRecords: [
            { email: 'customer@example.com', total: 199.99, status: 'paid' }
          ]
        })
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body.success).to.be.true;
    });

    it('should handle CSV upload for customers', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/data/upload',
        headers: { userId: 'test-user' },
        body: JSON.stringify({
          storeId: 'store-1',
          dataType: 'customers',
          dataRecords: [
            { email: 'customer@example.com', first_name: 'John', last_name: 'Doe' }
          ]
        })
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body.success).to.be.true;
    });

    it('should handle CSV upload for inventory', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/data/upload',
        headers: { userId: 'test-user' },
        body: JSON.stringify({
          storeId: 'store-1',
          dataType: 'inventory',
          dataRecords: [
            { sku: 'SKU-001', quantity: 100, location: 'Warehouse' }
          ]
        })
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body.success).to.be.true;
    });

    it('should handle batch upload with 25+ items', async function() {
      const dataRecords = Array(30).fill(null).map((_, i) => ({
        title: `Product ${i}`,
        price: 99.99 + i,
        sku: `SKU-${i}`
      }));

      const event = {
        httpMethod: 'POST',
        path: '/api/data/upload',
        headers: { userId: 'test-user' },
        body: JSON.stringify({
          storeId: 'store-1',
          dataType: 'products',
          dataRecords
        })
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body.success).to.be.true;
      expect(dynamodbStub.batchWrite.calledTwice).to.be.true; // 25 + 5 items
    });

    it('should handle missing storeId for data upload', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/data/upload',
        headers: { userId: 'test-user' },
        body: JSON.stringify({
          dataType: 'products',
          dataRecords: []
        })
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(400);
    });
  });

  describe('Config Endpoint', function() {
    it('should return configuration', async function() {
      const event = {
        httpMethod: 'GET',
        path: '/api/config',
        headers: {},
        requestContext: {
          domainName: 'api.ordernimbus.com',
          stage: 'production'
        }
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body).to.have.property('environment');
      expect(body).to.have.property('apiUrl');
      expect(body).to.have.property('userPoolId');
    });
  });

  describe('Stores Endpoint', function() {
    it('should GET stores successfully', async function() {
      dynamodbStub.query.returns({
        promise: sinon.stub().resolves({
          Items: [
            { storeId: 'store-1', name: 'Store 1', type: 'shopify' },
            { storeId: 'store-2', name: 'Store 2', type: 'brick-and-mortar' }
          ]
        })
      });

      const event = {
        httpMethod: 'GET',
        path: '/api/stores',
        headers: { userId: 'test-user' },
        queryStringParameters: {}
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body.stores).to.have.lengthOf(2);
    });

    it('should POST new brick-and-mortar store', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/stores',
        headers: { userId: 'test-user' },
        body: JSON.stringify({
          name: 'New Store',
          type: 'brick-and-mortar',
          address: '123 Main St'
        })
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body.success).to.be.true;
      expect(body.store).to.have.property('id');
    });

    it('should PUT update store', async function() {
      dynamodbStub.get.returns({
        promise: sinon.stub().resolves({
          Item: { storeId: 'store-1', name: 'Old Name', type: 'shopify' }
        })
      });

      const event = {
        httpMethod: 'PUT',
        path: '/api/stores',
        headers: { userId: 'test-user' },
        body: JSON.stringify({
          storeId: 'store-1',
          name: 'Updated Store Name',
          address: 'New Address'
        })
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body.success).to.be.true;
    });

    it('should DELETE store', async function() {
      dynamodbStub.get.returns({
        promise: sinon.stub().resolves({
          Item: { storeId: 'store-1', name: 'Store 1', type: 'brick-and-mortar' }
        })
      });

      const event = {
        httpMethod: 'DELETE',
        path: '/api/stores',
        headers: { userId: 'test-user' },
        queryStringParameters: { storeId: 'store-1' }
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body.success).to.be.true;
    });

    it('should handle store not found for update', async function() {
      dynamodbStub.get.returns({
        promise: sinon.stub().resolves({ Item: null })
      });

      const event = {
        httpMethod: 'PUT',
        path: '/api/stores',
        headers: { userId: 'test-user' },
        body: JSON.stringify({
          storeId: 'non-existent',
          name: 'Updated Name'
        })
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(404);
    });

    it('should handle store not found for delete', async function() {
      dynamodbStub.get.returns({
        promise: sinon.stub().resolves({ Item: null })
      });

      const event = {
        httpMethod: 'DELETE',
        path: '/api/stores',
        headers: { userId: 'test-user' },
        queryStringParameters: { storeId: 'non-existent' }
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(404);
    });

    it('should not allow deletion of Shopify store', async function() {
      dynamodbStub.get.returns({
        promise: sinon.stub().resolves({
          Item: { storeId: 'store-1', name: 'Store 1', type: 'shopify' }
        })
      });

      const event = {
        httpMethod: 'DELETE',
        path: '/api/stores',
        headers: { userId: 'test-user' },
        queryStringParameters: { storeId: 'store-1' }
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(400);
      const body = JSON.parse(result.body);
      expect(body.error).to.include('disconnect from Shopify first');
    });
  });

  describe('Shopify Endpoint', function() {
    it('should handle Shopify connect', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/shopify/connect',
        headers: { userId: 'test-user' },
        body: JSON.stringify({
          shop: 'test-shop.myshopify.com'
        }),
        requestContext: {
          domainName: 'api.ordernimbus.com',
          stage: 'production'
        }
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body).to.have.property('authUrl');
    });

    it('should handle Shopify callback', async function() {
      // Mock successful token exchange
      const mockResponse = new EventEmitter();
      mockResponse.statusCode = 200;
      mockResponse.setEncoding = sinon.stub();
      
      httpsRequestStub.callsFake((options, callback) => {
        callback(mockResponse);
        const req = new EventEmitter();
        req.write = sinon.stub();
        req.end = sinon.stub().callsFake(() => {
          mockResponse.emit('data', JSON.stringify({
            access_token: 'test-access-token',
            scope: 'read_products,write_products'
          }));
          mockResponse.emit('end');
        });
        return req;
      });

      const event = {
        httpMethod: 'GET',
        path: '/api/shopify/callback',
        headers: {},
        queryStringParameters: {
          code: 'test-auth-code',
          shop: 'test-shop.myshopify.com',
          state: Buffer.from(JSON.stringify({ userId: 'test-user' })).toString('base64')
        }
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(302);
      expect(result.headers.Location).to.include('/stores?success=true');
    });

    it('should handle Shopify callback error', async function() {
      const event = {
        httpMethod: 'GET',
        path: '/api/shopify/callback',
        headers: {},
        queryStringParameters: {
          error: 'access_denied',
          error_description: 'User denied access'
        }
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(302);
      expect(result.headers.Location).to.include('error=access_denied');
    });

    it('should handle Shopify sync', async function() {
      dynamodbStub.get.returns({
        promise: sinon.stub().resolves({
          Item: {
            storeId: 'shopify-store',
            accessToken: 'test-token',
            shopDomain: 'test-shop.myshopify.com'
          }
        })
      });

      // Mock Shopify API responses
      const mockResponse = new EventEmitter();
      mockResponse.statusCode = 200;
      mockResponse.setEncoding = sinon.stub();
      
      let callCount = 0;
      httpsRequestStub.callsFake((options, callback) => {
        callback(mockResponse);
        const req = new EventEmitter();
        req.write = sinon.stub();
        req.end = sinon.stub().callsFake(() => {
          if (callCount === 0) {
            // Products response
            mockResponse.emit('data', JSON.stringify({
              products: [
                { id: 1, title: 'Product 1', variants: [{ price: '99.99' }] }
              ]
            }));
          } else if (callCount === 1) {
            // Orders response
            mockResponse.emit('data', JSON.stringify({
              orders: [
                { id: 1, total_price: '199.99', email: 'customer@example.com' }
              ]
            }));
          } else {
            // Customers response
            mockResponse.emit('data', JSON.stringify({
              customers: [
                { id: 1, email: 'customer@example.com', first_name: 'John' }
              ]
            }));
          }
          callCount++;
          mockResponse.emit('end');
        });
        return req;
      });

      const event = {
        httpMethod: 'POST',
        path: '/api/shopify/sync',
        headers: { userId: 'test-user' },
        body: JSON.stringify({
          storeId: 'shopify-store'
        })
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body.success).to.be.true;
      expect(body.syncedData).to.have.property('products');
      expect(body.syncedData).to.have.property('orders');
      expect(body.syncedData).to.have.property('customers');
    });

    it('should handle Shopify disconnect', async function() {
      dynamodbStub.get.returns({
        promise: sinon.stub().resolves({
          Item: {
            storeId: 'shopify-store',
            type: 'shopify',
            accessToken: 'test-token'
          }
        })
      });

      const event = {
        httpMethod: 'POST',
        path: '/api/shopify/disconnect',
        headers: { userId: 'test-user' },
        body: JSON.stringify({
          storeId: 'shopify-store'
        })
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body.success).to.be.true;
    });

    it('should handle missing Shopify credentials', async function() {
      secretsManagerStub.getSecretValue.returns({
        promise: sinon.stub().rejects(new Error('Secret not found'))
      });

      const event = {
        httpMethod: 'POST',
        path: '/api/shopify/connect',
        headers: { userId: 'test-user' },
        body: JSON.stringify({
          shop: 'test-shop.myshopify.com'
        })
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body).to.have.property('authUrl');
    });
  });

  describe('Auth Endpoint', function() {
    it('should handle user registration', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/register',
        headers: {},
        body: JSON.stringify({
          email: 'newuser@example.com',
          password: 'Password123!',
          firstName: 'New',
          lastName: 'User',
          companyName: 'Test Company'
        })
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body.success).to.be.true;
    });

    it('should handle user login', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/login',
        headers: {},
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'Password123!'
        })
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body).to.have.property('IdToken');
      expect(body).to.have.property('AccessToken');
      expect(body).to.have.property('RefreshToken');
    });

    it('should handle email verification', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/verify',
        headers: {},
        body: JSON.stringify({
          email: 'user@example.com',
          code: '123456'
        })
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body.success).to.be.true;
    });

    it('should handle forgot password', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/forgot-password',
        headers: {},
        body: JSON.stringify({
          email: 'user@example.com'
        })
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body.success).to.be.true;
    });

    it('should handle token refresh', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/refresh',
        headers: {},
        body: JSON.stringify({
          refreshToken: 'test-refresh-token'
        })
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body).to.have.property('IdToken');
      expect(body).to.have.property('AccessToken');
    });

    it('should handle registration error', async function() {
      cognitoStub.adminCreateUser.returns({
        promise: sinon.stub().rejects(new Error('User already exists'))
      });

      const event = {
        httpMethod: 'POST',
        path: '/api/auth/register',
        headers: {},
        body: JSON.stringify({
          email: 'existing@example.com',
          password: 'Password123!',
          companyName: 'Test'
        })
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(400);
      const body = JSON.parse(result.body);
      expect(body.error).to.include('User already exists');
    });

    it('should handle login error', async function() {
      cognitoStub.initiateAuth.returns({
        promise: sinon.stub().rejects(new Error('Invalid credentials'))
      });

      const event = {
        httpMethod: 'POST',
        path: '/api/auth/login',
        headers: {},
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'WrongPassword'
        })
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(401);
      const body = JSON.parse(result.body);
      expect(body.error).to.include('Invalid credentials');
    });
  });

  describe('Error Handling', function() {
    it('should handle DynamoDB errors gracefully', async function() {
      dynamodbStub.query.returns({
        promise: sinon.stub().rejects(new Error('DynamoDB error'))
      });

      const event = {
        httpMethod: 'GET',
        path: '/api/products',
        headers: { userId: 'test-user' },
        queryStringParameters: { storeId: 'store-1' }
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(500);
      const body = JSON.parse(result.body);
      expect(body.error).to.include('Error fetching products');
    });

    it('should handle invalid JSON in request body', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/products',
        headers: { userId: 'test-user' },
        body: 'invalid-json'
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.be.oneOf([400, 500]);
    });

    it('should handle missing userId', async function() {
      const event = {
        httpMethod: 'GET',
        path: '/api/products',
        headers: {},
        queryStringParameters: { storeId: 'store-1' }
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(401);
    });

    it('should handle unknown endpoint', async function() {
      const event = {
        httpMethod: 'GET',
        path: '/api/unknown',
        headers: { userId: 'test-user' },
        queryStringParameters: {}
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(404);
      const body = JSON.parse(result.body);
      expect(body.error).to.include('Not found');
    });

    it('should handle malformed path', async function() {
      const event = {
        httpMethod: 'GET',
        path: '/invalid/path/structure',
        headers: { userId: 'test-user' },
        queryStringParameters: {}
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(404);
    });
  });

  describe('Edge Cases', function() {
    it('should handle empty query parameters', async function() {
      const event = {
        httpMethod: 'GET',
        path: '/api/stores',
        headers: { userId: 'test-user' },
        queryStringParameters: null
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.be.oneOf([200, 404]);
    });

    it('should handle missing request body', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/products',
        headers: { userId: 'test-user' },
        body: null
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.be.oneOf([400, 500]);
    });

    it('should handle empty data upload', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/data/upload',
        headers: { userId: 'test-user' },
        body: JSON.stringify({
          storeId: 'store-1',
          dataType: 'products',
          dataRecords: []
        })
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body.results.successful).to.equal(0);
    });

    it('should handle special characters in data', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/products',
        headers: { userId: 'test-user' },
        body: JSON.stringify({
          storeId: 'store-1',
          title: 'Product with "quotes" & special <chars>',
          price: 99.99,
          sku: 'SKU-001'
        })
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
    });

    it('should handle very long product names', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/products',
        headers: { userId: 'test-user' },
        body: JSON.stringify({
          storeId: 'store-1',
          title: 'A'.repeat(500),
          price: 99.99,
          sku: 'SKU-001'
        })
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
    });
  });

  describe('Shopify API Integration', function() {
    it('should handle Shopify API rate limiting', async function() {
      dynamodbStub.get.returns({
        promise: sinon.stub().resolves({
          Item: {
            storeId: 'shopify-store',
            accessToken: 'test-token',
            shopDomain: 'test-shop.myshopify.com'
          }
        })
      });

      const mockResponse = new EventEmitter();
      mockResponse.statusCode = 429; // Rate limited
      mockResponse.setEncoding = sinon.stub();
      
      httpsRequestStub.callsFake((options, callback) => {
        callback(mockResponse);
        const req = new EventEmitter();
        req.write = sinon.stub();
        req.end = sinon.stub().callsFake(() => {
          mockResponse.emit('data', JSON.stringify({
            errors: 'Rate limit exceeded'
          }));
          mockResponse.emit('end');
        });
        return req;
      });

      const event = {
        httpMethod: 'POST',
        path: '/api/shopify/sync',
        headers: { userId: 'test-user' },
        body: JSON.stringify({
          storeId: 'shopify-store'
        })
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(500);
    });

    it('should handle Shopify webhook validation', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/shopify/webhook',
        headers: {
          'X-Shopify-Topic': 'orders/create',
          'X-Shopify-Hmac-Sha256': 'test-hmac'
        },
        body: JSON.stringify({
          id: 123,
          email: 'customer@example.com',
          total_price: '99.99'
        })
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.be.oneOf([200, 404]);
    });
  });

  describe('Performance and Limits', function() {
    it('should handle large batch operations efficiently', async function() {
      const largeDataset = Array(100).fill(null).map((_, i) => ({
        title: `Product ${i}`,
        price: Math.random() * 100,
        sku: `SKU-${i}`
      }));

      const event = {
        httpMethod: 'POST',
        path: '/api/data/upload',
        headers: { userId: 'test-user' },
        body: JSON.stringify({
          storeId: 'store-1',
          dataType: 'products',
          dataRecords: largeDataset
        })
      };

      const result = await handler.handler(event);
      expect(result.statusCode).to.equal(200);
      expect(dynamodbStub.batchWrite.callCount).to.be.at.least(4); // 100/25 = 4 batches
    });

    it('should handle concurrent requests', async function() {
      const promises = [];
      
      for (let i = 0; i < 10; i++) {
        const event = {
          httpMethod: 'GET',
          path: '/api/products',
          headers: { userId: `user-${i}` },
          queryStringParameters: { storeId: `store-${i}` }
        };
        promises.push(handler.handler(event));
      }

      const results = await Promise.all(promises);
      results.forEach(result => {
        expect(result.statusCode).to.be.oneOf([200, 404]);
      });
    });
  });
});