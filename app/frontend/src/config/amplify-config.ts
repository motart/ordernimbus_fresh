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
    // Determine API URL based on environment
    let apiUrl = process.env.REACT_APP_API_URL;
    
    // If no API URL in env, determine based on hostname
    if (!apiUrl) {
      const hostname = window.location.hostname;
      if (hostname === 'app.ordernimbus.com' || hostname.includes('cloudfront.net')) {
        // Production
        apiUrl = 'https://bggexzhlwb.execute-api.us-west-1.amazonaws.com/production';
      } else if (hostname.includes('staging')) {
        // Staging
        apiUrl = 'https://staging-api.ordernimbus.com';
      } else {
        // Local development
        apiUrl = 'http://localhost:3001';
      }
    }
    
    console.log('Fetching configuration from:', `${apiUrl}/api/config`);
    const response = await fetch(`${apiUrl}/api/config`);
    
    if (response.ok) {
      const config = await response.json();
      console.log('Configuration loaded successfully:', config);
      
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