// Environment configuration for OrderNimbus
// Handles Dev, Staging, and Production environments

export interface EnvironmentConfig {
  apiUrl: string;
  shopifyRedirectUri: string;
  environment: 'development' | 'staging' | 'production';
  isSecure: boolean;
  features: {
    useWebCrypto: boolean;
    enableDebugLogs: boolean;
    mockShopifyData: boolean;
  };
}

// Environment detection
export const detectEnvironment = (): 'development' | 'staging' | 'production' => {
  // Check NODE_ENV first
  if (process.env.NODE_ENV === 'development') {
    return 'development';
  }
  
  // Check hostname patterns
  const hostname = window.location.hostname;
  
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'development';
  }
  
  if (hostname.includes('-staging-') || hostname.includes('staging')) {
    return 'staging';
  }
  
  return 'production';
};

// Check if running in secure context (HTTPS)
export const isSecureContext = (): boolean => {
  return window.location.protocol === 'https:' || 
         window.location.hostname === 'localhost' ||
         window.location.hostname === '127.0.0.1';
};

// Get API URL based on environment
export const getApiUrl = (): string => {
  const env = detectEnvironment();
  
  // Check for explicit environment variable first
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  
  switch (env) {
    case 'development':
      return 'http://127.0.0.1:3001';
    
    case 'staging':
      // Use deployed API Gateway for staging environment
      return process.env.REACT_APP_STAGING_API_URL || 'https://api.ordernimbus.com/staging';
    
    case 'production':
      // Production uses api.ordernimbus.com domain
      return process.env.REACT_APP_API_URL || 'https://api.ordernimbus.com/staging';
    
    default:
      return 'https://api.ordernimbus.com/staging';
  }
};

// Get Shopify redirect URI based on environment
export const getShopifyRedirectUri = (): string => {
  const env = detectEnvironment();
  
  switch (env) {
    case 'development':
      return 'http://localhost:3001/api/shopify/callback';
    
    case 'staging':
      return 'https://api.ordernimbus.com/staging/api/shopify/callback';
    
    case 'production':
      return 'https://api.ordernimbus.com/staging/api/shopify/callback';
    
    default:
      return 'https://api.ordernimbus.com/staging/api/shopify/callback';
  }
};

// Main environment configuration
export const getEnvironmentConfig = (): EnvironmentConfig => {
  const env = detectEnvironment();
  const isSecure = isSecureContext();
  
  return {
    apiUrl: getApiUrl(),
    shopifyRedirectUri: getShopifyRedirectUri(),
    environment: env,
    isSecure,
    features: {
      useWebCrypto: Boolean(isSecure && window.crypto && window.crypto.subtle),
      enableDebugLogs: env === 'development',
      mockShopifyData: env === 'development'
    }
  };
};

// Export current environment config
export const ENV_CONFIG = getEnvironmentConfig();

// Utility functions
export const isDevelopment = () => ENV_CONFIG.environment === 'development';
export const isStaging = () => ENV_CONFIG.environment === 'staging';
export const isProduction = () => ENV_CONFIG.environment === 'production';

// Debug logging
export const debugLog = (...args: any[]) => {
  if (ENV_CONFIG.features.enableDebugLogs) {
    console.log('[OrderNimbus Debug]', ...args);
  }
};

// Environment info for debugging
export const getEnvironmentInfo = () => {
  return {
    environment: ENV_CONFIG.environment,
    hostname: window.location.hostname,
    protocol: window.location.protocol,
    apiUrl: ENV_CONFIG.apiUrl,
    isSecure: ENV_CONFIG.isSecure,
    webCryptoAvailable: ENV_CONFIG.features.useWebCrypto,
    userAgent: navigator.userAgent
  };
};