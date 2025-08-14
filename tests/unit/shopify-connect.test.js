const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

describe('Shopify Connection Flow', () => {
  let handler;
  let ssmStub;
  let dynamodbStub;
  let fetchStub;
  
  beforeEach(() => {
    // Mock AWS SSM
    ssmStub = {
      getParameter: sinon.stub().returns({
        promise: sinon.stub().resolves({
          Parameter: {
            Value: JSON.stringify({
              SHOPIFY_CLIENT_ID: 'test-client-id',
              SHOPIFY_CLIENT_SECRET: 'test-client-secret',
              SHOPIFY_APP_URL: 'https://app.ordernimbus.com',
              SHOPIFY_REDIRECT_URI: 'https://api.ordernimbus.com/shopify/callback'
            })
          }
        })
      })
    };
    
    // Mock DynamoDB
    dynamodbStub = {
      put: sinon.stub().returns({
        promise: sinon.stub().resolves({})
      }),
      get: sinon.stub().returns({
        promise: sinon.stub().resolves({
          Item: {
            storeId: 'test-store',
            apiKey: 'test-api-key'
          }
        })
      })
    };
    
    // Mock fetch for Shopify API calls
    fetchStub = sinon.stub();
    global.fetch = fetchStub;
    
    // Load handler with mocked dependencies
    const AWS = {
      SSM: sinon.stub().returns(ssmStub),
      DynamoDB: {
        DocumentClient: sinon.stub().returns(dynamodbStub)
      }
    };
    
    // Also need to stub axios for the Shopify API calls
    const axiosStub = {
      post: sinon.stub().resolves({
        data: { access_token: 'test-access-token' }
      })
    };
    
    handler = proxyquire('../../lambda/shopify-integration', {
      'aws-sdk': AWS,
      'axios': axiosStub
    }).handler;
  });
  
  afterEach(() => {
    sinon.restore();
    delete global.fetch;
  });
  
  describe('OAuth Connection Flow', () => {
    it('should generate correct OAuth URL with API Gateway context', async () => {
      const event = {
        path: '/api/shopify/connect',
        body: JSON.stringify({
          userId: 'test-user-id',
          storeDomain: 'test-store.myshopify.com'
        }),
        requestContext: {
          domainName: '7tdwngcc30.execute-api.us-west-1.amazonaws.com',
          stage: 'production'
        }
      };
      
      const result = await handler(event);
      
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      expect(body.authUrl).to.include('test-store.myshopify.com/admin/oauth/authorize');
      expect(body.authUrl).to.include('client_id=test-client-id');
      // The redirect URI should be dynamically generated, just check it exists
      expect(body.authUrl).to.include('redirect_uri=');
      expect(body.authUrl).to.include('api/shopify/callback');
    });
    
    it('should handle OAuth callback successfully', async () => {
      // Mock successful token exchange
      fetchStub.resolves({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test-access-token'
        })
      });
      
      const event = {
        path: '/api/shopify/callback',
        queryStringParameters: {
          code: 'test-auth-code',
          shop: 'test-store.myshopify.com',
          state: JSON.stringify({
            userId: 'test-user-id',
            storeDomain: 'test-store.myshopify.com'
          })
        }
      };
      
      const result = await handler(event);
      
      expect(result.statusCode).to.equal(200);
      expect(result.headers['Content-Type']).to.equal('text/html');
      expect(result.body).to.include('shopify-oauth-success');
      
      // Verify store was saved to DynamoDB
      expect(dynamodbStub.put.calledOnce).to.be.true;
      const putCall = dynamodbStub.put.getCall(0);
      expect(putCall.args[0].Item.storeId).to.equal('test-store');
      expect(putCall.args[0].Item.apiKey).to.equal('test-access-token');
    });
    
    it('should handle OAuth error gracefully', async () => {
      const event = {
        path: '/api/shopify/callback',
        queryStringParameters: {
          error: 'access_denied',
          error_description: 'User denied access'
        }
      };
      
      const result = await handler(event);
      
      expect(result.statusCode).to.equal(400);
      expect(result.body).to.include('shopify-oauth-error');
      expect(result.body).to.include('access_denied');
    });
    
    it('should reject callback with missing parameters', async () => {
      const event = {
        path: '/api/shopify/callback',
        queryStringParameters: {
          code: 'test-auth-code'
          // Missing shop and state
        }
      };
      
      const result = await handler(event);
      
      expect(result.statusCode).to.equal(400);
      expect(result.body).to.include('shopify-oauth-error');
      expect(result.body).to.include('Missing required parameters');
    });
    
    it('should use fallback redirect URI when API Gateway context is missing', async () => {
      const event = {
        path: '/api/shopify/connect',
        body: JSON.stringify({
          userId: 'test-user-id',
          storeDomain: 'test-store.myshopify.com'
        })
        // No requestContext
      };
      
      process.env.ENVIRONMENT = 'production';
      
      const result = await handler(event);
      
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      // The redirect URI should be dynamically generated, just check it exists
      expect(body.authUrl).to.include('redirect_uri=');
      expect(body.authUrl).to.include('api/shopify/callback');
      
      delete process.env.ENVIRONMENT;
    });
  });
  
  describe('Store Data Management', () => {
    it('should save store credentials securely after OAuth', async () => {
      fetchStub.resolves({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test-access-token'
        })
      });
      
      const event = {
        path: '/api/shopify/callback',
        queryStringParameters: {
          code: 'test-auth-code',
          shop: 'test-store.myshopify.com',
          state: JSON.stringify({
            userId: 'test-user-id',
            storeDomain: 'test-store.myshopify.com'
          })
        }
      };
      
      await handler(event);
      
      // Check DynamoDB save
      const putCall = dynamodbStub.put.getCall(0);
      expect(putCall.args[0].TableName).to.include('stores');
      expect(putCall.args[0].Item).to.deep.include({
        userId: 'test-user-id',
        storeId: 'test-store',
        shopifyDomain: 'test-store.myshopify.com',
        apiKey: 'test-access-token',
        status: 'active',
        type: 'shopify'
      });
    });
    
    it('should not expose sensitive credentials in responses', async () => {
      const event = {
        path: '/api/shopify/connect',
        body: JSON.stringify({
          userId: 'test-user-id',
          storeDomain: 'test-store.myshopify.com'
        })
      };
      
      const result = await handler(event);
      const body = JSON.parse(result.body);
      
      // Should not contain client secret
      expect(body).to.not.have.property('clientSecret');
      expect(body).to.not.have.property('apiSecret');
      expect(JSON.stringify(body)).to.not.include('test-client-secret');
    });
  });
  
  describe('Error Handling', () => {
    it('should handle SSM parameter retrieval failure', async () => {
      ssmStub.getParameter.returns({
        promise: sinon.stub().rejects(new Error('Parameter not found'))
      });
      
      const event = {
        path: '/api/shopify/connect',
        body: JSON.stringify({
          userId: 'test-user-id',
          storeDomain: 'test-store.myshopify.com'
        })
      };
      
      const result = await handler(event);
      
      expect(result.statusCode).to.equal(500);
      const body = JSON.parse(result.body);
      expect(body.error).to.include('Failed to get Shopify credentials');
    });
    
    it('should handle invalid store domain format', async () => {
      const event = {
        path: '/api/shopify/connect',
        body: JSON.stringify({
          userId: 'test-user-id',
          storeDomain: 'invalid-domain'
        })
      };
      
      const result = await handler(event);
      
      expect(result.statusCode).to.equal(200);
      const body = JSON.parse(result.body);
      // Should auto-append .myshopify.com
      expect(body.authUrl).to.include('invalid-domain.myshopify.com');
    });
    
    it('should handle Shopify API token exchange failure', async () => {
      fetchStub.resolves({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          error: 'invalid_client'
        })
      });
      
      const event = {
        path: '/api/shopify/callback',
        queryStringParameters: {
          code: 'invalid-code',
          shop: 'test-store.myshopify.com',
          state: JSON.stringify({
            userId: 'test-user-id',
            storeDomain: 'test-store.myshopify.com'
          })
        }
      };
      
      const result = await handler(event);
      
      expect(result.statusCode).to.equal(500);
      expect(result.body).to.include('shopify-oauth-error');
      expect(result.body).to.include('Failed to exchange code for access token');
    });
  });
});