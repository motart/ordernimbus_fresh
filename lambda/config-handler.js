// Configuration Handler Lambda
// Returns configuration from AWS SSM Parameter Store

const AWS = require('aws-sdk');
const ssm = new AWS.SSM();

// Cache configuration for 5 minutes
let configCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getConfiguration() {
  const now = Date.now();
  
  // Return cached config if still valid
  if (configCache && (now - cacheTimestamp) < CACHE_TTL) {
    console.log('Returning cached configuration');
    return configCache;
  }
  
  console.log('Fetching configuration from SSM Parameter Store');
  
  try {
    const params = {
      Names: [
        '/ordernimbus/production/cognito/user-pool-id',
        '/ordernimbus/production/cognito/client-id',
        '/ordernimbus/production/api/endpoint',
        '/ordernimbus/production/frontend/cloudfront-domain'
      ],
      WithDecryption: true
    };
    
    const result = await ssm.getParameters(params).promise();
    
    // Build configuration object
    const config = {
      environment: process.env.ENVIRONMENT || 'production',
      region: process.env.AWS_REGION || 'us-west-1'
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
    
    // Add derived configurations
    config.graphqlUrl = `${config.apiUrl}/graphql`;
    config.wsUrl = config.apiUrl.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws';
    
    // Add feature flags
    config.features = {
      enableDebug: config.environment !== 'production',
      enableAnalytics: config.environment === 'production',
      enableMockData: false,
      useWebCrypto: true
    };
    
    // Cache the configuration
    configCache = config;
    cacheTimestamp = now;
    
    return config;
  } catch (error) {
    console.error('Failed to fetch configuration from SSM:', error);
    
    // Fallback to environment variables if SSM fails
    return {
      environment: process.env.ENVIRONMENT || 'production',
      apiUrl: process.env.API_URL || `https://${process.env.API_GATEWAY_ID}.execute-api.${process.env.AWS_REGION}.amazonaws.com/production`,
      region: process.env.AWS_REGION || 'us-west-1',
      userPoolId: process.env.USER_POOL_ID,
      clientId: process.env.USER_POOL_CLIENT_ID,
      features: {
        enableDebug: false,
        enableAnalytics: true,
        enableMockData: false,
        useWebCrypto: true
      }
    };
  }
}

exports.handler = async (event) => {
  console.log('Config request:', JSON.stringify(event));
  
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
    const config = await getConfiguration();
    
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