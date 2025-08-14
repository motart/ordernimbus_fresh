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

// Get configuration from environment variables or API
const getAmplifyConfig = async () => {
  // For production, always fetch from API to ensure latest config
  const hostname = window.location.hostname;
  const isProduction = hostname === 'app.ordernimbus.com' || hostname.includes('cloudfront.net') || hostname.includes('s3-website');
  
  let region = 'us-west-1';
  let userPoolId: string | undefined;
  let userPoolClientId: string | undefined;
  
  if (isProduction) {
    console.log('Production environment detected, fetching config from API...');
    
    // Check session storage first for cached config
    const storedConfig = sessionStorage.getItem('app-config');
    if (storedConfig) {
      try {
        const config = JSON.parse(storedConfig);
        // Only use cached config if it has all required fields
        if (config.userPoolId && config.clientId) {
          userPoolId = config.userPoolId;
          userPoolClientId = config.clientId;
          region = config.region || region;
          console.log('Using cached configuration');
        }
      } catch (e) {
        console.error('Failed to parse stored config:', e);
      }
    }
    
    // Always fetch fresh config from API in production
    if (!userPoolId || !userPoolClientId) {
      const apiConfig = await fetchConfigFromAPI();
      if (apiConfig) {
        userPoolId = apiConfig.userPoolId;
        userPoolClientId = apiConfig.clientId;
        region = apiConfig.region || region;
      }
    }
  } else {
    // Development: use environment variables
    region = process.env.REACT_APP_REGION || 'us-west-1';
    userPoolId = process.env.REACT_APP_USER_POOL_ID;
    userPoolClientId = process.env.REACT_APP_CLIENT_ID;
    
    if (!userPoolId || !userPoolClientId) {
      console.log('Development: env vars missing, fetching from API...');
      const apiConfig = await fetchConfigFromAPI();
      if (apiConfig) {
        userPoolId = apiConfig.userPoolId;
        userPoolClientId = apiConfig.clientId;
        region = apiConfig.region || region;
      }
    }
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

// Configure Amplify
export const configureAmplify = async () => {
  const config = await getAmplifyConfig();
  
  if (config) {
    try {
      Amplify.configure(config);
      console.log('AWS Amplify configured successfully');
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