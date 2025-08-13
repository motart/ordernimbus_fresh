/**
 * Environment Configuration for OrderNimbus
 * 
 * @description
 * Centralized configuration system that reads from environment variables.
 * NO HARDCODING - all values come from .env files or build-time variables.
 * 
 * @hierarchy
 * 1. Process environment variables (REACT_APP_*)
 * 2. .env.production or .env.local files
 * 3. Fallback values for development only
 * 
 * @environments
 * - development: Local development (localhost)
 * - staging: Staging environment
 * - production: Production environment (app.ordernimbus.com)
 */

export interface EnvironmentConfig {
  // Application URLs
  appUrl: string;           // Where the frontend app is served (app.ordernimbus.com)
  apiUrl: string;           // Where the REST API is served (api.ordernimbus.com)
  graphqlUrl?: string;      // GraphQL endpoint (api.ordernimbus.com/graphql)
  wsUrl?: string;           // WebSocket endpoint for real-time features
  
  // Authentication
  userPoolId: string;       // AWS Cognito User Pool ID
  clientId: string;         // AWS Cognito Client ID
  region: string;           // AWS Region
  
  // Environment
  environment: 'development' | 'staging' | 'production';
  isSecure: boolean;        // HTTPS context
  
  // Shopify Integration
  shopifyRedirectUri: string;
  
  // Feature Flags
  features: {
    enableDebug: boolean;
    enableAnalytics: boolean;
    enableMockData: boolean;
    useWebCrypto: boolean;
  };
}

/**
 * Get configuration value from environment
 * Returns undefined if not set (no hardcoded defaults in production)
 */
const getEnvVar = (key: string, defaultValue?: string): string | undefined => {
  const value = process.env[key];
  
  // In production, we should never use defaults - configuration must be explicit
  if (process.env.NODE_ENV === 'production' && !value && !defaultValue) {
    console.warn(`Missing required environment variable: ${key}`);
    return undefined;
  }
  
  return value || defaultValue;
};

/**
 * Detect current environment based on hostname and env variables
 */
export const detectEnvironment = (): 'development' | 'staging' | 'production' => {
  // Explicit environment variable takes precedence
  const envVar = getEnvVar('REACT_APP_ENVIRONMENT');
  if (envVar === 'development' || envVar === 'local') return 'development';
  if (envVar === 'staging') return 'staging';
  if (envVar === 'production') return 'production';
  
  // Fallback to hostname detection
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return 'development';
  if (hostname.includes('staging')) return 'staging';
  
  return 'production';
};

/**
 * Check if running in secure context (HTTPS)
 */
export const isSecureContext = (): boolean => {
  return window.location.protocol === 'https:' || 
         window.location.hostname === 'localhost' ||
         window.location.hostname === '127.0.0.1';
};

/**
 * Get complete environment configuration
 * All values come from environment variables - no hardcoding
 */
export const getEnvironmentConfig = (): EnvironmentConfig => {
  const env = detectEnvironment();
  const isSecure = isSecureContext();
  
  // Read all configuration from environment variables
  const appUrl = getEnvVar('REACT_APP_APP_URL') || 
    (env === 'development' ? 'http://localhost:3000' : window.location.origin);
    
  const apiUrl = getEnvVar('REACT_APP_API_URL');
  if (!apiUrl) {
    // Only provide fallback in development
    if (env === 'development') {
      console.warn('REACT_APP_API_URL not set, using localhost:3001');
      return getDevConfig();
    }
    throw new Error('REACT_APP_API_URL is required but not configured');
  }
  
  const userPoolId = getEnvVar('REACT_APP_USER_POOL_ID');
  const clientId = getEnvVar('REACT_APP_CLIENT_ID');
  
  if (!userPoolId || !clientId) {
    if (env === 'development') {
      console.warn('Cognito configuration missing, using development defaults');
      return getDevConfig();
    }
    throw new Error('Cognito configuration (USER_POOL_ID, CLIENT_ID) is required');
  }
  
  return {
    // URLs - all from environment variables
    appUrl,
    apiUrl,
    graphqlUrl: getEnvVar('REACT_APP_GRAPHQL_URL') || `${apiUrl}/graphql`,
    wsUrl: getEnvVar('REACT_APP_WS_URL') || apiUrl.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws',
    
    // Authentication
    userPoolId,
    clientId,
    region: getEnvVar('REACT_APP_REGION') || 'us-west-1',
    
    // Environment
    environment: env,
    isSecure,
    
    // Shopify
    shopifyRedirectUri: getEnvVar('REACT_APP_SHOPIFY_REDIRECT_URI') || `${apiUrl}/api/shopify/callback`,
    
    // Features
    features: {
      enableDebug: getEnvVar('REACT_APP_ENABLE_DEBUG') === 'true',
      enableAnalytics: getEnvVar('REACT_APP_ENABLE_ANALYTICS') === 'true',
      enableMockData: getEnvVar('REACT_APP_ENABLE_MOCK_DATA') === 'true',
      useWebCrypto: isSecure && Boolean(window.crypto?.subtle)
    }
  };
};

