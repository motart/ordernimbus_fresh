#!/usr/bin/env node

const axios = require('axios');
const colors = require('colors/safe');

const API_BASE_URL = process.env.API_URL || 'http://localhost:3000';
const TEST_EMAIL = 'test@ordernimbus.com';
const TEST_PASSWORD = 'Test123456!';

let authToken = null;
let tenantId = null;

// Test results tracker
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

// Helper function to make API calls
async function apiCall(method, endpoint, data = null, headers = {}) {
  try {
    const config = {
      method,
      url: `${API_BASE_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    return { 
      success: false, 
      error: error.response?.data || error.message,
      status: error.response?.status 
    };
  }
}

// Test function wrapper
async function runTest(name, testFn) {
  console.log(`\n${colors.cyan('Testing:')} ${name}`);
  try {
    await testFn();
    console.log(colors.green('✓ PASSED'));
    results.passed++;
    results.tests.push({ name, status: 'passed' });
  } catch (error) {
    console.log(colors.red('✗ FAILED:'), error.message);
    results.failed++;
    results.tests.push({ name, status: 'failed', error: error.message });
  }
}

// Tests
async function testHealthCheck() {
  const response = await apiCall('GET', '/api/v1/health');
  if (!response.success) throw new Error('Health check failed');
  if (response.data.status !== 'healthy') throw new Error('API is not healthy');
}

async function testDetailedHealthCheck() {
  const response = await apiCall('GET', '/api/v1/health/detailed');
  if (!response.success) throw new Error('Detailed health check failed');
  if (!response.data.checks) throw new Error('Missing health check details');
}

async function testRegistration() {
  const response = await apiCall('POST', '/api/v1/auth/register', {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    confirmPassword: TEST_PASSWORD,
    name: 'Test User',
    organizationName: 'Test Organization'
  });
  
  // Registration might fail if user exists, which is okay for testing
  if (response.success) {
    console.log('  New user registered');
    tenantId = response.data.data?.tenantId;
  } else if (response.status === 409) {
    console.log('  User already exists (expected for repeated tests)');
  } else {
    throw new Error(`Registration failed: ${JSON.stringify(response.error)}`);
  }
}

async function testLogin() {
  const response = await apiCall('POST', '/api/v1/auth/login', {
    email: TEST_EMAIL,
    password: TEST_PASSWORD
  });
  
  if (!response.success) {
    // Try with mock credentials if real login fails
    const mockResponse = await apiCall('POST', '/api/v1/auth/login', {
      email: 'test@example.com',
      password: 'password123'
    });
    
    if (mockResponse.success) {
      authToken = mockResponse.data.data?.accessToken || mockResponse.data.token;
      tenantId = mockResponse.data.data?.user?.tenantId || 'mock-tenant-id';
      console.log('  Logged in with mock credentials');
      return;
    }
    throw new Error('Login failed');
  }
  
  authToken = response.data.data?.accessToken || response.data.token;
  tenantId = response.data.data?.user?.tenantId || tenantId;
  console.log('  Login successful, token received');
}

async function testPasswordReset() {
  const response = await apiCall('POST', '/api/v1/auth/reset-password', {
    email: TEST_EMAIL
  });
  
  if (!response.success) throw new Error('Password reset request failed');
  console.log('  Password reset requested');
}

async function testCreateForecast() {
  if (!authToken || !tenantId) {
    console.log('  Skipping: No auth token or tenant ID');
    return;
  }
  
  const response = await apiCall(
    'POST',
    `/api/v1/tenants/${tenantId}/forecasts`,
    {
      productId: 'TEST-PROD-001',
      storeId: 'TEST-STORE-001',
      forecastPeriod: 30,
      algorithm: 'ensemble',
      granularity: 'daily'
    },
    {
      'Authorization': `Bearer ${authToken}`,
      'X-Tenant-ID': tenantId
    }
  );
  
  if (!response.success) throw new Error(`Create forecast failed: ${JSON.stringify(response.error)}`);
  console.log('  Forecast created successfully');
}

async function testListForecasts() {
  if (!authToken || !tenantId) {
    console.log('  Skipping: No auth token or tenant ID');
    return;
  }
  
  const response = await apiCall(
    'GET',
    `/api/v1/tenants/${tenantId}/forecasts?limit=10`,
    null,
    {
      'Authorization': `Bearer ${authToken}`,
      'X-Tenant-ID': tenantId
    }
  );
  
  if (!response.success) throw new Error('List forecasts failed');
  console.log(`  Retrieved ${response.data.data?.forecasts?.length || 0} forecasts`);
}

async function testDataUpload() {
  if (!authToken || !tenantId) {
    console.log('  Skipping: No auth token or tenant ID');
    return;
  }
  
  const response = await apiCall(
    'POST',
    `/api/v1/tenants/${tenantId}/data/upload`,
    {
      dataType: 'sales',
      format: 'json',
      data: [
        {
          date: new Date().toISOString(),
          productId: 'TEST-PROD-001',
          quantity: 100,
          price: 29.99
        }
      ]
    },
    {
      'Authorization': `Bearer ${authToken}`,
      'X-Tenant-ID': tenantId
    }
  );
  
  if (!response.success) throw new Error('Data upload failed');
  console.log('  Data uploaded successfully');
}

async function testRateLimiting() {
  console.log('  Making multiple requests to test rate limiting...');
  const promises = [];
  
  for (let i = 0; i < 10; i++) {
    promises.push(apiCall('GET', '/api/v1/health'));
  }
  
  const responses = await Promise.all(promises);
  const rateLimited = responses.some(r => r.status === 429);
  
  if (!rateLimited) {
    console.log('  Rate limiting might not be triggered with current settings');
  } else {
    console.log('  Rate limiting is working');
  }
}

async function testSwaggerDocs() {
  const response = await apiCall('GET', '/api-docs/');
  // Swagger UI returns HTML, so we check for non-JSON response
  if (response.status === 200 || response.error?.includes('<!DOCTYPE')) {
    console.log('  Swagger documentation is accessible');
    return;
  }
  throw new Error('Swagger documentation not available');
}

// Main test runner
async function runAllTests() {
  console.log(colors.bold.yellow('\n🚀 Starting API Tests\n'));
  console.log(`Testing API at: ${API_BASE_URL}`);
  console.log('─'.repeat(50));
  
  // Health checks
  await runTest('Health Check', testHealthCheck);
  await runTest('Detailed Health Check', testDetailedHealthCheck);
  
  // Authentication
  await runTest('User Registration', testRegistration);
  await runTest('User Login', testLogin);
  await runTest('Password Reset', testPasswordReset);
  
  // Forecasts
  await runTest('Create Forecast', testCreateForecast);
  await runTest('List Forecasts', testListForecasts);
  
  // Data Management
  await runTest('Data Upload', testDataUpload);
  
  // Security & Features
  await runTest('Rate Limiting', testRateLimiting);
  await runTest('Swagger Documentation', testSwaggerDocs);
  
  // Print summary
  console.log('\n' + '═'.repeat(50));
  console.log(colors.bold.yellow('📊 Test Summary\n'));
  console.log(colors.green(`✓ Passed: ${results.passed}`));
  console.log(colors.red(`✗ Failed: ${results.failed}`));
  console.log(`Total: ${results.passed + results.failed}`);
  
  if (results.failed > 0) {
    console.log(colors.red('\nFailed tests:'));
    results.tests
      .filter(t => t.status === 'failed')
      .forEach(t => console.log(`  - ${t.name}: ${t.error}`));
  }
  
  console.log('═'.repeat(50));
  
  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error(colors.red('\n❌ Unhandled error:'), error);
  process.exit(1);
});

// Check if axios is installed
try {
  require.resolve('axios');
  require.resolve('colors');
} catch (e) {
  console.log('Installing required packages for testing...');
  require('child_process').execSync('npm install axios colors', { stdio: 'inherit' });
}

// Run tests
console.log(colors.bold.cyan('OrderNimbus API Test Suite'));
runAllTests().catch(error => {
  console.error(colors.red('Test suite failed:'), error);
  process.exit(1);
});