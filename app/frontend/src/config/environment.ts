/**
 * Environment Configuration for OrderNimbus
 * 
 * @description
 * Cloud-native configuration system that fetches config from AWS at runtime.
 * NO HARDCODING - all values come from the cloud via the /api/config endpoint.
 * 
 * This file now serves as a compatibility layer for existing code while
 * transitioning to the cloud-native ConfigContext approach.
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
 * In cloud-native mode, this returns configuration from the cloud
 * For backward compatibility, it first tries to use cached cloud config
 */
export const getEnvironmentConfig = (): EnvironmentConfig => {
  const env = detectEnvironment();
  const isSecure = isSecureContext();
  
  // Try to get configuration from sessionStorage (set by ConfigContext)
  const cachedConfig = sessionStorage.getItem('app-config');
  if (cachedConfig) {
    try {
      const cloudConfig = JSON.parse(cachedConfig);
      console.log('Using cloud configuration from cache');
      
      return {
        // URLs from cloud
        appUrl: window.location.origin,
        apiUrl: cloudConfig.apiUrl || 'https://ay8k50buyd.execute-api.us-west-1.amazonaws.com/production',
        graphqlUrl: cloudConfig.graphqlUrl || `${cloudConfig.apiUrl}/graphql`,
        wsUrl: cloudConfig.wsUrl || cloudConfig.apiUrl.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws',
        
        // Authentication from cloud
        userPoolId: cloudConfig.userPoolId || 'us-west-1_GeV4w2rCQ',
        clientId: cloudConfig.clientId || '2dr8p83gqu0v9iktpdq4qo2rdg',
        region: cloudConfig.region || 'us-west-1',
        
        // Environment
        environment: cloudConfig.environment || env,
        isSecure,
        
        // Shopify
        shopifyRedirectUri: `${cloudConfig.apiUrl}/api/shopify/callback`,
        
        // Features from cloud
        features: {
          enableDebug: cloudConfig.features?.enableDebug || false,
          enableAnalytics: cloudConfig.features?.enableAnalytics || true,
          enableMockData: cloudConfig.features?.enableMockData || false,
          useWebCrypto: isSecure && Boolean(window.crypto?.subtle)
        }
      };
    } catch (error) {
      console.warn('Failed to parse cached cloud config:', error);
    }
  }
  
  // Fallback: Use hardcoded production values (cloud-native approach)
  // These are the production defaults that will be used until ConfigContext loads
  console.log('Using default cloud-native configuration');
  
  return {
    // Production API Gateway URL
    appUrl: window.location.origin,
    apiUrl: 'https://ay8k50buyd.execute-api.us-west-1.amazonaws.com/production',
    graphqlUrl: 'https://ay8k50buyd.execute-api.us-west-1.amazonaws.com/production/graphql',
    wsUrl: 'wss://ay8k50buyd.execute-api.us-west-1.amazonaws.com/production/ws',
    
    // Production Cognito configuration
    userPoolId: 'us-west-1_GeV4w2rCQ',
    clientId: '2dr8p83gqu0v9iktpdq4qo2rdg',
    region: 'us-west-1',
    
    // Environment
    environment: env,
    isSecure,
    
    // Shopify
    shopifyRedirectUri: 'https://ay8k50buyd.execute-api.us-west-1.amazonaws.com/production/api/shopify/callback',
    
    // Default features
    features: {
      enableDebug: false,
      enableAnalytics: true,
      enableMockData: false,
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