// K6 Load Test Suite for Sales Forecasting Platform
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const responseTrend = new Trend('response_time');

// Test configuration
export let options = {
  scenarios: {
    // Scenario 1: Normal API load
    api_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },
        { duration: '5m', target: 200 },
        { duration: '2m', target: 0 },
      ],
      gracefulRampDown: '30s',
      tags: { test_type: 'api_load' },
    },
    
    // Scenario 2: Peak traffic simulation
    peak_load: {
      executor: 'constant-arrival-rate',
      rate: 5000, // 5k RPS target
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 500,
      maxVUs: 1000,
      tags: { test_type: 'peak_load' },
    },
    
    // Scenario 3: Data upload stress
    upload_stress: {
      executor: 'constant-vus',
      vus: 20,
      duration: '3m',
      tags: { test_type: 'upload_stress' },
    },
    
    // Scenario 4: Multi-tenant isolation
    tenant_isolation: {
      executor: 'per-vu-iterations',
      vus: 100,
      iterations: 10,
      maxDuration: '5m',
      tags: { test_type: 'tenant_isolation' },
    }
  },
  
  thresholds: {
    // SLO requirements
    'http_req_duration{test_type:api_load}': ['p(95)<500'], // p95 < 500ms
    'http_req_duration{test_type:peak_load}': ['p(95)<500'],
    'http_req_failed': ['rate<0.01'], // 99% success rate
    'errors': ['rate<0.01'],
    
    // Performance budgets
    'http_req_duration{endpoint:forecasts}': ['p(95)<300'],
    'http_req_duration{endpoint:upload}': ['p(95)<2000'],
  }
};

// Test data
const BASE_URL = __ENV.API_BASE_URL || 'https://api.ordernimbus.com';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'test-token';
const TENANT_IDS = ['tenant-1', 'tenant-2', 'tenant-3'];

// Authentication headers
const headers = {
  'Authorization': `Bearer ${AUTH_TOKEN}`,
  'Content-Type': 'application/json',
  'X-Tenant-ID': TENANT_IDS[Math.floor(Math.random() * TENANT_IDS.length)]
};

export default function() {
  const tenantId = headers['X-Tenant-ID'];
  
  // Test scenario based on executor
  switch (__ENV.K6_SCENARIO) {
    case 'api_load':
      testAPILoad(tenantId);
      break;
    case 'peak_load':
      testPeakLoad(tenantId);
      break;
    case 'upload_stress':
      testUploadStress(tenantId);
      break;
    case 'tenant_isolation':
      testTenantIsolation(tenantId);
      break;
    default:
      testAPILoad(tenantId);
  }
}

function testAPILoad(tenantId) {
  // 1. Get forecasts (most common read operation)
  let response = http.get(
    `${BASE_URL}/api/v1/tenants/${tenantId}/forecasts?limit=50`,
    { headers, tags: { endpoint: 'forecasts' } }
  );
  
  check(response, {
    'forecast list status 200': (r) => r.status === 200,
    'forecast list response time < 500ms': (r) => r.timings.duration < 500,
    'forecast list has data': (r) => JSON.parse(r.body).data.length > 0,
  });
  
  errorRate.add(response.status !== 200);
  responseTrend.add(response.timings.duration);
  
  sleep(0.5);
  
  // 2. Get specific forecast details
  if (response.status === 200) {
    const forecasts = JSON.parse(response.body).data;
    if (forecasts.length > 0) {
      const forecastId = forecasts[0].id;
      
      response = http.get(
        `${BASE_URL}/api/v1/tenants/${tenantId}/forecasts/${forecastId}`,
        { headers, tags: { endpoint: 'forecast_detail' } }
      );
      
      check(response, {
        'forecast detail status 200': (r) => r.status === 200,
        'forecast detail response time < 300ms': (r) => r.timings.duration < 300,
      });
    }
  }
  
  sleep(1);
}

