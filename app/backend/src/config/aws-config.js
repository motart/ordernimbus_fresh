const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { SSMClient, GetParameterCommand, GetParametersCommand } = require('@aws-sdk/client-ssm');
const AWSXRay = require('aws-xray-sdk-core');

// AWS Configuration
const awsConfig = {
  region: process.env.AWS_REGION || 'us-west-1',
  // ECS task role will provide credentials automatically
};

// Initialize AWS clients
const secretsManager = new SecretsManagerClient(awsConfig);
const ssmClient = new SSMClient(awsConfig);

// X-Ray configuration for distributed tracing
const initializeXRay = (app) => {
  if (process.env.AWS_XRAY_TRACING === 'true') {
    // Capture all AWS SDK calls
    const AWS = AWSXRay.captureAWS(require('aws-sdk'));
    
    // Capture HTTP calls
    AWSXRay.captureHTTPsGlobal(require('http'));
    AWSXRay.captureHTTPsGlobal(require('https'));
    
    // Configure X-Ray
    AWSXRay.config([
      AWSXRay.plugins.ECSPlugin,
      AWSXRay.plugins.EC2Plugin
    ]);
    
    // Set sampling rules
    if (process.env.XRAY_SAMPLING_RATE) {
      AWSXRay.middleware.setSamplingRules({
        version: 2,
        default: {
          fixed_target: 1,
          rate: parseFloat(process.env.XRAY_SAMPLING_RATE)
        }
      });
    }
    
    // Add X-Ray middleware to Express
    if (app) {
      app.use(AWSXRay.express.openSegment('OrderNimbus-API'));
    }
    
    console.log('AWS X-Ray tracing enabled');
  }
};

// Get secret from AWS Secrets Manager
const getSecret = async (secretName) => {
  try {
    const command = new GetSecretValueCommand({
      SecretId: secretName
    });
    
    const response = await secretsManager.send(command);
    
    if (response.SecretString) {
      return JSON.parse(response.SecretString);
    }
    
    // For binary secrets
    const buff = Buffer.from(response.SecretBinary, 'base64');
    return JSON.parse(buff.toString('ascii'));
  } catch (error) {
    console.error(`Error retrieving secret ${secretName}:`, error);
    throw error;
  }
};

// Get parameter from AWS Systems Manager Parameter Store
const getParameter = async (parameterName, decrypt = false) => {
  try {
    const command = new GetParameterCommand({
      Name: parameterName,
      WithDecryption: decrypt
    });
    
    const response = await ssmClient.send(command);
    return response.Parameter.Value;
  } catch (error) {
    console.error(`Error retrieving parameter ${parameterName}:`, error);
    return null;
  }
};

// Get multiple parameters from Parameter Store
const getParameters = async (parameterNames, decrypt = false) => {
  try {
    const command = new GetParametersCommand({
      Names: parameterNames,
      WithDecryption: decrypt
    });
    
    const response = await ssmClient.send(command);
    
    const parameters = {};
    response.Parameters.forEach(param => {
      parameters[param.Name] = param.Value;
    });
    
    return parameters;
  } catch (error) {
    console.error('Error retrieving parameters:', error);
    return {};
  }
};

// Load configuration from AWS services
const loadAWSConfig = async () => {
  const config = {};
  
  // Load from Secrets Manager if enabled
  if (process.env.USE_SECRETS_MANAGER === 'true') {
    try {
      const secretName = process.env.SECRETS_MANAGER_SECRET || 'ordernimbus/api/config';
      const secrets = await getSecret(secretName);
      Object.assign(config, secrets);
      console.log('Configuration loaded from AWS Secrets Manager');
    } catch (error) {
      console.error('Failed to load from Secrets Manager, using environment variables');
    }
  }
  
  // Load from Parameter Store if enabled
  if (process.env.USE_PARAMETER_STORE === 'true') {
    try {
      const paramPrefix = process.env.PARAMETER_STORE_PREFIX || '/ordernimbus/api/';
      const parameterNames = [
        `${paramPrefix}jwt-secret`,
        `${paramPrefix}database-url`,
        `${paramPrefix}cognito-client-id`,
        `${paramPrefix}cognito-user-pool-id`
      ];
      
      const parameters = await getParameters(parameterNames, true);
      
      // Map parameter store values to config keys
      if (parameters[`${paramPrefix}jwt-secret`]) {
        config.JWT_SECRET = parameters[`${paramPrefix}jwt-secret`];
      }
      if (parameters[`${paramPrefix}database-url`]) {
        config.DATABASE_URL = parameters[`${paramPrefix}database-url`];
      }
      if (parameters[`${paramPrefix}cognito-client-id`]) {
        config.COGNITO_CLIENT_ID = parameters[`${paramPrefix}cognito-client-id`];
      }
      if (parameters[`${paramPrefix}cognito-user-pool-id`]) {
        config.COGNITO_USER_POOL_ID = parameters[`${paramPrefix}cognito-user-pool-id`];
      }
      
      console.log('Configuration loaded from AWS Parameter Store');
    } catch (error) {
      console.error('Failed to load from Parameter Store, using environment variables');
    }
  }
  
  return config;
};

// Get ECS metadata
const getECSMetadata = async () => {
  const metadataUri = process.env.ECS_CONTAINER_METADATA_URI_V4;
  
  if (!metadataUri) {
    return null;
  }
  
  try {
    const axios = require('axios');
    const taskResponse = await axios.get(`${metadataUri}/task`);
    const containerResponse = await axios.get(`${metadataUri}/task/stats`);
    
    return {
      taskArn: taskResponse.data.TaskARN,
      family: taskResponse.data.Family,
      revision: taskResponse.data.Revision,
      availabilityZone: taskResponse.data.AvailabilityZone,
      containers: Object.keys(containerResponse.data)
    };
  } catch (error) {
    console.error('Error fetching ECS metadata:', error.message);
    return null;
  }
};

// Close X-Ray segment (for Express middleware)
const closeXRaySegment = (app) => {
  if (process.env.AWS_XRAY_TRACING === 'true' && app) {
    app.use(AWSXRay.express.closeSegment());
  }
};

module.exports = {
  initializeXRay,
  closeXRaySegment,
  getSecret,
  getParameter,
  getParameters,
  loadAWSConfig,
  getECSMetadata,
  AWSXRay
};