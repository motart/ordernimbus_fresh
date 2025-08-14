#!/usr/bin/env node
/**
 * Authentication Configuration Test
 * Verifies that API config endpoint returns complete data
 */

const https = require('https');

const API_CONFIG_URL = 'https://bggexzhlwb.execute-api.us-west-1.amazonaws.com/production/api/config';

// Colors for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  reset: '\x1b[0m'
};

/**
 * Fetch JSON from URL
 */
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({
            statusCode: res.statusCode,
            data: json
          });
        } catch (error) {
          reject(new Error(`Failed to parse JSON: ${error.message}`));
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Test authentication configuration
 */
async function testAuthConfig() {
  console.log('🔍 Testing Authentication Configuration\n');
  
  let allTestsPassed = true;
  
  // Test 1: Check config endpoint
  console.log('Test 1: Checking /api/config endpoint...');
  try {
    const response = await fetchJSON(API_CONFIG_URL);
    
    if (response.statusCode === 200) {
      console.log(`${colors.green}✅ Config endpoint is accessible (HTTP ${response.statusCode})${colors.reset}`);
      
      const config = response.data;
      
      // Check required fields
      const requiredFields = [
        'environment',
        'apiUrl',
        'region',
        'userPoolId',
        'clientId'
      ];
      
      const missingFields = [];
      const undefinedFields = [];
      
      requiredFields.forEach(field => {
        if (!(field in config)) {
          missingFields.push(field);
        } else if (config[field] === undefined || config[field] === null || config[field] === 'undefined') {
          undefinedFields.push(field);
        }
      });
      
      if (missingFields.length > 0) {
        console.log(`${colors.red}❌ Missing required fields: ${missingFields.join(', ')}${colors.reset}`);
        allTestsPassed = false;
      }
      
      if (undefinedFields.length > 0) {
        console.log(`${colors.red}❌ Undefined values for fields: ${undefinedFields.join(', ')}${colors.reset}`);
        allTestsPassed = false;
      }
      
      // Validate field values
      if (config.environment !== 'production') {
        console.log(`${colors.yellow}⚠️  Environment is '${config.environment}', expected 'production'${colors.reset}`);
      }
      
      if (config.apiUrl && config.apiUrl.includes('localhost')) {
        console.log(`${colors.red}❌ API URL contains localhost: ${config.apiUrl}${colors.reset}`);
        allTestsPassed = false;
      }
      
      if (config.userPoolId && !config.userPoolId.match(/^[a-z]{2}-[a-z]+-\d_[A-Za-z0-9]+$/)) {
        console.log(`${colors.yellow}⚠️  User Pool ID format looks incorrect: ${config.userPoolId}${colors.reset}`);
      }
      
      if (config.clientId && config.clientId.length < 20) {
        console.log(`${colors.yellow}⚠️  Client ID looks too short: ${config.clientId}${colors.reset}`);
      }
      
      // Display configuration
      console.log('\nConfiguration received:');
      console.log('  Environment:', config.environment || '(missing)');
      console.log('  API URL:', config.apiUrl || '(missing)');
      console.log('  Region:', config.region || '(missing)');
      console.log('  User Pool ID:', config.userPoolId || '(missing)');
      console.log('  Client ID:', config.clientId || '(missing)');
      
      if (config.features) {
        console.log('  Features:', JSON.stringify(config.features));
      }
      
      if (missingFields.length === 0 && undefinedFields.length === 0) {
        console.log(`${colors.green}✅ All required fields present and defined${colors.reset}`);
      }
      
    } else {
      console.log(`${colors.red}❌ Config endpoint returned HTTP ${response.statusCode}${colors.reset}`);
      allTestsPassed = false;
    }
  } catch (error) {
    console.log(`${colors.red}❌ Failed to fetch config: ${error.message}${colors.reset}`);
    allTestsPassed = false;
  }
  
  console.log('');
  
  // Test 2: Verify no localhost references
  console.log('Test 2: Checking for localhost references...');
  try {
    const response = await fetchJSON(API_CONFIG_URL);
    
    if (response.statusCode === 200) {
      const configStr = JSON.stringify(response.data);
      
      if (configStr.includes('localhost') || configStr.includes('127.0.0.1')) {
        console.log(`${colors.red}❌ Config contains localhost references${colors.reset}`);
        allTestsPassed = false;
      } else {
        console.log(`${colors.green}✅ No localhost references in configuration${colors.reset}`);
      }
    }
  } catch (error) {
    console.log(`${colors.yellow}⚠️  Could not check for localhost: ${error.message}${colors.reset}`);
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  if (allTestsPassed) {
    console.log(`${colors.green}✅ ALL TESTS PASSED - Authentication configuration is correct${colors.reset}`);
    return 0;
  } else {
    console.log(`${colors.red}❌ SOME TESTS FAILED - Please check the configuration${colors.reset}`);
    console.log('\nCommon fixes:');
    console.log('1. Ensure Lambda has USER_POOL_ID and USER_POOL_CLIENT_ID environment variables');
    console.log('2. Check that the config case is properly added to the Lambda switch statement');
    console.log('3. Verify CloudFormation stack has created Cognito resources');
    return 1;
  }
}

// Run tests
testAuthConfig()
  .then(exitCode => process.exit(exitCode))
  .catch(error => {
    console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
    process.exit(1);
  });