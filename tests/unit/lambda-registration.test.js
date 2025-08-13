/**
 * Unit Tests for Lambda Registration Endpoint
 * Tests the actual Lambda handler function
 */

const { expect } = require('chai');
const sinon = require('sinon');
const AWS = require('aws-sdk');

// Set up environment variables
process.env.TABLE_NAME = 'test-table';
process.env.USER_POOL_ID = 'test-pool-id';
process.env.USER_POOL_CLIENT_ID = 'test-client-id';
process.env.ENVIRONMENT = 'test';

// Create stubs for AWS services with promise support
const cognitoStub = {
  adminCreateUser: sinon.stub().returns({ promise: sinon.stub() }),
  adminSetUserPassword: sinon.stub().returns({ promise: sinon.stub() }),
  adminInitiateAuth: sinon.stub().returns({ promise: sinon.stub() }),
  forgotPassword: sinon.stub().returns({ promise: sinon.stub() })
};

const dynamodbStub = {
  put: sinon.stub().returns({ promise: sinon.stub() }),
  get: sinon.stub().returns({ promise: sinon.stub() }),
  delete: sinon.stub().returns({ promise: sinon.stub() })
};

// Mock AWS SDK - Create a constructor that returns our stub
AWS.CognitoIdentityServiceProvider = sinon.stub().returns(cognitoStub);

AWS.DynamoDB.DocumentClient = sinon.stub().returns(dynamodbStub);

AWS.SecretsManager = function() {
  return {
    getSecretValue: sinon.stub().returns({
      promise: () => Promise.resolve({
        SecretString: JSON.stringify({
          SHOPIFY_CLIENT_ID: 'test-client-id',
          SHOPIFY_CLIENT_SECRET: 'test-client-secret'
        })
      })
    })
  };
};

// Import the Lambda handler after mocking AWS
const { handler } = require('../../app/frontend/lambda-main-check/index');

