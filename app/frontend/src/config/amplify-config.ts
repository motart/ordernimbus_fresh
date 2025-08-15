/**
 * AWS Amplify Configuration
 * Configures Amplify with Cognito for authentication
 */

import { Amplify } from 'aws-amplify';

// Cache for remote config
let cachedConfig: any = null;

// Fetch configuration from API
const fetchConfigFromAPI = async () => {
  try {
    // Get config endpoint from environment or determine dynamically
    let configEndpoint = process.env.REACT_APP_CONFIG_ENDPOINT;
    
    if (!configEndpoint) {
      const hostname = window.location.hostname;
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        configEndpoint = 'http://localhost:3001/api/config';
      } else if (hostname === 'app.ordernimbus.com' || hostname.includes('cloudfront.net')) {
        configEndpoint = 'https://p12brily0d.execute-api.us-west-1.amazonaws.com/production/api/config';
      } else if (process.env.REACT_APP_API_URL) {
        configEndpoint = `${process.env.REACT_APP_API_URL}/api/config`;
      }
    }
    
    if (!configEndpoint) {
      throw new Error('No configuration endpoint available');
    }
    
    // Fetching configuration from config endpoint
    const response = await fetch(configEndpoint);
    
    if (response.ok) {
      const config = await response.json();
      // Configuration loaded successfully
      
      // Store in session storage for quick access
      sessionStorage.setItem('app-config', JSON.stringify(config));
      
      return config;
    } else {
      console.error('Failed to fetch config, status:', response.status);
    }
  } catch (error) {
    console.error('Failed to fetch config from API:', error);
  }
  
  return null;
};

// Get configuration from environment variables
const getAmplifyConfig = () => {
  // Check environment variables
  const region = process.env.REACT_APP_REGION || 'us-west-1';
  const userPoolId = process.env.REACT_APP_USER_POOL_ID;
  const userPoolClientId = process.env.REACT_APP_CLIENT_ID;
  
  // Check if we have the required Cognito configuration
  if (!userPoolId || !userPoolClientId) {
    console.warn('AWS Cognito configuration not found in environment variables.');
    return null;
  }

  return {
    Auth: {
      Cognito: {
        userPoolId: userPoolId,
        userPoolClientId: userPoolClientId,
        region: region,
        loginWith: {
          email: true,
        },
        signUpVerificationMethod: 'code' as const,
        userAttributes: {
          email: {
            required: true,
          },
        },
        passwordFormat: {
          minLength: 8,
          requireLowercase: true,
          requireUppercase: true,
          requireNumbers: true,
        },
      },
    },
  };
};

// Configure Amplify with cloud config (preferred) or environment variables
export const configureAmplify = (cloudConfig?: { userPoolId: string; clientId: string; region: string }) => {
  // If cloud config is provided, use it directly
  if (cloudConfig) {
    const config = {
      Auth: {
        Cognito: {
          userPoolId: cloudConfig.userPoolId,
          userPoolClientId: cloudConfig.clientId,
          region: cloudConfig.region,
          loginWith: {
            email: true,
          },
          signUpVerificationMethod: 'code' as const,
          userAttributes: {
            email: {
              required: true,
            },
          },
          passwordFormat: {
            minLength: 8,
            requireLowercase: true,
            requireUppercase: true,
            requireNumbers: true,
          },
        },
      },
    };
    
    try {
      Amplify.configure(config);
      console.log('AWS Amplify configured with cloud config successfully');
      cachedConfig = config;
      return true;
    } catch (error) {
      console.error('Failed to configure AWS Amplify with cloud config:', error);
      return false;
    }
  }
  
  // Fallback to environment variables
  const config = getAmplifyConfig();
  
  if (config) {
    try {
      Amplify.configure(config);
      console.log('AWS Amplify configured with environment variables');
      cachedConfig = config;
      return true;
    } catch (error) {
      console.error('Failed to configure AWS Amplify:', error);
      return false;
    }
  }
  
  console.warn('Amplify not configured - running in fallback mode');
  return false;
};

// Export the configuration status
export const isAmplifyConfigured = () => {
  return cachedConfig !== null;
};

// Export fetch config function for use in ConfigContext
export { fetchConfigFromAPI };