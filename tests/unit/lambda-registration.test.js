/**
 * Unit Tests for Lambda Registration Endpoint
 * Tests the actual Lambda handler function with proper AWS SDK mocking
 * 
 * Requirements:
 * - All tests must pass
 * - Every code change needs test coverage
 * - All code must have comments
 */

const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

// Set up environment variables
process.env.TABLE_NAME = 'test-table';
process.env.USER_POOL_ID = 'test-pool-id';
process.env.USER_POOL_CLIENT_ID = 'test-client-id';
process.env.ENVIRONMENT = 'test';

describe('Lambda Registration Endpoint Tests - Fixed', function() {
  let handler;
  let cognitoStub;
  let dynamodbStub;
  let secretsManagerStub;

  beforeEach(function() {
    // Create fresh stubs for each test
    cognitoStub = {
      adminCreateUser: sinon.stub(),
      adminSetUserPassword: sinon.stub(),
      adminInitiateAuth: sinon.stub(),
      forgotPassword: sinon.stub()
    };

    dynamodbStub = {
      put: sinon.stub(),
      get: sinon.stub(),
      delete: sinon.stub()
    };

    secretsManagerStub = {
      getSecretValue: sinon.stub().returns({
        promise: () => Promise.resolve({
          SecretString: JSON.stringify({
            SHOPIFY_CLIENT_ID: 'test-client-id',
            SHOPIFY_CLIENT_SECRET: 'test-client-secret'
          })
        })
      })
    };

    // Create AWS mock that returns our stubs when instantiated
    const AWSMock = {
      CognitoIdentityServiceProvider: sinon.stub().returns(cognitoStub),
      DynamoDB: {
        DocumentClient: sinon.stub().returns(dynamodbStub)
      },
      SecretsManager: sinon.stub().returns(secretsManagerStub)
    };

    // Use proxyquire to inject our mocked AWS SDK
    const lambdaModule = proxyquire('../../app/frontend/lambda-main-check/index', {
      'aws-sdk': AWSMock
    });

    handler = lambdaModule.handler;
  });

  describe('POST /api/auth/register', function() {
    /**
     * Test successful user registration
     * Verifies that a new user can be created with all required fields
     */
    it('should register a new user successfully', async function() {
      // Arrange: Set up test data
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
      cognitoStub.adminCreateUser.returns({
        promise: () => Promise.resolve({
          User: {
            Username: 'newuser@example.com',
            Attributes: [
              { Name: 'email', Value: 'newuser@example.com' }
            ]
          }
        })
      });

      cognitoStub.adminSetUserPassword.returns({
        promise: () => Promise.resolve({})
      });

      // Mock successful DynamoDB write
      dynamodbStub.put.returns({
        promise: () => Promise.resolve({})
      });

      // Act: Call the handler
      const response = await handler(event);
      
      // Assert: Verify the response
      expect(response.statusCode).to.equal(200);
      const body = JSON.parse(response.body);
      expect(body.success).to.be.true;
      expect(body.message).to.include('verification code');
      expect(body.needsVerification).to.be.true;
      expect(body.companyName).to.equal('Test Company');
      expect(body.companyId).to.match(/^company-\d+-[a-z0-9]+$/);
      
      // Verify AWS SDK methods were called
      expect(cognitoStub.adminCreateUser.calledOnce).to.be.true;
      expect(cognitoStub.adminSetUserPassword.calledOnce).to.be.true;
      expect(dynamodbStub.put.calledOnce).to.be.true;
    });

    /**
     * Test registration validation - missing email
     * Ensures proper error handling when email is not provided
     */
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

    /**
     * Test duplicate user error handling
     * Verifies proper error message when user already exists
     */
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
          companyName: 'Test Company',
          firstName: 'John',
          lastName: 'Doe'
        }),
        requestContext: {
          http: { method: 'POST' }
        }
      };

      // Mock user already exists error
      cognitoStub.adminCreateUser.returns({
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

    /**
     * Test CORS headers
     * Ensures OPTIONS requests are handled properly for CORS
     */
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
  });

  describe('POST /api/auth/login', function() {
    /**
     * Test successful login
     * Verifies that valid credentials return JWT tokens
     */
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
      cognitoStub.adminInitiateAuth.returns({
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
      expect(body.tokens.RefreshToken).to.equal('test-refresh-token');
      expect(body.tokens.IdToken).to.equal('test-id-token');
      
      // Verify Cognito was called correctly
      expect(cognitoStub.adminInitiateAuth.calledOnce).to.be.true;
      const authCall = cognitoStub.adminInitiateAuth.getCall(0);
      expect(authCall.args[0].AuthParameters.USERNAME).to.equal('user@example.com');
      expect(authCall.args[0].AuthParameters.PASSWORD).to.equal('TestPassword123!');
    });

    /**
     * Test invalid credentials
     * Ensures proper error handling for wrong password
     */
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
      cognitoStub.adminInitiateAuth.returns({
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

    /**
     * Test missing credentials
     * Ensures proper validation when email/password missing
     */
    it('should reject login with missing credentials', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/login',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'http://localhost:3000'
        },
        body: JSON.stringify({
          email: 'user@example.com'
          // Missing password
        }),
        requestContext: {
          http: { method: 'POST' }
        }
      };

      const response = await handler(event);
      
      expect(response.statusCode).to.equal(400);
      const body = JSON.parse(response.body);
      expect(body.success).to.be.false;
      expect(body.error).to.include('required');
    });
  });
});

// Export for test runner
module.exports = {};