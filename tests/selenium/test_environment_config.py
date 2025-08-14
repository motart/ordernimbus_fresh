#!/usr/bin/env python3
"""
Selenium Test for Environment Configuration
Ensures that production deployments never use localhost URLs
"""

import unittest
import time
import json
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.chrome.options import Options


class TestEnvironmentConfiguration(unittest.TestCase):
    """Test suite to verify environment configuration in production"""
    
    @classmethod
    def setUpClass(cls):
        """Set up Chrome driver with options"""
        chrome_options = Options()
        chrome_options.add_argument('--headless')  # Run in headless mode
        chrome_options.add_argument('--no-sandbox')
        chrome_options.add_argument('--disable-dev-shm-usage')
        chrome_options.add_argument('--disable-gpu')
        chrome_options.add_argument('--window-size=1920,1080')
        
        # Enable console log capture
        chrome_options.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
        
        cls.driver = webdriver.Chrome(options=chrome_options)
        cls.wait = WebDriverWait(cls.driver, 10)
    
    @classmethod
    def tearDownClass(cls):
        """Clean up after tests"""
        cls.driver.quit()
    
    def test_production_no_localhost(self):
        """Test that production site does not use localhost URLs"""
        # Test production URL
        production_url = "https://app.ordernimbus.com"
        
        print(f"Testing {production_url}...")
        self.driver.get(production_url)
        
        # Wait for page to load
        time.sleep(3)
        
        # Get console logs
        logs = self.driver.get_log('browser')
        
        # Check for localhost references in console
        localhost_errors = []
        for log in logs:
            message = log.get('message', '').lower()
            if 'localhost' in message or '127.0.0.1' in message or 'localhost:3001' in message:
                localhost_errors.append(log)
        
        # Assert no localhost references
        self.assertEqual(len(localhost_errors), 0, 
                        f"Found localhost references in production: {json.dumps(localhost_errors, indent=2)}")
        
        # Check network requests via Performance API
        network_check = self.driver.execute_script("""
            const entries = performance.getEntriesByType('resource');
            const localhostRequests = entries.filter(entry => 
                entry.name.includes('localhost') || 
                entry.name.includes('127.0.0.1')
            );
            return localhostRequests.map(r => r.name);
        """)
        
        self.assertEqual(len(network_check), 0,
                        f"Found localhost network requests: {network_check}")
        
        print("✅ No localhost references found in production")
    
    def test_cloudfront_serving(self):
        """Test that CloudFront is properly serving the application"""
        cloudfront_url = "https://d39qw5rr9tjqlc.cloudfront.net"
        
        print(f"Testing CloudFront URL {cloudfront_url}...")
        self.driver.get(cloudfront_url)
        
        # Wait for page to load
        time.sleep(2)
        
        # Check page title or content
        page_source = self.driver.page_source
        self.assertIn("OrderNimbus", page_source, "OrderNimbus app not found on CloudFront")
        
        # Get console logs
        logs = self.driver.get_log('browser')
        
        # Check for critical errors
        critical_errors = [log for log in logs if log.get('level') == 'SEVERE']
        
        # Filter out expected CORS or other non-critical errors
        real_errors = []
        for error in critical_errors:
            message = error.get('message', '')
            # Skip expected errors like CORS preflight
            if 'CORS' not in message and 'favicon' not in message:
                real_errors.append(error)
        
        self.assertEqual(len(real_errors), 0,
                        f"Found critical errors: {json.dumps(real_errors, indent=2)}")
        
        print("✅ CloudFront is properly serving the application")
    
    def test_api_configuration(self):
        """Test that API endpoints are correctly configured"""
        production_url = "https://app.ordernimbus.com"
        
        print(f"Testing API configuration at {production_url}...")
        self.driver.get(production_url)
        
        # Wait for page to load
        time.sleep(3)
        
        # Execute JavaScript to check environment configuration
        env_config = self.driver.execute_script("""
            // Try to get configuration from window or localStorage
            const config = window.ENV_CONFIG || 
                          window.__APP_CONFIG__ || 
                          JSON.parse(sessionStorage.getItem('app-config') || '{}');
            
            return {
                apiUrl: config.apiUrl || 'not-found',
                environment: config.environment || 'not-found',
                region: config.region || 'not-found'
            };
        """)
        
        # Verify API URL is not localhost
        self.assertNotIn('localhost', env_config.get('apiUrl', ''),
                        f"API URL contains localhost: {env_config.get('apiUrl')}")
        self.assertNotIn('127.0.0.1', env_config.get('apiUrl', ''),
                        f"API URL contains 127.0.0.1: {env_config.get('apiUrl')}")
        
        # Verify environment is production
        self.assertIn(env_config.get('environment', ''), ['production', 'not-found'],
                     f"Environment is not production: {env_config.get('environment')}")
        
        # Verify AWS region is set
        self.assertIn('us-', env_config.get('region', ''),
                     f"Invalid AWS region: {env_config.get('region')}")
        
        print(f"✅ API configuration is correct: {json.dumps(env_config, indent=2)}")
    
    def test_console_environment_logs(self):
        """Test console logs for environment configuration"""
        production_url = "https://app.ordernimbus.com"
        
        print(f"Checking console logs at {production_url}...")
        self.driver.get(production_url)
        
        # Wait for page to load and configuration to be logged
        time.sleep(3)
        
        # Get console logs
        logs = self.driver.get_log('browser')
        
        # Look for configuration logs
        config_logs = []
        for log in logs:
            message = log.get('message', '')
            if 'configuration' in message.lower() or 'environment' in message.lower():
                config_logs.append(message)
                
                # Check for specific bad patterns
                self.assertNotIn('environment: \'development\'', message,
                               "Environment is set to development in production!")
                self.assertNotIn('apiUrl: \'http://localhost', message,
                               "API URL is set to localhost in production!")
        
        print(f"✅ Found {len(config_logs)} configuration-related console logs")
        
        # Ensure we found some configuration logs
        self.assertGreater(len(config_logs), 0, "No configuration logs found in console")


def run_tests():
    """Run the test suite"""
    # Create test suite
    suite = unittest.TestLoader().loadTestsFromTestCase(TestEnvironmentConfiguration)
    
    # Run tests with verbose output
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    # Return 0 if successful, 1 if failures
    return 0 if result.wasSuccessful() else 1


if __name__ == '__main__':
    import sys
    sys.exit(run_tests())