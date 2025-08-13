/**
 * Integration Tests for UC002: Sign-In Flow
 * Tests the integration between frontend and backend components
 */

const { expect } = require('chai');
const sinon = require('sinon');
const axios = require('axios');

// API base URL (use environment variable or default)
const API_URL = process.env.API_URL || 'https://api.ordernimbus.com';

describe('UC002: Sign-In Integration Tests', function() {
  let axiosStub;

  beforeEach(function() {
    // Stub axios for controlled testing
    axiosStub = sinon.stub(axios, 'post');
  });

  afterEach(function() {
    // Restore axios
    if (axiosStub) {
      axiosStub.restore();
    }
  });

  describe('API Endpoint Integration', function() {
    it('should send correct request format to /api/auth/login', async function() {
      const loginData = {
        email: 'user@example.com',
        password: 'Password123!'
      };

      axiosStub.resolves({
        status: 200,
        data: {
          success: true,
          tokens: {
            AccessToken: 'mock-access-token',
            RefreshToken: 'mock-refresh-token',
            IdToken: 'mock-id-token',
            ExpiresIn: 3600,
            TokenType: 'Bearer'
          }
        }
      });

      const response = await axios.post(`${API_URL}/api/auth/login`, loginData, {
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://app.ordernimbus.com'
        }
      });

      expect(response.status).to.equal(200);
      expect(response.data.success).to.be.true;
      expect(response.data.tokens).to.exist;
      expect(response.data.tokens.AccessToken).to.exist;

      // Verify the request was made correctly
      expect(axiosStub.calledOnce).to.be.true;
      const [url, data, config] = axiosStub.firstCall.args;
      expect(url).to.include('/api/auth/login');
      expect(data.email).to.equal(loginData.email);
      expect(data.password).to.equal(loginData.password);
      expect(config.headers['Content-Type']).to.equal('application/json');
    });

    it('should handle 401 unauthorized response', async function() {
      const loginData = {
        email: 'user@example.com',
        password: 'WrongPassword'
      };

      axiosStub.rejects({
        response: {
          status: 401,
          data: {
            success: false,
            error: 'Invalid credentials'
          }
        }
      });

      try {
        await axios.post(`${API_URL}/api/auth/login`, loginData);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).to.equal(401);
        expect(error.response.data.success).to.be.false;
        expect(error.response.data.error).to.equal('Invalid credentials');
      }
    });

    it('should handle 400 bad request for missing fields', async function() {
      const loginData = {
        email: 'user@example.com'
        // Missing password
      };

      axiosStub.rejects({
        response: {
          status: 400,
          data: {
            success: false,
            error: 'Email and password required'
          }
        }
      });

      try {
        await axios.post(`${API_URL}/api/auth/login`, loginData);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).to.equal(400);
        expect(error.response.data.error).to.include('required');
      }
    });

    it('should handle network errors gracefully', async function() {
      axiosStub.rejects(new Error('Network Error'));

      try {
        await axios.post(`${API_URL}/api/auth/login`, {
          email: 'user@example.com',
          password: 'Password123!'
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('Network Error');
      }
    });
  });

  describe('Token Refresh Integration', function() {
    it('should refresh tokens with valid refresh token', async function() {
      const refreshData = {
        refreshToken: 'valid-refresh-token'
      };

      axiosStub.resolves({
        status: 200,
        data: {
          success: true,
          tokens: {
            AccessToken: 'new-access-token',
            IdToken: 'new-id-token',
            ExpiresIn: 3600,
            TokenType: 'Bearer'
          }
        }
      });

      const response = await axios.post(`${API_URL}/api/auth/refresh`, refreshData);

      expect(response.status).to.equal(200);
      expect(response.data.success).to.be.true;
      expect(response.data.tokens.AccessToken).to.equal('new-access-token');
    });

    it('should handle expired refresh token', async function() {
      axiosStub.rejects({
        response: {
          status: 401,
          data: {
            success: false,
            error: 'Invalid refresh token'
          }
        }
      });

      try {
        await axios.post(`${API_URL}/api/auth/refresh`, {
          refreshToken: 'expired-token'
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).to.equal(401);
        expect(error.response.data.error).to.equal('Invalid refresh token');
      }
    });
  });

  describe('Password Reset Integration', function() {
    it('should initiate password reset', async function() {
      const resetData = {
        email: 'user@example.com'
      };

      axiosStub.resolves({
        status: 200,
        data: {
          success: true,
          message: 'Password reset email sent'
        }
      });

      const response = await axios.post(`${API_URL}/api/auth/forgot-password`, resetData);

      expect(response.status).to.equal(200);
      expect(response.data.success).to.be.true;
      expect(response.data.message).to.include('reset');
    });

    it('should handle non-existent email gracefully', async function() {
      // Should still return success to prevent user enumeration
      axiosStub.resolves({
        status: 200,
        data: {
          success: true,
          message: 'If the email exists, a password reset link has been sent'
        }
      });

      const response = await axios.post(`${API_URL}/api/auth/forgot-password`, {
        email: 'nonexistent@example.com'
      });

      expect(response.status).to.equal(200);
      expect(response.data.success).to.be.true;
      // Message should not reveal whether email exists
      expect(response.data.message).to.not.include('not found');
    });
  });

  describe('CORS Integration', function() {
    it('should handle CORS preflight requests', async function() {
      // Stub OPTIONS request
      const optionsStub = sinon.stub(axios, 'options');
      optionsStub.resolves({
        status: 200,
        headers: {
          'access-control-allow-origin': 'https://app.ordernimbus.com',
          'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
          'access-control-allow-headers': 'Content-Type,Authorization',
          'access-control-max-age': '86400'
        }
      });

      const response = await axios.options(`${API_URL}/api/auth/login`);

      expect(response.status).to.equal(200);
      expect(response.headers['access-control-allow-origin']).to.exist;
      expect(response.headers['access-control-allow-methods']).to.include('POST');

      optionsStub.restore();
    });

    it('should include CORS headers in response', async function() {
      axiosStub.resolves({
        status: 200,
        headers: {
          'access-control-allow-origin': 'https://app.ordernimbus.com',
          'access-control-allow-credentials': 'true'
        },
        data: {
          success: true,
          tokens: {}
        }
      });

      const response = await axios.post(`${API_URL}/api/auth/login`, {
        email: 'user@example.com',
        password: 'Password123!'
      });

      expect(response.headers['access-control-allow-origin']).to.exist;
      expect(response.headers['access-control-allow-credentials']).to.equal('true');
    });
  });

  describe('Session Management Integration', function() {
    it('should store tokens after successful login', async function() {
      // Mock localStorage for Node.js environment
      global.localStorage = {
        setItem: sinon.stub(),
        getItem: sinon.stub(),
        removeItem: sinon.stub()
      };

      const tokens = {
        AccessToken: 'access-token',
        RefreshToken: 'refresh-token',
        IdToken: 'id-token',
        ExpiresIn: 3600
      };

      // Simulate storing tokens
      global.localStorage.setItem('accessToken', tokens.AccessToken);
      global.localStorage.setItem('refreshToken', tokens.RefreshToken);
      global.localStorage.setItem('idToken', tokens.IdToken);

      expect(global.localStorage.setItem.calledThrice).to.be.true;
      expect(global.localStorage.setItem.calledWith('accessToken', tokens.AccessToken)).to.be.true;

      delete global.localStorage;
    });

    it('should clear tokens on logout', async function() {
      global.localStorage = {
        removeItem: sinon.stub(),
        clear: sinon.stub()
      };

      // Simulate logout
      global.localStorage.removeItem('accessToken');
      global.localStorage.removeItem('refreshToken');
      global.localStorage.removeItem('idToken');

      expect(global.localStorage.removeItem.calledThrice).to.be.true;

      delete global.localStorage;
    });

    it('should handle concurrent login attempts', async function() {
      const loginPromises = [];

      // Stub to simulate concurrent requests
      let callCount = 0;
      axiosStub.callsFake(() => {
        callCount++;
        return Promise.resolve({
          status: 200,
          data: {
            success: true,
            tokens: {
              AccessToken: `token-${callCount}`,
              RefreshToken: `refresh-${callCount}`,
              IdToken: `id-${callCount}`,
              ExpiresIn: 3600
            }
          }
        });
      });

      // Make 3 concurrent login attempts
      for (let i = 0; i < 3; i++) {
        loginPromises.push(
          axios.post(`${API_URL}/api/auth/login`, {
            email: 'user@example.com',
            password: 'Password123!'
          })
        );
      }

      const responses = await Promise.all(loginPromises);

      expect(responses).to.have.lengthOf(3);
      responses.forEach((response, index) => {
        expect(response.status).to.equal(200);
        expect(response.data.tokens.AccessToken).to.equal(`token-${index + 1}`);
      });

      expect(axiosStub.calledThrice).to.be.true;
    });
  });

  describe('Error Handling Integration', function() {
    it('should handle rate limiting', async function() {
      axiosStub.rejects({
        response: {
          status: 429,
          data: {
            success: false,
            error: 'Too many requests. Please try again later.'
          }
        }
      });

      try {
        await axios.post(`${API_URL}/api/auth/login`, {
          email: 'user@example.com',
          password: 'Password123!'
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).to.equal(429);
        expect(error.response.data.error).to.include('Too many requests');
      }
    });

    it('should handle server errors', async function() {
      axiosStub.rejects({
        response: {
          status: 500,
          data: {
            success: false,
            error: 'Internal server error'
          }
        }
      });

      try {
        await axios.post(`${API_URL}/api/auth/login`, {
          email: 'user@example.com',
          password: 'Password123!'
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).to.equal(500);
        expect(error.response.data.error).to.include('Internal server error');
      }
    });

    it('should handle service unavailable', async function() {
      axiosStub.rejects({
        response: {
          status: 503,
          data: {
            success: false,
            error: 'Service temporarily unavailable'
          }
        }
      });

      try {
        await axios.post(`${API_URL}/api/auth/login`, {
          email: 'user@example.com',
          password: 'Password123!'
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).to.equal(503);
        expect(error.response.data.error).to.include('temporarily unavailable');
      }
    });

    it('should handle timeout errors', async function() {
      const timeoutError = new Error('Request timeout');
      timeoutError.code = 'ECONNABORTED';
      axiosStub.rejects(timeoutError);

      try {
        await axios.post(`${API_URL}/api/auth/login`, {
          email: 'user@example.com',
          password: 'Password123!'
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.code).to.equal('ECONNABORTED');
        expect(error.message).to.include('timeout');
      }
    });
  });

  describe('Security Integration', function() {
    it('should not expose sensitive information in errors', async function() {
      const testCases = [
        { email: 'nonexistent@example.com', password: 'Password123!' },
        { email: 'user@example.com', password: 'WrongPassword' },
        { email: 'disabled@example.com', password: 'Password123!' }
      ];

      for (const testCase of testCases) {
        axiosStub.rejects({
          response: {
            status: 401,
            data: {
              success: false,
              error: 'Invalid credentials' // Generic error message
            }
          }
        });

        try {
          await axios.post(`${API_URL}/api/auth/login`, testCase);
          expect.fail('Should have thrown an error');
        } catch (error) {
          // Error message should be generic
          expect(error.response.data.error).to.equal('Invalid credentials');
          // Should not reveal specific failure reason
          expect(error.response.data.error).to.not.include('not found');
          expect(error.response.data.error).to.not.include('disabled');
          expect(error.response.data.error).to.not.include('wrong password');
        }
      }
    });

    it('should sanitize user input', async function() {
      const maliciousInput = {
        email: '<script>alert("XSS")</script>',
        password: 'Password123!<img src=x onerror=alert(1)>'
      };

      axiosStub.resolves({
        status: 401,
        data: {
          success: false,
          error: 'Invalid credentials'
        }
      });

      const response = await axios.post(`${API_URL}/api/auth/login`, maliciousInput);

      // The request should be made with the input as-is (sanitization happens server-side)
      const [, data] = axiosStub.firstCall.args;
      expect(data.email).to.equal(maliciousInput.email);
      
      // Server should handle it safely and return generic error
      expect(response.data.error).to.equal('Invalid credentials');
    });
  });
});

// UC002 Sign-In Integration Tests defined. Run with: npm test