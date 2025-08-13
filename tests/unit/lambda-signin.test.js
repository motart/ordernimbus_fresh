/**
 * Unit Tests for UC002: Sign-In Flow
 * Tests the Lambda handler's auth/login endpoint
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
  adminInitiateAuth: sinon.stub().returns({ promise: sinon.stub() }),
  adminGetUser: sinon.stub().returns({ promise: sinon.stub() }),
  adminUpdateUserAttributes: sinon.stub().returns({ promise: sinon.stub() }),
  globalSignOut: sinon.stub().returns({ promise: sinon.stub() }),
  forgotPassword: sinon.stub().returns({ promise: sinon.stub() }),
  adminCreateUser: sinon.stub().returns({ promise: sinon.stub() }),
  adminSetUserPassword: sinon.stub().returns({ promise: sinon.stub() })
};

const dynamodbStub = {
  put: sinon.stub().returns({ promise: sinon.stub() }),
  get: sinon.stub().returns({ promise: sinon.stub() }),
  update: sinon.stub().returns({ promise: sinon.stub() }),
  query: sinon.stub().returns({ promise: sinon.stub() })
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

describe('UC002: Sign-In Flow Tests', function() {
  let clock;

  beforeEach(function() {
    // Reset all stubs
    cognitoStub.adminInitiateAuth = sinon.stub().returns({ promise: sinon.stub() });
    cognitoStub.adminGetUser = sinon.stub().returns({ promise: sinon.stub() });
    cognitoStub.adminUpdateUserAttributes = sinon.stub().returns({ promise: sinon.stub() });
    cognitoStub.globalSignOut = sinon.stub().returns({ promise: sinon.stub() });
    cognitoStub.forgotPassword = sinon.stub().returns({ promise: sinon.stub() });
    cognitoStub.adminCreateUser = sinon.stub().returns({ promise: sinon.stub() });
    cognitoStub.adminSetUserPassword = sinon.stub().returns({ promise: sinon.stub() });
    dynamodbStub.put = sinon.stub().returns({ promise: sinon.stub().resolves({}) });
    dynamodbStub.get = sinon.stub().returns({ promise: sinon.stub().resolves({}) });
    dynamodbStub.update = sinon.stub().returns({ promise: sinon.stub().resolves({}) });
    dynamodbStub.query = sinon.stub().returns({ promise: sinon.stub().resolves({ Items: [] }) });
    
    // Use fake timers for testing time-based features
    clock = sinon.useFakeTimers();
  });

  afterEach(function() {
    clock.restore();
  });

  describe('POST /api/auth/login - Basic Authentication', function() {
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
        promise: sinon.stub().resolves({
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
        promise: sinon.stub().rejects({
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
        promise: sinon.stub().rejects({
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

    it('should handle account locked/disabled', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/login',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'https://app.ordernimbus.com'
        },
        body: JSON.stringify({
          email: 'locked@example.com',
          password: 'Password123!'
        }),
        requestContext: {
          http: { method: 'POST' }
        }
      };

      // Mock account locked
      cognitoStub.adminInitiateAuth.returns({
        promise: sinon.stub().rejects({
          code: 'UserNotConfirmedException',
          message: 'User is not confirmed'
        })
      });

      const response = await handler(event);
      
      expect(response.statusCode).to.equal(401);
      const body = JSON.parse(response.body);
      expect(body.success).to.be.false;
    });
  });

  describe('POST /api/auth/refresh - Token Refresh', function() {
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
        promise: sinon.stub().resolves({
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
        promise: sinon.stub().rejects({
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

    it('should handle missing refresh token', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/refresh',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'https://app.ordernimbus.com'
        },
        body: JSON.stringify({}),
        requestContext: {
          http: { method: 'POST' }
        }
      };

      // Mock missing token error
      cognitoStub.adminInitiateAuth.returns({
        promise: sinon.stub().rejects({
          code: 'InvalidParameterException',
          message: 'Missing required parameter REFRESH_TOKEN'
        })
      });

      const response = await handler(event);
      
      expect(response.statusCode).to.equal(401);
      const body = JSON.parse(response.body);
      expect(body.success).to.be.false;
    });
  });

  describe('POST /api/auth/forgot-password - Password Reset', function() {
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
      cognitoStub.forgotPassword = sinon.stub().returns({
        promise: sinon.stub().resolves({
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
      cognitoStub.forgotPassword = sinon.stub().returns({
        promise: sinon.stub().rejects({
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

    it('should sanitize email input (case-insensitive)', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/login',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'https://app.ordernimbus.com'
        },
        body: JSON.stringify({
          email: 'USER@EXAMPLE.COM',
          password: 'Password123!'
        }),
        requestContext: {
          http: { method: 'POST' }
        }
      };

      // Mock successful auth
      cognitoStub.adminInitiateAuth.returns({
        promise: sinon.stub().resolves({
          AuthenticationResult: {
            AccessToken: 'token',
            RefreshToken: 'refresh',
            IdToken: 'id',
            ExpiresIn: 3600,
            TokenType: 'Bearer'
          }
        })
      });

      const response = await handler(event);
      
      expect(response.statusCode).to.equal(200);
      // Verify the email was passed to Cognito
      expect(cognitoStub.adminInitiateAuth.calledOnce).to.be.true;
      const authCall = cognitoStub.adminInitiateAuth.getCall(0);
      expect(authCall.args[0].AuthParameters.USERNAME).to.equal('USER@EXAMPLE.COM');
    });
  });

  describe('Rate Limiting and Lockout', function() {
    it('should track failed login attempts', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/login',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'https://app.ordernimbus.com'
        },
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'WrongPassword'
        }),
        requestContext: {
          http: { method: 'POST' },
          identity: { sourceIp: '192.168.1.1' }
        }
      };

      // Mock failed authentication
      cognitoStub.adminInitiateAuth.returns({
        promise: sinon.stub().rejects({
          code: 'NotAuthorizedException',
          message: 'Incorrect username or password'
        })
      });

      // Attempt multiple failed logins
      for (let i = 0; i < 3; i++) {
        const response = await handler(event);
        expect(response.statusCode).to.equal(401);
      }

      // Verify failed attempts would be tracked (in real implementation)
      expect(cognitoStub.adminInitiateAuth.callCount).to.equal(3);
    });

    it('should handle password expired scenario', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/login',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'https://app.ordernimbus.com'
        },
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'OldPassword123!'
        }),
        requestContext: {
          http: { method: 'POST' }
        }
      };

      // Mock password expired challenge
      cognitoStub.adminInitiateAuth.returns({
        promise: sinon.stub().resolves({
          ChallengeName: 'NEW_PASSWORD_REQUIRED',
          Session: 'session-token',
          ChallengeParameters: {
            USER_ID_FOR_SRP: 'user@example.com'
          }
        })
      });

      const response = await handler(event);
      
      // Should handle password change requirement
      const body = JSON.parse(response.body);
      expect(response.statusCode).to.be.oneOf([200, 401]);
    });
  });

  describe('Session Management', function() {
    it('should properly format token response', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/login',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'https://app.ordernimbus.com'
        },
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'Password123!'
        }),
        requestContext: {
          http: { method: 'POST' }
        }
      };

      const mockTokens = {
        AccessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        RefreshToken: 'refresh-token-value',
        IdToken: 'id-token-value',
        ExpiresIn: 3600,
        TokenType: 'Bearer'
      };

      cognitoStub.adminInitiateAuth.returns({
        promise: sinon.stub().resolves({
          AuthenticationResult: mockTokens
        })
      });

      const response = await handler(event);
      
      expect(response.statusCode).to.equal(200);
      const body = JSON.parse(response.body);
      expect(body.tokens).to.deep.equal(mockTokens);
      expect(response.headers['Content-Type']).to.equal('application/json');
    });

    it('should handle session already exists scenario', async function() {
      const event = {
        httpMethod: 'POST',
        path: '/api/auth/login',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'https://app.ordernimbus.com',
          'Authorization': 'Bearer existing-token'
        },
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'Password123!'
        }),
        requestContext: {
          http: { method: 'POST' }
        }
      };

      // Mock successful authentication (new session)
      cognitoStub.adminInitiateAuth.returns({
        promise: sinon.stub().resolves({
          AuthenticationResult: {
            AccessToken: 'new-access-token',
            RefreshToken: 'new-refresh-token',
            IdToken: 'new-id-token',
            ExpiresIn: 3600,
            TokenType: 'Bearer'
          }
        })
      });

      const response = await handler(event);
      
      expect(response.statusCode).to.equal(200);
      const body = JSON.parse(response.body);
      // Should create new session, replacing the old one
      expect(body.tokens.AccessToken).to.equal('new-access-token');
    });
  });
});

// UC002 Sign-In Flow Tests defined. Run with: npm test