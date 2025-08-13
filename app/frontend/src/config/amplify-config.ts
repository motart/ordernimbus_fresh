/**
 * AWS Amplify Configuration
 * Configures Amplify with Cognito for authentication
 */

import { Amplify } from 'aws-amplify';

// Get configuration from environment variables or defaults
const getAmplifyConfig = () => {
  // For app.ordernimbus.com, use the production Cognito pool
  let region = process.env.REACT_APP_REGION || 'us-west-1';
  let userPoolId = process.env.REACT_APP_USER_POOL_ID;
  let userPoolClientId = process.env.REACT_APP_CLIENT_ID;
  
  // If running on app.ordernimbus.com and env vars not set, skip Cognito
  // Note: Cognito User Pool needs to be recreated
  if (window.location.hostname === 'app.ordernimbus.com' && (!userPoolId || !userPoolClientId)) {
    console.warn('Cognito not configured for app.ordernimbus.com - running in fallback mode');
    return null;
  }

  // Check if we have the required Cognito configuration
  if (!userPoolId || !userPoolClientId) {
    console.warn('AWS Cognito configuration not found. Authentication features will be limited.');
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

// Configure Amplify with cloud config
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
      console.log('AWS Amplify configured successfully');
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
  const config = getAmplifyConfig();
  return config !== null;
};