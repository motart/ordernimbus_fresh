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
  // Check explicit environment variable first
  const envVar = process.env.REACT_APP_ENVIRONMENT;
  if (envVar === 'local' || envVar === 'development') {
    return 'development';
  }
  if (envVar === 'staging') {
    return 'staging';
  }
  if (envVar === 'production') {
    return 'production';
  }
  
  // Check NODE_ENV
  if (process.env.NODE_ENV === 'development') {
    return 'development';
  }
  
  // Check hostname patterns
  const hostname = window.location.hostname;
  
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'development';
  }
  
  if (hostname.includes('staging')) {
    return 'staging';
  }
  
  // Everything else is production (app.ordernimbus.com)
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
  // CRITICAL: Always use API URL from build environment in production
  if (process.env.REACT_APP_API_URL) {
    console.log('Using API URL from build:', process.env.REACT_APP_API_URL);
    return process.env.REACT_APP_API_URL;
  }
  
  // Fallback based on detected environment
  const env = detectEnvironment();
  
  switch (env) {
    case 'development':
      // Local development
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:3001';
      }
      return 'http://localhost:3001';
    case 'staging':
      // Staging should always have REACT_APP_API_URL set
      console.warn('No REACT_APP_API_URL for staging - using fallback');
      return 'https://staging-api.ordernimbus.com';
    case 'production':
    default:
      // PRODUCTION MUST HAVE REACT_APP_API_URL SET DURING BUILD
      console.error('CRITICAL: No REACT_APP_API_URL in production! Deploy script must set this.');
      // Try to use api.ordernimbus.com if DNS is configured
      if (window.location.hostname.includes('ordernimbus.com')) {
        return 'https://api.ordernimbus.com';
      }
      // This should never be reached in properly deployed production
      return 'https://api.ordernimbus.com';
  }
};

// Get Shopify redirect URI based on environment
export const getShopifyRedirectUri = (): string => {
  // Use the same API URL logic for consistency
  const apiUrl = getApiUrl();
  return `${apiUrl}/api/shopify/callback`;
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
      mockShopifyData: env === 'development' && !process.env.REACT_APP_API_URL
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