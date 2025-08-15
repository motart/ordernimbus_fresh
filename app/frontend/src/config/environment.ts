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
 * Simple approach: Just use environment variables directly
 */
export const getEnvironmentConfig = (): EnvironmentConfig => {
  const env = detectEnvironment();
  const isSecure = isSecureContext();
  
  // First try to use runtime config from env.js (loaded by CloudFormation)
  const runtimeConfig = (window as any).RUNTIME_CONFIG;
  
  // Use runtime config if available, then environment variables, then defaults
  const apiUrl = runtimeConfig?.REACT_APP_API_URL || process.env.REACT_APP_API_URL || (env === 'development' ? 'http://localhost:3001' : '');
  const userPoolId = runtimeConfig?.REACT_APP_USER_POOL_ID || process.env.REACT_APP_USER_POOL_ID || '';
  const clientId = runtimeConfig?.REACT_APP_CLIENT_ID || process.env.REACT_APP_CLIENT_ID || '';
  const region = runtimeConfig?.REACT_APP_REGION || process.env.REACT_APP_REGION || 'us-west-1';
  
  if (apiUrl && userPoolId && clientId) {
    if (runtimeConfig) {
      console.log('Using runtime configuration from CloudFormation (env.js)');
    } else {
      console.log('Using environment variables configuration');
    }
    
    return {
      appUrl: window.location.origin,
      apiUrl,
      graphqlUrl: process.env.REACT_APP_GRAPHQL_URL || `${apiUrl}/graphql`,
      wsUrl: process.env.REACT_APP_WS_URL || apiUrl.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws',
      
      userPoolId,
      clientId,
      region: region || 'us-west-1',
      
      environment: env,
      isSecure,
      
      shopifyRedirectUri: `${apiUrl}/api/shopify/callback`,
      
      features: {
        enableDebug: process.env.REACT_APP_ENABLE_DEBUG === 'true',
        enableAnalytics: process.env.REACT_APP_ENABLE_ANALYTICS === 'true',
        enableMockData: process.env.REACT_APP_ENABLE_MOCK_DATA === 'true',
        useWebCrypto: isSecure && Boolean(window.crypto?.subtle)
      }
    };
  }
  
  // For development without env vars, use defaults
  if (env === 'development' && !apiUrl) {
    console.log('Using development defaults');
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
        enableMockData: false,
        useWebCrypto: false
      }
    };
  }
  
  // Production must have env vars set
  console.error('Configuration error: Environment variables not set!');
  console.error('Required: REACT_APP_API_URL, REACT_APP_USER_POOL_ID, REACT_APP_CLIENT_ID');
  
  // Return empty config that will show error
  return {
    appUrl: window.location.origin,
    apiUrl: '',
    graphqlUrl: '',
    wsUrl: '',
    userPoolId: '',
    clientId: '',
    region: 'us-west-1',
    environment: env,
    isSecure,
    shopifyRedirectUri: '',
    features: {
      enableDebug: false,
      enableAnalytics: false,
      enableMockData: false,
      useWebCrypto: false
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
 * Dynamic configuration getter
 * Always fetches the latest configuration from sessionStorage or environment
 */
let _config: EnvironmentConfig | null = null;
let _configTimestamp: number = 0;
const CONFIG_CACHE_TTL = 1000; // 1 second cache to avoid excessive parsing

export const getENV_CONFIG = (): EnvironmentConfig => {
  const now = Date.now();
  
  // Return cached config if still fresh
  if (_config && (now - _configTimestamp) < CONFIG_CACHE_TTL) {
    return _config;
  }
  
  try {
    _config = getEnvironmentConfig();
    _configTimestamp = now;
    
    // Configuration updated (logged only in debug mode via debugLog)
  } catch (error) {
    console.error('Failed to get environment configuration:', error);
    
    // In development, use fallback
    if (process.env.NODE_ENV === 'development') {
      _config = getDevConfig();
      _configTimestamp = now;
    } else if (!_config) {
      // In production, if we have no config at all, return minimal config
      _config = {
        appUrl: window.location.origin,
        apiUrl: '', // Empty will cause obvious errors
        graphqlUrl: '',
        wsUrl: '',
        userPoolId: '',
        clientId: '',
        region: 'us-west-1',
        environment: detectEnvironment(),
        isSecure: isSecureContext(),
        shopifyRedirectUri: '',
        features: {
          enableDebug: false,
          enableAnalytics: false,
          enableMockData: false,
          useWebCrypto: false
        }
      };
      _configTimestamp = now;
    }
  }
  
  return _config!;
};

// For backward compatibility, export ENV_CONFIG as a getter
export const ENV_CONFIG = getENV_CONFIG();

/**
 * Utility functions for easy access - now dynamic
 */
export const getApiUrl = (): string => {
  const config = getENV_CONFIG();
  return config.apiUrl;
};

export const getAppUrl = (): string => {
  const config = getENV_CONFIG();
  return config.appUrl;
};

export const getGraphQLUrl = (): string => {
  const config = getENV_CONFIG();
  return config.graphqlUrl || `${config.apiUrl}/graphql`;
};

export const getWebSocketUrl = (): string => {
  const config = getENV_CONFIG();
  return config.wsUrl || config.apiUrl.replace('http', 'ws') + '/ws';
};

export const getShopifyRedirectUri = (): string => {
  const config = getENV_CONFIG();
  return config.shopifyRedirectUri;
};

export const isDevelopment = () => {
  const config = getENV_CONFIG();
  return config.environment === 'development';
};

export const isStaging = () => {
  const config = getENV_CONFIG();
  return config.environment === 'staging';
};

export const isProduction = () => {
  const config = getENV_CONFIG();
  return config.environment === 'production';
};

/**
 * Debug logging utility
 */
export const debugLog = (...args: any[]) => {
  const config = getENV_CONFIG();
  if (config.features.enableDebug) {
    console.log('[OrderNimbus Debug]', ...args);
  }
};

/**
 * Get complete environment info for debugging
 */
export const getEnvironmentInfo = () => {
  const config = getENV_CONFIG();
  return {
    environment: config.environment,
    hostname: window.location.hostname,
    protocol: window.location.protocol,
    appUrl: config.appUrl,
    apiUrl: config.apiUrl,
    graphqlUrl: config.graphqlUrl,
    wsUrl: config.wsUrl,
    isSecure: config.isSecure,
    webCryptoAvailable: config.features.useWebCrypto,
    userAgent: navigator.userAgent,
    buildTime: process.env.REACT_APP_BUILD_TIME || 'unknown'
  };
};