describe('Lambda Registration Endpoint Tests', function() {
  beforeEach(function() {
    // Reset all stubs
    cognitoStub.adminCreateUser = sinon.stub().returns({ promise: sinon.stub() });
    cognitoStub.adminSetUserPassword = sinon.stub().returns({ promise: sinon.stub() });
    cognitoStub.adminInitiateAuth = sinon.stub().returns({ promise: sinon.stub() });
    dynamodbStub.put = sinon.stub().returns({ promise: sinon.stub().resolves({}) });
    dynamodbStub.get = sinon.stub().returns({ promise: sinon.stub().resolves({}) });
    dynamodbStub.delete = sinon.stub().returns({ promise: sinon.stub().resolves({}) });
  });

  describe('POST /api/auth/register', function() {
    it('should register a new user successfully', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/register',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'http://localhost:3000'
        },
        body: JSON.stringify({
          email: 'newuser@example.com',
          password: 'TestPassword123!',
          companyName: 'Test Company',
          firstName: 'John',
          lastName: 'Doe'
        }),
        requestContext: {
          http: { method: 'POST' }
        }
      };

      // Mock successful Cognito user creation
      cognitoStub.adminCreateUser = sinon.stub().returns({
        promise: () => Promise.resolve({
          User: {
            Username: 'newuser@example.com',
            Attributes: [
              { Name: 'email', Value: 'newuser@example.com' }
            ]
          }
        })
      });

      cognitoStub.adminSetUserPassword = sinon.stub().returns({
        promise: () => Promise.resolve({})
      });
      
      // Mock DynamoDB put
      dynamodbStub.put = sinon.stub().returns({
        promise: () => Promise.resolve({})
      });

      const response = await handler(event);
      
      expect(response.statusCode).to.equal(200);
      const body = JSON.parse(response.body);
      expect(body.success).to.be.true;
      expect(body.message).to.equal('Registration successful');
      expect(body.companyName).to.equal('Test Company');
    });

    it('should reject registration with missing email', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/register',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'http://localhost:3000'
        },
        body: JSON.stringify({
          password: 'TestPassword123!',
          companyName: 'Test Company'
        }),
        requestContext: {
          http: { method: 'POST' }
        }
      };

      const response = await handler(event);
      
      expect(response.statusCode).to.equal(400);
      const body = JSON.parse(response.body);
      expect(body.success).to.be.false;
      expect(body.error).to.include('Email');
    });

    it('should reject registration with missing password', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/register',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'http://localhost:3000'
        },
        body: JSON.stringify({
          email: 'test@example.com',
          companyName: 'Test Company'
        }),
        requestContext: {
          http: { method: 'POST' }
        }
      };

      const response = await handler(event);
      
      expect(response.statusCode).to.equal(400);
      const body = JSON.parse(response.body);
      expect(body.success).to.be.false;
      expect(body.error).to.include('password');
    });

    it('should reject registration with missing company name', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/register',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'http://localhost:3000'
        },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'TestPassword123!'
        }),
        requestContext: {
          http: { method: 'POST' }
        }
      };

      const response = await handler(event);
      
      expect(response.statusCode).to.equal(400);
      const body = JSON.parse(response.body);
      expect(body.success).to.be.false;
      expect(body.error).to.include('company name');
    });

    it('should handle duplicate user error', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/register',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'http://localhost:3000'
        },
        body: JSON.stringify({
          email: 'existing@example.com',
          password: 'TestPassword123!',
          companyName: 'Test Company'
        }),
        requestContext: {
          http: { method: 'POST' }
        }
      };

      // Mock user already exists error
      cognitoStub.adminCreateUser = sinon.stub().returns({
        promise: () => Promise.reject({
          code: 'UsernameExistsException',
          message: 'User already exists'
        })
      });

      const response = await handler(event);
      
      expect(response.statusCode).to.equal(400);
      const body = JSON.parse(response.body);
      expect(body.success).to.be.false;
      expect(body.error).to.equal('User already exists');
    });

    it('should include proper CORS headers', async function() {
      const event = {
        httpMethod: 'OPTIONS',
        path: '/api/auth/register',
        headers: {
          'origin': 'http://localhost:3000'
        },
        requestContext: {
          http: { method: 'OPTIONS' }
        }
      };

      const response = await handler(event);
      
      expect(response.statusCode).to.equal(200);
      expect(response.headers['Access-Control-Allow-Origin']).to.equal('http://localhost:3000');
      expect(response.headers['Access-Control-Allow-Methods']).to.include('POST');
      expect(response.headers['Access-Control-Allow-Headers']).to.include('Content-Type');
    });

    it('should generate unique company ID', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/register',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'http://localhost:3000'
        },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'TestPassword123!',
          companyName: 'Test Company'
        }),
        requestContext: {
          http: { method: 'POST' }
        }
      };

      cognitoStub.adminCreateUser = sinon.stub().returns({
        promise: () => Promise.resolve({
          User: { Username: 'test@example.com' }
        })
      });
      cognitoStub.adminSetUserPassword = sinon.stub().returns({
        promise: () => Promise.resolve({})
      });
      dynamodbStub.put = sinon.stub().returns({
        promise: () => Promise.resolve({})
      });

      const response = await handler(event);
      const body = JSON.parse(response.body);
      
      expect(body.companyId).to.match(/^company-\d+-[a-z0-9]+$/);
    });
  });

  describe('POST /api/auth/login', function() {
    it('should login user successfully', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/login',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'http://localhost:3000'
        },
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'TestPassword123!'
        }),
        requestContext: {
          http: { method: 'POST' }
        }
      };

      // Mock successful authentication
      cognitoStub.adminInitiateAuth = sinon.stub().returns({
        promise: () => Promise.resolve({
          AuthenticationResult: {
            AccessToken: 'test-access-token',
            RefreshToken: 'test-refresh-token',
            IdToken: 'test-id-token',
            ExpiresIn: 3600,
            TokenType: 'Bearer'
          }
        })
      });

      const response = await handler(event);
      
      expect(response.statusCode).to.equal(200);
      const body = JSON.parse(response.body);
      expect(body.success).to.be.true;
      expect(body.tokens).to.exist;
      expect(body.tokens.AccessToken).to.equal('test-access-token');
    });

    it('should reject login with invalid credentials', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/login',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'http://localhost:3000'
        },
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'WrongPassword'
        }),
        requestContext: {
          http: { method: 'POST' }
        }
      };

      // Mock authentication failure
      cognitoStub.adminInitiateAuth = sinon.stub().returns({
        promise: () => Promise.reject({
          code: 'NotAuthorizedException',
          message: 'Incorrect username or password'
        })
      });

      const response = await handler(event);
      
      expect(response.statusCode).to.equal(401);
      const body = JSON.parse(response.body);
      expect(body.success).to.be.false;
      expect(body.error).to.equal('Invalid credentials');
    });
  });
});