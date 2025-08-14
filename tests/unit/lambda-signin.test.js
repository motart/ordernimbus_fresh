/**
 * Unit Tests for UC002: Sign-In Flow
 * Tests the Lambda handler's auth/login endpoint with proper AWS SDK mocking
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

describe('UC002: Sign-In Flow Tests - Fixed', function() {
  let handler;
  let cognitoStub;
  let dynamodbStub;
  let secretsManagerStub;
  let clock;

  beforeEach(function() {
    // Use fake timers for testing time-based features
    clock = sinon.useFakeTimers();
    
    // Create fresh stubs for each test
    cognitoStub = {
      adminInitiateAuth: sinon.stub(),
      adminGetUser: sinon.stub(),
      adminUpdateUserAttributes: sinon.stub(),
      globalSignOut: sinon.stub(),
      forgotPassword: sinon.stub(),
      adminCreateUser: sinon.stub(),
      adminSetUserPassword: sinon.stub()
    };

    dynamodbStub = {
      put: sinon.stub(),
      get: sinon.stub(),
      update: sinon.stub(),
      query: sinon.stub(),
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

  afterEach(function() {
    clock.restore();
  });

  describe('POST /api/auth/login - Basic Authentication', function() {
    /**
     * Test successful authentication with valid credentials
     * Verifies JWT tokens are returned properly
     */
    it('should successfully authenticate valid user credentials', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/login',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'https://app.ordernimbus.com'
        },
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'ValidPassword123!'
        }),
        requestContext: {
          http: { method: 'POST' },
          identity: { sourceIp: '192.168.1.1' }
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
      expect(body.tokens.ExpiresIn).to.equal(3600);
      expect(body.tokens.TokenType).to.equal('Bearer');
    });

    /**
     * Test login rejection with missing email
     * Ensures proper validation
     */
    it('should reject login with missing email', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/login',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'https://app.ordernimbus.com'
        },
        body: JSON.stringify({
          password: 'ValidPassword123!'
        }),
        requestContext: {
          http: { method: 'POST' }
        }
      };

      const response = await handler(event);
      
      expect(response.statusCode).to.equal(400);
      const body = JSON.parse(response.body);
      expect(body.success).to.be.false;
      expect(body.error).to.include('Email and password required');
    });

    /**
     * Test login rejection with missing password
     * Ensures proper validation
     */
    it('should reject login with missing password', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/login',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'https://app.ordernimbus.com'
        },
        body: JSON.stringify({
          email: 'user@example.com'
        }),
        requestContext: {
          http: { method: 'POST' }
        }
      };

      const response = await handler(event);
      
      expect(response.statusCode).to.equal(400);
      const body = JSON.parse(response.body);
      expect(body.success).to.be.false;
      expect(body.error).to.include('Email and password required');
    });

    /**
     * Test handling of invalid credentials
     * Ensures proper error message for wrong password
     */
    it('should handle invalid credentials gracefully', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/login',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'https://app.ordernimbus.com'
        },
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'WrongPassword123!'
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
     * Test handling of non-existent user
     * Should not reveal user doesn't exist (security)
     */
    it('should handle user not found error', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/login',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'https://app.ordernimbus.com'
        },
        body: JSON.stringify({
          email: 'nonexistent@example.com',
          password: 'Password123!'
        }),
        requestContext: {
          http: { method: 'POST' }
        }
      };

      // Mock user not found
      cognitoStub.adminInitiateAuth.returns({
        promise: () => Promise.reject({
          code: 'UserNotFoundException',
          message: 'User does not exist'
        })
      });

      const response = await handler(event);
      
      expect(response.statusCode).to.equal(401);
      const body = JSON.parse(response.body);
      expect(body.success).to.be.false;
      expect(body.error).to.equal('Login failed'); // Generic error for security
    });
  });

  describe('POST /api/auth/refresh - Token Refresh', function() {
    /**
     * Test successful token refresh
     * Verifies new tokens are generated
     */
    it('should successfully refresh access token', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/refresh',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'https://app.ordernimbus.com'
        },
        body: JSON.stringify({
          refreshToken: 'valid-refresh-token'
        }),
        requestContext: {
          http: { method: 'POST' }
        }
      };

      // Mock successful token refresh
      cognitoStub.adminInitiateAuth.returns({
        promise: () => Promise.resolve({
          AuthenticationResult: {
            AccessToken: 'new-access-token',
            IdToken: 'new-id-token',
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
      expect(body.tokens.AccessToken).to.equal('new-access-token');
      expect(body.tokens.IdToken).to.equal('new-id-token');
      expect(body.tokens.ExpiresIn).to.equal(3600);
    });

    /**
     * Test invalid refresh token handling
     * Ensures proper error for expired/invalid tokens
     */
    it('should reject invalid refresh token', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/refresh',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'https://app.ordernimbus.com'
        },
        body: JSON.stringify({
          refreshToken: 'invalid-refresh-token'
        }),
        requestContext: {
          http: { method: 'POST' }
        }
      };

      // Mock refresh token failure
      cognitoStub.adminInitiateAuth.returns({
        promise: () => Promise.reject({
          code: 'NotAuthorizedException',
          message: 'Refresh Token has expired'
        })
      });

      const response = await handler(event);
      
      expect(response.statusCode).to.equal(401);
      const body = JSON.parse(response.body);
      expect(body.success).to.be.false;
      expect(body.error).to.equal('Invalid refresh token');
    });
  });

  describe('POST /api/auth/forgot-password - Password Reset', function() {
    /**
     * Test password reset initiation
     * Verifies reset email is triggered
     */
    it('should initiate password reset for valid email', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/forgot-password',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'https://app.ordernimbus.com'
        },
        body: JSON.stringify({
          email: 'user@example.com'
        }),
        requestContext: {
          http: { method: 'POST' }
        }
      };

      // Mock successful password reset initiation
      cognitoStub.forgotPassword.returns({
        promise: () => Promise.resolve({
          CodeDeliveryDetails: {
            Destination: 'u***@e***.com',
            DeliveryMedium: 'EMAIL'
          }
        })
      });

      const response = await handler(event);
      
      expect(response.statusCode).to.equal(200);
      const body = JSON.parse(response.body);
      expect(body.success).to.be.true;
      expect(body.message).to.include('reset');
    });

    /**
     * Test password reset for non-existent email
     * Should still return success to prevent user enumeration
     */
    it('should return success even for non-existent email (security)', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/forgot-password',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'https://app.ordernimbus.com'
        },
        body: JSON.stringify({
          email: 'nonexistent@example.com'
        }),
        requestContext: {
          http: { method: 'POST' }
        }
      };

      // Mock user not found error
      cognitoStub.forgotPassword.returns({
        promise: () => Promise.reject({
          code: 'UserNotFoundException',
          message: 'User does not exist'
        })
      });

      const response = await handler(event);
      
      // Should still return success to prevent user enumeration
      expect(response.statusCode).to.equal(200);
      const body = JSON.parse(response.body);
      expect(body.success).to.be.true;
      expect(body.message).to.include('If the email exists');
    });
  });

  describe('Security Features', function() {
    /**
     * Test CORS headers for different origins
     * Ensures proper CORS configuration
     */
    it('should include proper CORS headers for all origins', async function() {
      const origins = [
        'https://app.ordernimbus.com',
        'http://localhost:3000',
        'http://app.ordernimbus.com'
      ];

      for (const origin of origins) {
        const event = {
          httpMethod: 'OPTIONS',
          path: '/api/auth/login',
          headers: {
            'origin': origin
          },
          requestContext: {
            http: { method: 'OPTIONS' }
          }
        };

        const response = await handler(event);
        
        expect(response.statusCode).to.equal(200);
        expect(response.headers['Access-Control-Allow-Origin']).to.equal(origin);
        expect(response.headers['Access-Control-Allow-Methods']).to.include('POST');
        expect(response.headers['Access-Control-Allow-Headers']).to.include('Content-Type');
        expect(response.headers['Access-Control-Allow-Credentials']).to.equal('true');
      }
    });

    /**
     * Test CORS preflight handling
     * Ensures OPTIONS requests are handled correctly
     */
    it('should handle CORS preflight requests', async function() {
      const event = {
        httpMethod: 'OPTIONS',
        path: '/api/auth/login',
        headers: {
          'origin': 'https://app.ordernimbus.com',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type'
        },
        requestContext: {
          http: { method: 'OPTIONS' }
        }
      };

      const response = await handler(event);
      
      expect(response.statusCode).to.equal(200);
      expect(response.headers['Access-Control-Allow-Origin']).to.exist;
      expect(response.headers['Access-Control-Max-Age']).to.equal('86400');
    });
  });
});

// Export for test runner
module.exports = {};