function testPeakLoad(tenantId) {
  // Lightweight read operations for peak load
  const endpoints = [
    `/api/v1/tenants/${tenantId}/forecasts`,
    `/api/v1/tenants/${tenantId}/metrics/summary`,
    `/api/v1/tenants/${tenantId}/data/status`,
  ];
  
  const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
  
  let response = http.get(`${BASE_URL}${endpoint}`, { 
    headers,
    tags: { endpoint: endpoint.split('/').pop() }
  });
  
  check(response, {
    'peak load status 200': (r) => r.status === 200,
    'peak load response time < 500ms': (r) => r.timings.duration < 500,
  });
  
  errorRate.add(response.status !== 200);
}

function testUploadStress(tenantId) {
  // Simulate CSV upload
  const csvData = generateCSVData(1000); // 1k rows
  
  let response = http.post(
    `${BASE_URL}/api/v1/tenants/${tenantId}/data/upload`,
    {
      file: http.file(csvData, 'sales_data.csv', 'text/csv'),
      format: 'csv',
      source: 'manual'
    },
    { 
      headers: { 
        'Authorization': headers.Authorization,
        'X-Tenant-ID': tenantId 
      },
      tags: { endpoint: 'upload' }
    }
  );
  
  check(response, {
    'upload status 202': (r) => r.status === 202,
    'upload response time < 2s': (r) => r.timings.duration < 2000,
    'upload has job id': (r) => JSON.parse(r.body).job_id !== undefined,
  });
  
  errorRate.add(response.status !== 202);
  
  sleep(2);
}

function testTenantIsolation(tenantId) {
  // Test that tenant data is properly isolated
  const otherTenantId = TENANT_IDS.find(id => id !== tenantId);
  
  // 1. Create data for current tenant
  let response = http.post(
    `${BASE_URL}/api/v1/tenants/${tenantId}/forecasts`,
    JSON.stringify({
      name: `Test Forecast ${tenantId} ${Date.now()}`,
      horizon_days: 30,
      sku_filters: ['SKU-123']
    }),
    { 
      headers,
      tags: { endpoint: 'create_forecast' }
    }
  );
  
  check(response, {
    'create forecast status 201': (r) => r.status === 201,
  });
  
  if (response.status === 201) {
    const forecastId = JSON.parse(response.body).id;
    
    // 2. Try to access from different tenant (should fail)
    response = http.get(
      `${BASE_URL}/api/v1/tenants/${otherTenantId}/forecasts/${forecastId}`,
      { 
        headers: {
          ...headers,
          'X-Tenant-ID': otherTenantId
        },
        tags: { endpoint: 'cross_tenant_access' }
      }
    );
    
    check(response, {
      'cross tenant access denied': (r) => r.status === 404 || r.status === 403,
    });
  }
  
  sleep(1);
}

function generateCSVData(rows) {
  let csv = 'date,sku,quantity,price\\n';
  const startDate = new Date('2024-01-01');
  
  for (let i = 0; i < rows; i++) {
    const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
    const sku = `SKU-${String(i % 100).padStart(3, '0')}`;
    const quantity = Math.floor(Math.random() * 100) + 1;
    const price = (Math.random() * 100 + 10).toFixed(2);
    
    csv += `${date.toISOString().split('T')[0]},${sku},${quantity},${price}\\n`;
  }
  
  return csv;
}

// Setup function runs once per VU
export function setup() {
  console.log(`Starting load test against ${BASE_URL}`);
  console.log(`Testing with ${TENANT_IDS.length} tenants`);
  
  // Verify API is accessible
  let response = http.get(`${BASE_URL}/health`);
  if (response.status !== 200) {
    throw new Error(`API health check failed: ${response.status}`);
  }
  
  return { baseUrl: BASE_URL, tenants: TENANT_IDS };
}

// Teardown function runs once after all VUs finish
export function teardown(data) {
  console.log('Load test completed');
  console.log(`Tested against: ${data.baseUrl}`);
}