/**
 * Development configuration fallback
 * Only used when environment variables are not set in development
 */
const getDevConfig = (): EnvironmentConfig => {
  console.warn('Using development fallback configuration');
  return {
    appUrl: 'http://localhost:3000',
    apiUrl: 'http://localhost:3001',
    graphqlUrl: 'http://localhost:3001/graphql',
    wsUrl: 'ws://localhost:3001/ws',
    userPoolId: 'dev-pool-id',
    clientId: 'dev-client-id',
    region: 'us-west-1',
    environment: 'development',
    isSecure: false,
    shopifyRedirectUri: 'http://localhost:3001/api/shopify/callback',
    features: {
      enableDebug: true,
      enableAnalytics: false,
      enableMockData: true,
      useWebCrypto: false
    }
  };
};

/**
 * Export singleton configuration
 */
let _config: EnvironmentConfig | null = null;

export const ENV_CONFIG = (() => {
  if (!_config) {
    try {
      _config = getEnvironmentConfig();
      
      // Log configuration in development
      if (_config.features.enableDebug) {
        console.log('OrderNimbus Configuration:', {
          environment: _config.environment,
          appUrl: _config.appUrl,
          apiUrl: _config.apiUrl,
          graphqlUrl: _config.graphqlUrl,
          region: _config.region
        });
      }
    } catch (error) {
      console.error('Failed to initialize environment configuration:', error);
      
      // In development, use fallback
      if (process.env.NODE_ENV === 'development') {
        _config = getDevConfig();
      } else {
        throw error;
      }
    }
  }
  return _config;
})();

/**
 * Utility functions for easy access
 */
export const getApiUrl = (): string => ENV_CONFIG.apiUrl;
export const getAppUrl = (): string => ENV_CONFIG.appUrl;
export const getGraphQLUrl = (): string => ENV_CONFIG.graphqlUrl || `${ENV_CONFIG.apiUrl}/graphql`;
export const getWebSocketUrl = (): string => ENV_CONFIG.wsUrl || ENV_CONFIG.apiUrl.replace('http', 'ws') + '/ws';
export const getShopifyRedirectUri = (): string => ENV_CONFIG.shopifyRedirectUri;

export const isDevelopment = () => ENV_CONFIG.environment === 'development';
export const isStaging = () => ENV_CONFIG.environment === 'staging';
export const isProduction = () => ENV_CONFIG.environment === 'production';

/**
 * Debug logging utility
 */
export const debugLog = (...args: any[]) => {
  if (ENV_CONFIG.features.enableDebug) {
    console.log('[OrderNimbus Debug]', ...args);
  }
};

/**
 * Get complete environment info for debugging
 */
export const getEnvironmentInfo = () => {
  return {
    environment: ENV_CONFIG.environment,
    hostname: window.location.hostname,
    protocol: window.location.protocol,
    appUrl: ENV_CONFIG.appUrl,
    apiUrl: ENV_CONFIG.apiUrl,
    graphqlUrl: ENV_CONFIG.graphqlUrl,
    wsUrl: ENV_CONFIG.wsUrl,
    isSecure: ENV_CONFIG.isSecure,
    webCryptoAvailable: ENV_CONFIG.features.useWebCrypto,
    userAgent: navigator.userAgent,
    buildTime: process.env.REACT_APP_BUILD_TIME || 'unknown'
  };
};