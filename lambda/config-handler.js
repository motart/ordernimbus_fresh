// Configuration Handler Lambda
// Returns configuration from AWS SSM Parameter Store

const AWS = require('aws-sdk');

// Configure AWS SDK with region
AWS.config.update({
  region: process.env.AWS_REGION || 'us-west-1'
});

const ssm = new AWS.SSM();

// Cache configuration for 5 minutes
let configCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getConfiguration(event) {
  const now = Date.now();
  
  // Determine environment from the request context
  const stage = event.requestContext?.stage || 'production';
  const environment = stage === 'prod' ? 'production' : stage;
  
  // Create cache key based on environment
  const cacheKey = `config-${environment}`;
  
  // Return cached config if still valid
  if (configCache && configCache.environment === environment && (now - cacheTimestamp) < CACHE_TTL) {
    // Returning cached configuration
    return configCache;
  }
  
  // Fetching configuration from SSM Parameter Store
  
  try {
    const params = {
      Names: [
        `/ordernimbus/${environment}/cognito/user-pool-id`,
        `/ordernimbus/${environment}/cognito/client-id`,
        `/ordernimbus/${environment}/api/endpoint`,
        `/ordernimbus/${environment}/frontend/cloudfront-domain`
      ],
      WithDecryption: true
    };
    
    const result = await ssm.getParameters(params).promise();
    
    // Build configuration object
    const config = {
      environment: environment,
      region: process.env.AWS_REGION || 'us-west-1',
      version: process.env.VERSION || '1.0.0'
    };
    
    // Map parameters to config
    result.Parameters.forEach(param => {
      const key = param.Name.split('/').pop();
      switch (key) {
        case 'user-pool-id':
          config.userPoolId = param.Value;
          break;
        case 'client-id':
          config.clientId = param.Value;
          break;
        case 'endpoint':
          config.apiUrl = param.Value;
          break;
        case 'cloudfront-domain':
          config.cloudfrontDomain = param.Value;
          break;
      }
    });
    
    // Add derived configurations (only if apiUrl exists)
    if (config.apiUrl) {
      config.graphqlUrl = `${config.apiUrl}/graphql`;
      config.wsUrl = config.apiUrl.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws';
    } else {
      config.graphqlUrl = '';
      config.wsUrl = '';
    }
    
    // Add feature flags based on environment
    config.features = {
      enableDebug: environment !== 'production',
      enableAnalytics: environment === 'production',
      enableMockData: false,
      useWebCrypto: true,
      shopifyIntegration: true,
      csvUpload: true,
      multiTenant: true
    };
    
    // Additional settings
    config.maxFileUploadSize = 52428800; // 50MB
    config.supportedFileTypes = ['.csv', '.xlsx', '.xls'];
    config.sessionTimeout = 3600000; // 1 hour
    config.buildTime = process.env.BUILD_TIME || new Date().toISOString();
    config.deploymentId = process.env.DEPLOYMENT_ID || `${environment}-${Date.now()}`;
    
    // Cache the configuration
    configCache = config;
    cacheTimestamp = now;
    
    return config;
  } catch (error) {
    console.error('Failed to fetch configuration from SSM:', error);
    
    // Return error response - no fallback to hardcoded values
    throw new Error(`Configuration not available for environment: ${environment}`);
  }
}

exports.handler = async (event) => {
  // Processing config request
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Content-Type': 'application/json'
  };
  
  // Handle OPTIONS for CORS
  if (event.httpMethod === 'OPTIONS' || event.requestContext?.http?.method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }
  
  try {
    const config = await getConfiguration(event);
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(config)
    };
  } catch (error) {
    console.error('Error in config handler:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Failed to retrieve configuration',
        message: error.message
      })
    };
  }
};