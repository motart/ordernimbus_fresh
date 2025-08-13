/**
 * Global test setup for OrderNimbus tests
 */

// Global test configuration
global.TEST_CONFIG = {
  APP_URL: 'https://app.ordernimbus.com',
  API_URL: 'https://ay8k50buyd.execute-api.us-west-1.amazonaws.com/production',
  TIMEOUT: 30000,
  BROWSER: 'chrome'
};

// Setup for E2E tests
if (process.env.TEST_TYPE === 'e2e') {
  const { Builder } = require('selenium-webdriver');
  
  global.createDriver = async () => {
    return await new Builder()
      .forBrowser(global.TEST_CONFIG.BROWSER)
      .build();
  };
}

// Setup for unit tests
beforeEach(function() {
  this.timeout(global.TEST_CONFIG.TIMEOUT);
});

console.log('Test environment configured for OrderNimbus');
