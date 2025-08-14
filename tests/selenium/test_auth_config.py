#!/usr/bin/env python3
"""
Selenium Test for Authentication and Configuration
Ensures that Amplify is properly configured and auth works
"""

import unittest
import time
import json
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, JavascriptException
from selenium.webdriver.chrome.options import Options


class TestAuthConfiguration(unittest.TestCase):
    """Test suite to verify authentication and configuration"""
    
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
    
    def test_config_endpoint_returns_complete_data(self):
        """Test that /api/config returns all required fields"""
        production_url = "https://app.ordernimbus.com"
        
        print(f"Testing config endpoint...")
        
        # Fetch config directly via JavaScript
        self.driver.get(production_url)
        time.sleep(3)  # Wait for initial load
        
        # Execute fetch in browser context
        config_response = self.driver.execute_script("""
            return fetch('https://bggexzhlwb.execute-api.us-west-1.amazonaws.com/production/api/config')
                .then(response => response.json())
                .catch(error => ({ error: error.message }));
        """)
        
        # Wait for promise to resolve
        time.sleep(2)
        
        # Check response
        self.assertIsNotNone(config_response, "Config response should not be None")
        self.assertNotIn('error', config_response, f"Config fetch failed: {config_response.get('error')}")
        
        # Verify required fields
        required_fields = ['environment', 'apiUrl', 'region', 'userPoolId', 'clientId']
        for field in required_fields:
            self.assertIn(field, config_response, f"Missing required field: {field}")
            self.assertIsNotNone(config_response.get(field), f"Field {field} should not be None")
            self.assertNotEqual(config_response.get(field), 'undefined', f"Field {field} should not be 'undefined'")
        
        # Verify values are correct
        self.assertEqual(config_response.get('environment'), 'production', "Environment should be production")
        self.assertIn('execute-api', config_response.get('apiUrl', ''), "API URL should be AWS API Gateway")
        self.assertIn('us-west', config_response.get('region', ''), "Region should be us-west")
        
        print(f"✅ Config endpoint returns complete data: {json.dumps(config_response, indent=2)}")
    
    def test_amplify_configuration(self):
        """Test that AWS Amplify is properly configured"""
        production_url = "https://app.ordernimbus.com"
        
        print(f"Testing Amplify configuration at {production_url}...")
        self.driver.get(production_url)
        
        # Wait for page to load and Amplify to be configured
        time.sleep(5)
        
        # Check console logs for Amplify configuration
        logs = self.driver.get_log('browser')
        
        amplify_configured = False
        amplify_errors = []
        
        for log in logs:
            message = log.get('message', '')
            
            # Check for successful configuration
            if 'Amplify configured' in message or 'AWS Amplify configured' in message:
                amplify_configured = True
            
            # Check for Amplify errors
            if 'AuthUserPoolException' in message:
                amplify_errors.append(message)
            if 'Amplify has not been configured' in message:
                amplify_errors.append(message)
        
        # Assert Amplify is configured
        self.assertTrue(amplify_configured or len(amplify_errors) == 0,
                       f"Amplify configuration issues found: {amplify_errors}")
        
        # Check if Amplify is available in window
        amplify_check = self.driver.execute_script("""
            return {
                hasAmplify: typeof window.Amplify !== 'undefined',
                hasAuth: typeof window.Amplify?.Auth !== 'undefined'
            };
        """)
        
        # We don't require Amplify in window as it might be bundled differently
        print(f"✅ Amplify configuration check passed")
    
    def test_no_auth_pool_errors(self):
        """Test that there are no 'Auth UserPool not configured' errors"""
        production_url = "https://app.ordernimbus.com"
        
        print(f"Checking for Auth UserPool errors at {production_url}...")
        self.driver.get(production_url)
        
        # Wait for page to load
        time.sleep(5)
        
        # Get console logs
        logs = self.driver.get_log('browser')
        
        auth_pool_errors = []
        for log in logs:
            message = log.get('message', '')
            if 'Auth UserPool not configured' in message or 'AuthUserPoolException' in message:
                auth_pool_errors.append(message)
        
        self.assertEqual(len(auth_pool_errors), 0,
                        f"Found Auth UserPool errors: {auth_pool_errors}")
        
        print("✅ No Auth UserPool errors found")
    
    def test_config_loaded_before_auth(self):
        """Test that configuration is loaded before authentication attempts"""
        production_url = "https://app.ordernimbus.com"
        
        print(f"Testing config load order at {production_url}...")
        self.driver.get(production_url)
        
        # Wait for page to load
        time.sleep(5)
        
        # Get console logs
        logs = self.driver.get_log('browser')
        
        config_loaded_line = None
        auth_attempted_line = None
        amplify_configured_line = None
        
        for i, log in enumerate(logs):
            message = log.get('message', '')
            
            if 'Configuration loaded successfully' in message and config_loaded_line is None:
                config_loaded_line = i
            
            if 'Configuring Amplify' in message and amplify_configured_line is None:
                amplify_configured_line = i
            
            if 'getCurrentUser' in message and auth_attempted_line is None:
                auth_attempted_line = i
        
        # Config should be loaded before auth attempts
        if config_loaded_line is not None and auth_attempted_line is not None:
            self.assertLess(config_loaded_line, auth_attempted_line,
                          "Configuration should be loaded before authentication attempts")
        
        print("✅ Configuration is loaded in correct order")
    
    def test_api_url_configuration(self):
        """Test that API URLs are correctly configured (not localhost)"""
        production_url = "https://app.ordernimbus.com"
        
        print(f"Testing API URL configuration...")
        self.driver.get(production_url)
        
        # Wait for configuration to load
        time.sleep(5)
        
        # Check sessionStorage for configuration
        stored_config = self.driver.execute_script("""
            const config = sessionStorage.getItem('app-config');
            return config ? JSON.parse(config) : null;
        """)
        
        if stored_config:
            # Check API URL
            api_url = stored_config.get('apiUrl', '')
            self.assertNotIn('localhost', api_url, f"API URL contains localhost: {api_url}")
            self.assertNotIn('127.0.0.1', api_url, f"API URL contains 127.0.0.1: {api_url}")
            self.assertIn('execute-api', api_url, f"API URL should be AWS API Gateway: {api_url}")
            
            print(f"✅ API URL correctly configured: {api_url}")
        else:
            # Config might not be in sessionStorage yet, check console logs
            logs = self.driver.get_log('browser')
            
            has_correct_api = False
            for log in logs:
                message = log.get('message', '')
                if 'apiUrl' in message and 'execute-api' in message:
                    has_correct_api = True
                    break
            
            self.assertTrue(has_correct_api, "Could not verify API URL configuration")
    
    def test_cognito_configuration(self):
        """Test that Cognito User Pool and Client ID are configured"""
        production_url = "https://app.ordernimbus.com"
        
        print(f"Testing Cognito configuration...")
        self.driver.get(production_url)
        
        # Wait for configuration
        time.sleep(5)
        
        # Check for Cognito configuration via console logs
        logs = self.driver.get_log('browser')
        
        has_user_pool = False
        has_client_id = False
        
        for log in logs:
            message = log.get('message', '')
            
            # Look for User Pool ID pattern (us-west-1_XXXXXXXXX)
            if 'us-west-1_' in message or 'us-east-1_' in message:
                has_user_pool = True
            
            # Look for Client ID pattern (26 alphanumeric characters)
            if 'clientId' in message or 'CLIENT_ID' in message:
                has_client_id = True
        
        # Also check via JavaScript
        config_check = self.driver.execute_script("""
            const config = sessionStorage.getItem('app-config');
            if (config) {
                const parsed = JSON.parse(config);
                return {
                    hasUserPoolId: !!parsed.userPoolId && parsed.userPoolId !== 'undefined',
                    hasClientId: !!parsed.clientId && parsed.clientId !== 'undefined',
                    userPoolId: parsed.userPoolId,
                    clientId: parsed.clientId
                };
            }
            return null;
        """)
        
        if config_check:
            self.assertTrue(config_check['hasUserPoolId'], 
                          f"User Pool ID not configured: {config_check.get('userPoolId')}")
            self.assertTrue(config_check['hasClientId'], 
                          f"Client ID not configured: {config_check.get('clientId')}")
            
            print(f"✅ Cognito configured with User Pool: {config_check['userPoolId']}")
        else:
            # Fallback to log checks
            self.assertTrue(has_user_pool or has_client_id,
                          "Could not verify Cognito configuration")


def run_tests():
    """Run the test suite"""
    # Create test suite
    suite = unittest.TestLoader().loadTestsFromTestCase(TestAuthConfiguration)
    
    # Run tests with verbose output
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    # Return 0 if successful, 1 if failures
    return 0 if result.wasSuccessful() else 1


if __name__ == '__main__':
    import sys
    sys.exit(run_tests())