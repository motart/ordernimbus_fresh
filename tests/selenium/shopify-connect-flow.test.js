const { Builder, By, until } = require('selenium-webdriver');
const { expect } = require('chai');
const chrome = require('selenium-webdriver/chrome');

describe('Shopify Connection E2E Flow', function() {
  this.timeout(30000); // 30 second timeout for E2E tests
  
  let driver;
  const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
  const TEST_EMAIL = process.env.TEST_EMAIL || 'test@example.com';
  const TEST_PASSWORD = process.env.TEST_PASSWORD || 'TestPassword123!';
  const TEST_SHOPIFY_DOMAIN = process.env.TEST_SHOPIFY_DOMAIN || 'test-store.myshopify.com';
  
  before(async function() {
    // Setup Chrome options
    const options = new chrome.Options();
    if (process.env.CI) {
      options.addArguments('--headless');
      options.addArguments('--no-sandbox');
      options.addArguments('--disable-dev-shm-usage');
    }
    
    driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();
  });
  
  after(async function() {
    if (driver) {
      await driver.quit();
    }
  });
  
  describe('Shopify Store Connection', function() {
    // Helper function to login
    async function loginUser() {
      await driver.get(BASE_URL);
      
      // Wait for login form
      await driver.wait(until.elementLocated(By.css('input[type="email"]')), 10000);
      
      // Enter credentials
      await driver.findElement(By.css('input[type="email"]')).sendKeys(TEST_EMAIL);
      await driver.findElement(By.css('input[type="password"]')).sendKeys(TEST_PASSWORD);
      
      // Submit form
      await driver.findElement(By.css('button[type="submit"]')).click();
      
      // Wait for dashboard to load
      await driver.wait(until.elementLocated(By.css('.dashboard-container')), 10000);
    }
    
    it('should display Stores page after login', async function() {
      await loginUser();
      
      // Navigate to Stores page
      const storesLink = await driver.findElement(By.linkText('Stores'));
      await storesLink.click();
      
      // Wait for Stores page to load
      await driver.wait(until.elementLocated(By.css('.stores-page')), 5000);
      
      // Verify page title
      const pageTitle = await driver.findElement(By.css('.stores-page h1')).getText();
      expect(pageTitle).to.include('Stores');
    });
    
    it('should show Connect Shopify button when no stores exist', async function() {
      // Assuming we're on the Stores page from previous test
      
      // Check for Connect Shopify button
      const connectButton = await driver.findElement(By.css('.connect-shopify-btn'));
      expect(await connectButton.isDisplayed()).to.be.true;
      
      const buttonText = await connectButton.getText();
      expect(buttonText).to.include('Connect Shopify');
    });
    
    it('should open Shopify connection modal when clicking Connect button', async function() {
      // Click Connect Shopify button
      const connectButton = await driver.findElement(By.css('.connect-shopify-btn'));
      await connectButton.click();
      
      // Wait for modal to appear
      await driver.wait(until.elementLocated(By.css('.shopify-connect-modal')), 5000);
      
      // Verify modal is visible
      const modal = await driver.findElement(By.css('.shopify-connect-modal'));
      expect(await modal.isDisplayed()).to.be.true;
      
      // Check for store domain input
      const domainInput = await driver.findElement(By.css('input[placeholder*="store"]'));
      expect(await domainInput.isDisplayed()).to.be.true;
    });
    
    it('should validate store domain input', async function() {
      // Get domain input
      const domainInput = await driver.findElement(By.css('input[placeholder*="store"]'));
      
      // Try to submit empty domain
      const connectBtn = await driver.findElement(By.css('.shopify-connect-modal button.primary'));
      await connectBtn.click();
      
      // Check for error message
      await driver.wait(until.elementLocated(By.css('.error-message')), 2000);
      const errorMsg = await driver.findElement(By.css('.error-message')).getText();
      expect(errorMsg).to.include('enter your Shopify store');
      
      // Enter invalid domain
      await domainInput.clear();
      await domainInput.sendKeys('invalid domain with spaces');
      await connectBtn.click();
      
      // Should auto-correct the domain
      await driver.sleep(1000); // Wait for processing
    });
    
    it('should handle OAuth flow correctly', async function() {
      // Enter valid store domain
      const domainInput = await driver.findElement(By.css('input[placeholder*="store"]'));
      await domainInput.clear();
      await domainInput.sendKeys(TEST_SHOPIFY_DOMAIN);
      
      // Get current window handle
      const originalWindow = await driver.getWindowHandle();
      
      // Click Connect button
      const connectBtn = await driver.findElement(By.css('.shopify-connect-modal button.primary'));
      await connectBtn.click();
      
      // Wait for OAuth popup to open
      await driver.wait(async () => {
        const windows = await driver.getAllWindowHandles();
        return windows.length > 1;
      }, 5000);
      
      // Switch to OAuth popup
      const windows = await driver.getAllWindowHandles();
      const popupWindow = windows.find(handle => handle !== originalWindow);
      await driver.switchTo().window(popupWindow);
      
      // Verify we're on Shopify OAuth page (or mock OAuth page)
      await driver.wait(until.urlContains('shopify.com'), 5000).catch(() => {
        // If not on real Shopify, check for mock OAuth page
        return driver.wait(until.urlContains('oauth'), 5000);
      });
      
      // In a real test, we would:
      // 1. Enter Shopify credentials
      // 2. Approve the app
      // 3. Handle the callback
      
      // For mock testing, simulate OAuth success
      if (process.env.MOCK_OAUTH === 'true') {
        await driver.executeScript(`
          window.opener.postMessage({
            type: 'shopify-oauth-success',
            data: {
              storeId: 'test-store',
              storeName: 'Test Store',
              shopifyDomain: '${TEST_SHOPIFY_DOMAIN}',
              apiKey: 'mock-api-key'
            }
          }, '*');
          window.close();
        `);
      }
      
      // Switch back to main window
      await driver.switchTo().window(originalWindow);
      
      // Wait for success message
      await driver.wait(until.elementLocated(By.css('.success-message')), 10000);
      const successMsg = await driver.findElement(By.css('.success-message')).getText();
      expect(successMsg).to.include('connected successfully');
    });
    
    it('should display connected store in the list', async function() {
      // Wait for stores list to update
      await driver.wait(until.elementLocated(By.css('.store-card')), 5000);
      
      // Verify store is displayed
      const storeCard = await driver.findElement(By.css('.store-card'));
      expect(await storeCard.isDisplayed()).to.be.true;
      
      // Check store name
      const storeName = await storeCard.findElement(By.css('.store-name')).getText();
      expect(storeName).to.exist;
      
      // Check Shopify badge
      const shopifyBadge = await storeCard.findElement(By.css('.shopify-badge'));
      expect(await shopifyBadge.isDisplayed()).to.be.true;
      
      // Check status
      const status = await storeCard.findElement(By.css('.store-status')).getText();
      expect(status.toLowerCase()).to.include('active');
    });
    
    it('should handle OAuth error gracefully', async function() {
      // Click Add Store button to test error handling
      const addStoreBtn = await driver.findElement(By.css('.add-store-btn'));
      await addStoreBtn.click();
      
      // Wait for modal
      await driver.wait(until.elementLocated(By.css('.shopify-connect-modal')), 5000);
      
      // Enter domain
      const domainInput = await driver.findElement(By.css('input[placeholder*="store"]'));
      await domainInput.sendKeys('error-test.myshopify.com');
      
      // Get current window handle
      const originalWindow = await driver.getWindowHandle();
      
      // Click Connect
      const connectBtn = await driver.findElement(By.css('.shopify-connect-modal button.primary'));
      await connectBtn.click();
      
      // Wait for popup
      await driver.wait(async () => {
        const windows = await driver.getAllWindowHandles();
        return windows.length > 1;
      }, 5000);
      
      // Switch to popup
      const windows = await driver.getAllWindowHandles();
      const popupWindow = windows.find(handle => handle !== originalWindow);
      await driver.switchTo().window(popupWindow);
      
      // Simulate OAuth error
      if (process.env.MOCK_OAUTH === 'true') {
        await driver.executeScript(`
          window.opener.postMessage({
            type: 'shopify-oauth-error',
            error: 'access_denied'
          }, '*');
          window.close();
        `);
      }
      
      // Switch back to main window
      await driver.switchTo().window(originalWindow);
      
      // Wait for error message
      await driver.wait(until.elementLocated(By.css('.error-message')), 5000);
      const errorMsg = await driver.findElement(By.css('.error-message')).getText();
      expect(errorMsg).to.include('Failed to connect');
      
      // Modal should still be open for retry
      const modal = await driver.findElement(By.css('.shopify-connect-modal'));
      expect(await modal.isDisplayed()).to.be.true;
    });
    
    it('should persist store data after page refresh', async function() {
      // Refresh the page
      await driver.navigate().refresh();
      
      // Wait for page to reload
      await driver.wait(until.elementLocated(By.css('.stores-page')), 10000);
      
      // Check that store is still displayed
      await driver.wait(until.elementLocated(By.css('.store-card')), 5000);
      const storeCards = await driver.findElements(By.css('.store-card'));
      expect(storeCards.length).to.be.greaterThan(0);
      
      // Verify store data is intact
      const storeName = await storeCards[0].findElement(By.css('.store-name')).getText();
      expect(storeName).to.exist;
    });
    
    it('should handle SecureDataManager initialization', async function() {
      // This test verifies that SecureDataManager is properly initialized
      // Check browser console for errors
      const logs = await driver.manage().logs().get('browser');
      const errors = logs.filter(log => log.level === 'SEVERE');
      
      // Should not have SecureDataManager initialization errors
      const secureDataErrors = errors.filter(log => 
        log.message.includes('SecureDataManager not initialized')
      );
      expect(secureDataErrors).to.have.lengthOf(0);
    });
  });
  
  describe('Store Management Operations', function() {
    it('should allow editing store details', async function() {
      // Find edit button on first store card
      const storeCard = await driver.findElement(By.css('.store-card'));
      const editBtn = await storeCard.findElement(By.css('.edit-btn'));
      await editBtn.click();
      
      // Wait for edit modal
      await driver.wait(until.elementLocated(By.css('.edit-store-modal')), 5000);
      
      // Update store name
      const nameInput = await driver.findElement(By.css('input[name="storeName"]'));
      await nameInput.clear();
      await nameInput.sendKeys('Updated Store Name');
      
      // Save changes
      const saveBtn = await driver.findElement(By.css('.edit-store-modal button.save'));
      await saveBtn.click();
      
      // Wait for success message
      await driver.wait(until.elementLocated(By.css('.success-message')), 5000);
      
      // Verify store name was updated
      await driver.wait(until.elementTextContains(
        storeCard.findElement(By.css('.store-name')),
        'Updated Store Name'
      ), 5000);
    });
    
    it('should sync store data from Shopify', async function() {
      // Find sync button
      const storeCard = await driver.findElement(By.css('.store-card'));
      const syncBtn = await storeCard.findElement(By.css('.sync-btn'));
      
      // Click sync
      await syncBtn.click();
      
      // Wait for sync to start (loading indicator)
      await driver.wait(until.elementLocated(By.css('.sync-loading')), 2000);
      
      // Wait for sync to complete (timeout after 15 seconds)
      await driver.wait(until.elementLocated(By.css('.sync-complete')), 15000);
      
      // Check for updated sync timestamp
      const lastSync = await storeCard.findElement(By.css('.last-sync')).getText();
      expect(lastSync).to.include('Just now');
    });
  });
});