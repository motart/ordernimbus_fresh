/**
 * Environment Configuration for OrderNimbus (Immutable Architecture)
 * 
 * @description
 * STATIC configuration system using immutable infrastructure.
 * NO DYNAMIC FETCHING - all values are hardcoded from immutable CloudFormation stack.
 * 
 * This provides compatibility with existing code while using the new
 * static configuration approach for maximum performance and reliability.
 * 
 * @architecture
 * - Immutable Infrastructure: CloudFront, Cognito, DNS, S3 (deployed once)
 * - Application Infrastructure: Lambda, API Gateway, DynamoDB (fast redeploy)
 * 
 * @environments
 * - development: Local development (localhost)
 * - staging: Staging environment with static config
 * - production: Production environment with static config (app.ordernimbus.com)
 */

// Import static configuration system
import { getStaticConfig, type StaticConfig } from './static-config';

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
  // Test environment should be treated as development
  if (process.env.NODE_ENV === 'test') {
    return 'development';
  }
  
  // Explicit environment variable takes precedence
  const envVar = getEnvVar('REACT_APP_ENVIRONMENT');
  if (envVar === 'development' || envVar === 'local') return 'development';
  if (envVar === 'staging') return 'staging';
  if (envVar === 'production') return 'production';
  
  // Fallback to hostname detection (only if window is available)
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return 'development';
    if (hostname.includes('staging')) return 'staging';
  }
  
  return 'production';
};

/**
 * Check if running in secure context (HTTPS)
 */
export const isSecureContext = (): boolean => {
  // In test environment, return false for simplicity
  if (process.env.NODE_ENV === 'test' || typeof window === 'undefined') {
    return false;
  }
  
  return window.location.protocol === 'https:' || 
         window.location.hostname === 'localhost' ||
         window.location.hostname === '127.0.0.1';
};

/**
 * Convert StaticConfig to EnvironmentConfig for compatibility
 */
const convertStaticToEnvironmentConfig = (staticConfig: StaticConfig): EnvironmentConfig => {
  return {
    appUrl: `https://${staticConfig.immutable.frontendDomain}`,
    apiUrl: staticConfig.application.apiUrl,
    graphqlUrl: staticConfig.application.graphqlUrl,
    wsUrl: staticConfig.application.wsUrl,
    userPoolId: staticConfig.immutable.userPoolId,
    clientId: staticConfig.immutable.clientId,
    region: staticConfig.immutable.region,
    environment: staticConfig.environment,
    isSecure: staticConfig.isSecure,
    shopifyRedirectUri: staticConfig.application.shopifyRedirectUri,
    features: staticConfig.features,
  };
};

/**
 * Get complete environment configuration using static config system
 * FAST: No API calls, no dynamic fetching - instant configuration
 */
export const getEnvironmentConfig = (): EnvironmentConfig => {
  // Check if static config should be used (new immutable architecture)
  const useStaticConfig = process.env.REACT_APP_USE_STATIC_CONFIG === 'true' || 
                          process.env.NODE_ENV === 'production' ||
                          window.location.hostname === 'app.ordernimbus.com';
  
  if (useStaticConfig) {
    console.log('🚀 Using static configuration (immutable architecture)');
    const staticConfig = getStaticConfig();
    return convertStaticToEnvironmentConfig(staticConfig);
  }
  
  // Fallback to legacy dynamic configuration for development
  console.log('⚠️  Using legacy dynamic configuration');
  const env = detectEnvironment();
  const isSecure = isSecureContext();
  
  // Legacy development configuration
  if (env === 'development') {
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
  }
  
  // For non-development environments, force static config
  console.warn('Non-development environment detected, falling back to static config');
  const staticConfig = getStaticConfig();
  return convertStaticToEnvironmentConfig(staticConfig);
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
    
    // In development or test environment, use fallback
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      _config = getDevConfig();
      _configTimestamp = now;
    } else if (!_config) {
      // In production, if we have no config at all, return minimal config
      _config = {
        appUrl: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
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