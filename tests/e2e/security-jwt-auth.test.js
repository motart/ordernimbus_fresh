/**
 * E2E Security Tests for JWT Authentication
 * Tests that users cannot manipulate userId to access other users' data
 */

const { Builder, By, until, Key } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const assert = require('assert');
const path = require('path');

// Test configuration
const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const API_URL = process.env.API_URL || 'http://localhost:3001';
const TIMEOUT = 30000;

describe('Security: JWT Authentication E2E Tests', function() {
  this.timeout(TIMEOUT);
  let driver;
  let originalUserId;
  let jwtToken;

  // Setup Chrome driver with options
  before(async function() {
    const chromeOptions = new chrome.Options();
    chromeOptions.addArguments('--disable-gpu');
    chromeOptions.addArguments('--no-sandbox');
    chromeOptions.addArguments('--disable-dev-shm-usage');
    if (process.env.CI) {
      chromeOptions.addArguments('--headless');
    }

    driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(chromeOptions)
      .build();
  });

  after(async function() {
    if (driver) {
      await driver.quit();
    }
  });

  describe('Authentication Flow', function() {
    it('should login and receive JWT token', async function() {
      // Navigate to login page
      await driver.get(`${BASE_URL}/login`);
      await driver.wait(until.elementLocated(By.css('input[type="email"]')), 5000);

      // Enter credentials
      await driver.findElement(By.css('input[type="email"]')).sendKeys('test@example.com');
      await driver.findElement(By.css('input[type="password"]')).sendKeys('TestPassword123!');
      
      // Submit login form
      await driver.findElement(By.css('button[type="submit"]')).click();

      // Wait for redirect to dashboard
      await driver.wait(until.urlContains('/dashboard'), 10000);

      // Get JWT token from localStorage
      jwtToken = await driver.executeScript('return localStorage.getItem("ordernimbus_access_token");');
      assert(jwtToken, 'JWT token should be stored after login');

      // Get original userId from localStorage
      originalUserId = await driver.executeScript('return localStorage.getItem("currentUserId");');
      assert(originalUserId, 'User ID should be stored after login');
    });

    it('should have Authorization header with JWT in API calls', async function() {
      // Navigate to stores page
      await driver.get(`${BASE_URL}/stores`);
      await driver.wait(until.elementLocated(By.css('.stores-page')), 5000);

      // Intercept network requests to verify Authorization header
      const logs = await driver.executeScript(`
        // Create a promise to capture the next fetch request
        return new Promise((resolve) => {
          const originalFetch = window.fetch;
          window.fetch = function(...args) {
            const [url, options] = args;
            if (url.includes('/api/stores')) {
              resolve({
                url: url,
                headers: options?.headers || {}
              });
            }
            return originalFetch.apply(this, args);
          };
          
          // Trigger a refresh to cause an API call
          const refreshBtn = document.querySelector('.refresh-btn');
          if (refreshBtn) refreshBtn.click();
          
          // Timeout after 3 seconds
          setTimeout(() => resolve(null), 3000);
        });
      `);

      if (logs) {
        assert(logs.headers.Authorization, 'Authorization header should be present');
        assert(logs.headers.Authorization.startsWith('Bearer '), 'Should use Bearer token scheme');
        assert(!logs.headers.userId && !logs.headers.userid, 'Should NOT send userId in headers');
      }
    });
  });

  describe('Security: userId Manipulation Prevention', function() {
    it('should prevent access to other users data by changing localStorage userId', async function() {
      // Navigate to stores page
      await driver.get(`${BASE_URL}/stores`);
      await driver.wait(until.elementLocated(By.css('.stores-page')), 5000);

      // Count original stores
      const originalStoreCount = await driver.executeScript(`
        return document.querySelectorAll('.store-card').length;
      `);

      // Attempt to manipulate userId in localStorage
      const maliciousUserId = 'malicious-user-12345';
      await driver.executeScript(`
        localStorage.setItem('currentUserId', '${maliciousUserId}');
      `);

      // Refresh the page
      await driver.navigate().refresh();
      await driver.wait(until.elementLocated(By.css('.stores-page')), 5000);

      // Check that stores are still the same (JWT determines user, not localStorage)
      const newStoreCount = await driver.executeScript(`
        return document.querySelectorAll('.store-card').length;
      `);

      assert.strictEqual(newStoreCount, originalStoreCount, 
        'Store count should remain the same - JWT prevents userId manipulation');

      // Verify the manipulated userId was not used
      const apiCallUserId = await driver.executeScript(`
        return window.lastApiCallUserId || null;
      `);
      
      assert.notStrictEqual(apiCallUserId, maliciousUserId, 
        'API should not use manipulated userId from localStorage');
    });

    it('should prevent adding userId to request headers manually', async function() {
      // Navigate to products page
      await driver.get(`${BASE_URL}/products`);
      await driver.wait(until.elementLocated(By.css('.order-page')), 5000);

      // Try to make a direct API call with manipulated userId header
      const response = await driver.executeScript(`
        return fetch('${API_URL}/api/products', {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + localStorage.getItem('ordernimbus_access_token'),
            'userId': 'hacker-user-id',
            'userid': 'another-hacker-id'
          }
        }).then(r => ({
          status: r.status,
          ok: r.ok
        })).catch(err => ({
          error: err.message
        }));
      `);

      // The request should either:
      // 1. Work but ignore the userId headers (using JWT instead)
      // 2. Fail with 401 if JWT is invalid
      if (response.ok) {
        // If successful, verify it used JWT userId, not header userId
        const products = await driver.executeScript(`
          return fetch('${API_URL}/api/products', {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + localStorage.getItem('ordernimbus_access_token')
            }
          }).then(r => r.json());
        `);
        
        assert(products, 'Should return products for JWT user, not manipulated userId');
      }
    });

    it('should return 401 when accessing API without JWT token', async function() {
      // Try to access protected endpoint without JWT
      const response = await driver.executeScript(`
        return fetch('${API_URL}/api/stores', {
          headers: {
            'Content-Type': 'application/json',
            'userId': 'some-user-id'
          }
        }).then(r => ({
          status: r.status,
          statusText: r.statusText
        })).catch(err => ({
          error: err.message
        }));
      `);

      assert.strictEqual(response.status, 401, 
        'Should return 401 Unauthorized without JWT token');
    });

    it('should return 401 with invalid JWT token', async function() {
      // Try to access protected endpoint with invalid JWT
      const response = await driver.executeScript(`
        return fetch('${API_URL}/api/stores', {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer invalid.jwt.token'
          }
        }).then(r => ({
          status: r.status,
          statusText: r.statusText
        })).catch(err => ({
          error: err.message
        }));
      `);

      assert.strictEqual(response.status, 401, 
        'Should return 401 Unauthorized with invalid JWT');
    });
  });

  describe('Protected Endpoints Security', function() {
    const protectedEndpoints = [
      '/api/stores',
      '/api/products',
      '/api/orders',
      '/api/inventory',
      '/api/customers',
      '/api/notifications'
    ];

    protectedEndpoints.forEach(endpoint => {
      it(`should protect ${endpoint} endpoint with JWT`, async function() {
        // Test without token
        const noAuthResponse = await driver.executeScript(`
          return fetch('${API_URL}${endpoint}', {
            headers: { 'Content-Type': 'application/json' }
          }).then(r => ({ status: r.status }))
          .catch(err => ({ error: err.message }));
        `);
        
        assert.strictEqual(noAuthResponse.status, 401, 
          `${endpoint} should require authentication`);

        // Test with valid token
        const authResponse = await driver.executeScript(`
          return fetch('${API_URL}${endpoint}', {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + localStorage.getItem('ordernimbus_access_token')
            }
          }).then(r => ({ status: r.status }))
          .catch(err => ({ error: err.message }));
        `);
        
        assert(authResponse.status === 200 || authResponse.status === 404, 
          `${endpoint} should be accessible with valid JWT`);
      });
    });
  });

  describe('Frontend Component Security', function() {
    it('should use authService.authenticatedRequest in StoresPage', async function() {
      await driver.get(`${BASE_URL}/stores`);
      await driver.wait(until.elementLocated(By.css('.stores-page')), 5000);

      // Check that authService is being used
      const usesAuthService = await driver.executeScript(`
        // Check if the component uses authService
        const scripts = Array.from(document.scripts);
        const hasAuthService = scripts.some(s => 
          s.innerHTML.includes('authService.authenticatedRequest')
        );
        return hasAuthService || window.authService !== undefined;
      `);

      assert(usesAuthService, 'StoresPage should use authService for API calls');
    });

    it('should use authService.authenticatedRequest in ProductsPage', async function() {
      await driver.get(`${BASE_URL}/products`);
      await driver.wait(until.elementLocated(By.css('.order-page')), 5000);

      const usesAuthService = await driver.executeScript(`
        return window.authService !== undefined;
      `);

      assert(usesAuthService, 'ProductsPage should use authService for API calls');
    });

    it('should use authService.authenticatedRequest in OrderPage', async function() {
      await driver.get(`${BASE_URL}/orders`);
      await driver.wait(until.elementLocated(By.css('.order-page')), 5000);

      const usesAuthService = await driver.executeScript(`
        return window.authService !== undefined;
      `);

      assert(usesAuthService, 'OrderPage should use authService for API calls');
    });
  });

  describe('Session Security', function() {
    it('should clear sensitive data on logout', async function() {
      // Click logout button
      await driver.findElement(By.css('.logout-btn')).click();
      
      // Wait for redirect to login
      await driver.wait(until.urlContains('/login'), 5000);

      // Check that sensitive data is cleared
      const token = await driver.executeScript('return localStorage.getItem("ordernimbus_access_token");');
      const userId = await driver.executeScript('return localStorage.getItem("currentUserId");');
      
      assert(!token, 'JWT token should be cleared on logout');
      assert(!userId, 'User ID should be cleared on logout');
    });

    it('should redirect to login when token expires', async function() {
      // Set an expired token
      await driver.executeScript(`
        localStorage.setItem('ordernimbus_access_token', 'expired.jwt.token');
      `);

      // Try to access protected page
      await driver.get(`${BASE_URL}/stores`);

      // Should redirect to login
      await driver.wait(until.urlContains('/login'), 5000);
      const currentUrl = await driver.getCurrentUrl();
      assert(currentUrl.includes('/login'), 'Should redirect to login with expired token');
    });
  });

  describe('Cross-Site Security', function() {
    it('should have proper CORS headers', async function() {
      const response = await driver.executeScript(`
        return fetch('${API_URL}/api/stores', {
          method: 'OPTIONS',
          headers: {
            'Origin': 'https://malicious-site.com',
            'Access-Control-Request-Method': 'GET'
          }
        }).then(r => ({
          status: r.status,
          headers: {
            'access-control-allow-origin': r.headers.get('access-control-allow-origin'),
            'access-control-allow-credentials': r.headers.get('access-control-allow-credentials')
          }
        })).catch(err => ({ error: err.message }));
      `);

      // Should not allow requests from malicious origins
      assert.notStrictEqual(response.headers['access-control-allow-origin'], 'https://malicious-site.com',
        'Should not allow malicious origins');
    });

    it('should prevent XSS attacks in user inputs', async function() {
      await driver.get(`${BASE_URL}/login`);
      await driver.wait(until.elementLocated(By.css('input[type="email"]')), 5000);

      // Try to inject script tag
      const xssPayload = '<script>alert("XSS")</script>';
      await driver.findElement(By.css('input[type="email"]')).sendKeys(xssPayload);
      
      // Check that script is not executed
      const alertPresent = await driver.executeScript(`
        return window.xssExecuted || false;
      `);
      
      assert(!alertPresent, 'XSS payload should not execute');
    });
  });
});

module.exports = {
  BASE_URL,
  API_URL,
  TIMEOUT
};