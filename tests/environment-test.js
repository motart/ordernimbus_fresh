#!/usr/bin/env node
/**
 * Environment Configuration Test
 * Verifies that production deployments don't use localhost URLs
 */

const https = require('https');
const http = require('http');

const PRODUCTION_URL = 'https://app.ordernimbus.com';
const CLOUDFRONT_URL = 'https://d39qw5rr9tjqlc.cloudfront.net';

// Colors for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  reset: '\x1b[0m'
};

/**
 * Fetch content from URL
 */
function fetchContent(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    
    client.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Test for localhost references in content
 */
function testForLocalhost(content, url) {
  const issues = [];
  
  // Check for localhost references
  const localhostPatterns = [
    /localhost:3001/gi,
    /localhost:3000/gi,
    /127\.0\.0\.1:3001/gi,
    /127\.0\.0\.1:3000/gi,
    /http:\/\/localhost/gi,
    /apiUrl.*localhost/gi,
    /environment.*development/gi
  ];
  
  localhostPatterns.forEach(pattern => {
    const matches = content.match(pattern);
    if (matches) {
      issues.push({
        pattern: pattern.toString(),
        matches: matches.slice(0, 5), // First 5 matches
        count: matches.length
      });
    }
  });
  
  return issues;
}

/**
 * Test environment configuration
 */
async function testEnvironmentConfig() {
  console.log('🔍 Testing Environment Configuration\n');
  
  let allTestsPassed = true;
  const results = [];
  
  // Test 1: Check if app.ordernimbus.com is accessible
  console.log('Test 1: Checking app.ordernimbus.com accessibility...');
  try {
    const response = await fetchContent(PRODUCTION_URL);
    
    if (response.statusCode === 200) {
      console.log(`${colors.green}✅ app.ordernimbus.com is accessible (HTTP ${response.statusCode})${colors.reset}`);
      
      // Check for localhost in content
      const issues = testForLocalhost(response.body, PRODUCTION_URL);
      
      if (issues.length > 0) {
        console.log(`${colors.red}❌ Found localhost references in production:${colors.reset}`);
        issues.forEach(issue => {
          console.log(`   - Pattern: ${issue.pattern}`);
          console.log(`     Found ${issue.count} matches`);
          console.log(`     Examples: ${issue.matches.join(', ')}`);
        });
        allTestsPassed = false;
      } else {
        console.log(`${colors.green}✅ No localhost references found${colors.reset}`);
      }
    } else {
      console.log(`${colors.yellow}⚠️  app.ordernimbus.com returned HTTP ${response.statusCode}${colors.reset}`);
      allTestsPassed = false;
    }
  } catch (error) {
    console.log(`${colors.red}❌ Failed to reach app.ordernimbus.com: ${error.message}${colors.reset}`);
    allTestsPassed = false;
  }
  
  console.log('');
  
  // Test 2: Check CloudFront distribution
  console.log('Test 2: Checking CloudFront distribution...');
  try {
    const response = await fetchContent(CLOUDFRONT_URL);
    
    if (response.statusCode === 200) {
      console.log(`${colors.green}✅ CloudFront is serving content (HTTP ${response.statusCode})${colors.reset}`);
      
      // Verify it's the React app
      if (response.body.includes('OrderNimbus') || response.body.includes('root')) {
        console.log(`${colors.green}✅ CloudFront is serving the OrderNimbus app${colors.reset}`);
      } else {
        console.log(`${colors.yellow}⚠️  CloudFront content doesn't look like OrderNimbus app${colors.reset}`);
      }
    } else {
      console.log(`${colors.yellow}⚠️  CloudFront returned HTTP ${response.statusCode}${colors.reset}`);
      allTestsPassed = false;
    }
  } catch (error) {
    console.log(`${colors.red}❌ Failed to reach CloudFront: ${error.message}${colors.reset}`);
    allTestsPassed = false;
  }
  
  console.log('');
  
  // Test 3: Check main JavaScript bundle
  console.log('Test 3: Checking JavaScript bundle configuration...');
  try {
    const response = await fetchContent(PRODUCTION_URL);
    
    // Extract main.js URL from HTML
    const mainJsMatch = response.body.match(/static\/js\/main\.[a-z0-9]+\.js/);
    
    if (mainJsMatch) {
      const jsUrl = `${PRODUCTION_URL}/${mainJsMatch[0]}`;
      console.log(`   Found main.js: ${mainJsMatch[0]}`);
      
      const jsResponse = await fetchContent(jsUrl);
      
      if (jsResponse.statusCode === 200) {
        // Check for environment variables in bundle
        const hasProductionEnv = jsResponse.body.includes('REACT_APP_ENVIRONMENT:"production"') ||
                                jsResponse.body.includes('environment:"production"');
        const hasLocalhostApi = jsResponse.body.includes('REACT_APP_API_URL:"http://localhost') ||
                               jsResponse.body.includes('apiUrl:"http://localhost');
        
        if (hasProductionEnv && !hasLocalhostApi) {
          console.log(`${colors.green}✅ JavaScript bundle has correct production configuration${colors.reset}`);
        } else {
          if (!hasProductionEnv) {
            console.log(`${colors.red}❌ JavaScript bundle doesn't have production environment set${colors.reset}`);
          }
          if (hasLocalhostApi) {
            console.log(`${colors.red}❌ JavaScript bundle contains localhost API URLs${colors.reset}`);
          }
          allTestsPassed = false;
        }
      }
    } else {
      console.log(`${colors.yellow}⚠️  Could not find main.js reference in HTML${colors.reset}`);
    }
  } catch (error) {
    console.log(`${colors.yellow}⚠️  Could not check JavaScript bundle: ${error.message}${colors.reset}`);
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  if (allTestsPassed) {
    console.log(`${colors.green}✅ ALL TESTS PASSED - Production environment is correctly configured${colors.reset}`);
    return 0;
  } else {
    console.log(`${colors.red}❌ SOME TESTS FAILED - Please check the configuration${colors.reset}`);
    console.log('\nCommon fixes:');
    console.log('1. Ensure .env.local is not overriding production values');
    console.log('2. Run: REACT_APP_ENVIRONMENT=production npm run build');
    console.log('3. Deploy with: ./deploy.sh production us-west-1');
    return 1;
  }
}

// Run tests
testEnvironmentConfig()
  .then(exitCode => process.exit(exitCode))
  .catch(error => {
    console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
    process.exit(1);
  });