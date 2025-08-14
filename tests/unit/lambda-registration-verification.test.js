/**
 * Unit Tests for UC001: Registration with Email Verification
 * Tests the complete registration and verification flow
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

describe('UC001: Registration with Email Verification Tests', function() {
  let handler;
  let cognitoStub;
  let dynamodbStub;
  let secretsManagerStub;

  beforeEach(function() {
    // Create fresh stubs for each test
    cognitoStub = {
      adminCreateUser: sinon.stub(),
      adminSetUserPassword: sinon.stub(),
      adminUpdateUserAttributes: sinon.stub(),
      confirmSignUp: sinon.stub(),
      adminInitiateAuth: sinon.stub()
    };

    dynamodbStub = {
      put: sinon.stub(),
      get: sinon.stub(),
      query: sinon.stub(),
      update: sinon.stub(),
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

  describe('POST /api/auth/register - Registration with Verification', function() {
    /**
     * Test successful registration with email verification required
     * Verifies that email_verified is set to false and verification email is sent
     */
    it('should register user and require email verification', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/register',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'https://app.ordernimbus.com'
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
            UserStatus: 'FORCE_CHANGE_PASSWORD',
            Attributes: [
              { Name: 'email', Value: 'newuser@example.com' }
            ]
          }
        })
      });

      cognitoStub.adminSetUserPassword.returns({
        promise: () => Promise.resolve({})
      });

      dynamodbStub.put.returns({
        promise: () => Promise.resolve({})
      });

      const response = await handler(event);
      
      expect(response.statusCode).to.equal(200);
      const body = JSON.parse(response.body);
      expect(body.success).to.be.true;
      expect(body.needsVerification).to.be.true;
      expect(body.message).to.include('verification code');
      expect(body.companyName).to.equal('Test Company');
      
      // Verify Cognito was called with email_verified = false
      const createUserCall = cognitoStub.adminCreateUser.getCall(0);
      const emailVerifiedAttr = createUserCall.args[0].UserAttributes.find(
        attr => attr.Name === 'email_verified'
      );
      expect(emailVerifiedAttr.Value).to.equal('false');
      
      // Verify email delivery was requested
      expect(createUserCall.args[0].DesiredDeliveryMediums).to.include('EMAIL');
    });

    /**
     * Test registration validation for missing first name
     * Ensures first name is now required
     */
    it('should reject registration without first name', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/register',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'https://app.ordernimbus.com'
        },
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'TestPassword123!',
          companyName: 'Test Company',
          lastName: 'Doe'
          // Missing firstName
        }),
        requestContext: {
          http: { method: 'POST' }
        }
      };

      const response = await handler(event);
      
      expect(response.statusCode).to.equal(400);
      const body = JSON.parse(response.body);
      expect(body.success).to.be.false;
      expect(body.error).to.include('First name and last name are required');
    });

    /**
     * Test registration validation for missing last name
     * Ensures last name is now required
     */
    it('should reject registration without last name', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/register',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'https://app.ordernimbus.com'
        },
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'TestPassword123!',
          companyName: 'Test Company',
          firstName: 'John'
          // Missing lastName
        }),
        requestContext: {
          http: { method: 'POST' }
        }
      };

      const response = await handler(event);
      
      expect(response.statusCode).to.equal(400);
      const body = JSON.parse(response.body);
      expect(body.success).to.be.false;
      expect(body.error).to.include('First name and last name are required');
    });

    /**
     * Test that company data includes user names
     * Verifies DynamoDB stores firstName and lastName
     */
    it('should store user names in company data', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/register',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'https://app.ordernimbus.com'
        },
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'TestPassword123!',
          companyName: 'Test Company',
          firstName: 'John',
          lastName: 'Doe'
        }),
        requestContext: {
          http: { method: 'POST' }
        }
      };

      cognitoStub.adminCreateUser.returns({
        promise: () => Promise.resolve({
          User: { Username: 'user@example.com' }
        })
      });

      cognitoStub.adminSetUserPassword.returns({
        promise: () => Promise.resolve({})
      });

      dynamodbStub.put.returns({
        promise: () => Promise.resolve({})
      });

      await handler(event);
      
      // Verify DynamoDB was called with user names
      const dynamoCall = dynamodbStub.put.getCall(0);
      expect(dynamoCall.args[0].Item.firstName).to.equal('John');
      expect(dynamoCall.args[0].Item.lastName).to.equal('Doe');
      expect(dynamoCall.args[0].Item.emailVerified).to.equal(false);
    });
  });

  describe('POST /api/auth/verify - Email Verification', function() {
    /**
     * Test successful email verification
     * Verifies code validation and status updates
     */
    it('should verify email with valid code', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/verify',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'https://app.ordernimbus.com'
        },
        body: JSON.stringify({
          email: 'user@example.com',
          code: '123456'
        }),
        requestContext: {
          http: { method: 'POST' }
        }
      };

      // Mock successful verification
      cognitoStub.confirmSignUp.returns({
        promise: () => Promise.resolve({})
      });

      cognitoStub.adminUpdateUserAttributes.returns({
        promise: () => Promise.resolve({})
      });

      // Mock DynamoDB query to find company
      dynamodbStub.query.returns({
        promise: () => Promise.resolve({
          Items: [{
            pk: 'company_123',
            sk: 'metadata',
            adminEmail: 'user@example.com'
          }]
        })
      });

      dynamodbStub.update.returns({
        promise: () => Promise.resolve({})
      });

      const response = await handler(event);
      
      expect(response.statusCode).to.equal(200);
      const body = JSON.parse(response.body);
      expect(body.success).to.be.true;
      expect(body.message).to.equal('Email verified successfully');
      
      // Verify Cognito confirmSignUp was called
      expect(cognitoStub.confirmSignUp.calledOnce).to.be.true;
      const confirmCall = cognitoStub.confirmSignUp.getCall(0);
      expect(confirmCall.args[0].Username).to.equal('user@example.com');
      expect(confirmCall.args[0].ConfirmationCode).to.equal('123456');
      
      // Verify email_verified was updated
      expect(cognitoStub.adminUpdateUserAttributes.calledOnce).to.be.true;
      const updateCall = cognitoStub.adminUpdateUserAttributes.getCall(0);
      const emailVerifiedAttr = updateCall.args[0].UserAttributes.find(
        attr => attr.Name === 'email_verified'
      );
      expect(emailVerifiedAttr.Value).to.equal('true');
    });

    /**
     * Test verification with invalid code
     * Ensures proper error handling
     */
    it('should reject invalid verification code', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/verify',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'https://app.ordernimbus.com'
        },
        body: JSON.stringify({
          email: 'user@example.com',
          code: 'wrong'
        }),
        requestContext: {
          http: { method: 'POST' }
        }
      };

      // Mock verification failure
      cognitoStub.confirmSignUp.returns({
        promise: () => Promise.reject({
          code: 'CodeMismatchException',
          message: 'Invalid verification code provided'
        })
      });

      const response = await handler(event);
      
      expect(response.statusCode).to.equal(400);
      const body = JSON.parse(response.body);
      expect(body.success).to.be.false;
      expect(body.error).to.equal('Invalid verification code');
    });

    /**
     * Test verification with missing email
     * Ensures proper validation
     */
    it('should reject verification without email', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/verify',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'https://app.ordernimbus.com'
        },
        body: JSON.stringify({
          code: '123456'
          // Missing email
        }),
        requestContext: {
          http: { method: 'POST' }
        }
      };

      const response = await handler(event);
      
      expect(response.statusCode).to.equal(400);
      const body = JSON.parse(response.body);
      expect(body.success).to.be.false;
      expect(body.error).to.equal('Email and verification code required');
    });

    /**
     * Test verification with missing code
     * Ensures proper validation
     */
    it('should reject verification without code', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/verify',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'https://app.ordernimbus.com'
        },
        body: JSON.stringify({
          email: 'user@example.com'
          // Missing code
        }),
        requestContext: {
          http: { method: 'POST' }
        }
      };

      const response = await handler(event);
      
      expect(response.statusCode).to.equal(400);
      const body = JSON.parse(response.body);
      expect(body.success).to.be.false;
      expect(body.error).to.equal('Email and verification code required');
    });
  });

  describe('Complete Registration Flow', function() {
    /**
     * Test the complete flow from registration to verification
     * Simulates the full user journey
     */
    it('should complete full registration and verification flow', async function() {
      // Step 1: Register
      const registerEvent = {
        httpMethod: 'POST',
        path: '/api/auth/register',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'https://app.ordernimbus.com'
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

      cognitoStub.adminCreateUser.returns({
        promise: () => Promise.resolve({
          User: { Username: 'newuser@example.com' }
        })
      });

      cognitoStub.adminSetUserPassword.returns({
        promise: () => Promise.resolve({})
      });

      dynamodbStub.put.returns({
        promise: () => Promise.resolve({})
      });

      const registerResponse = await handler(registerEvent);
      expect(registerResponse.statusCode).to.equal(200);
      const registerBody = JSON.parse(registerResponse.body);
      expect(registerBody.needsVerification).to.be.true;

      // Step 2: Verify email
      const verifyEvent = {
        httpMethod: 'POST',
        path: '/api/auth/verify',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'https://app.ordernimbus.com'
        },
        body: JSON.stringify({
          email: 'newuser@example.com',
          code: '123456'
        }),
        requestContext: {
          http: { method: 'POST' }
        }
      };

      cognitoStub.confirmSignUp.returns({
        promise: () => Promise.resolve({})
      });

      cognitoStub.adminUpdateUserAttributes.returns({
        promise: () => Promise.resolve({})
      });

      dynamodbStub.query.returns({
        promise: () => Promise.resolve({
          Items: [{
            pk: registerBody.companyId,
            sk: 'metadata'
          }]
        })
      });

      dynamodbStub.update.returns({
        promise: () => Promise.resolve({})
      });

      const verifyResponse = await handler(verifyEvent);
      expect(verifyResponse.statusCode).to.equal(200);
      const verifyBody = JSON.parse(verifyResponse.body);
      expect(verifyBody.success).to.be.true;
      expect(verifyBody.message).to.equal('Email verified successfully');
    });
  });
});

// Export for test runner
module.exports = {};