/**
 * Static Configuration for OrderNimbus
 * 
 * @description
 * Immutable infrastructure endpoints that never change.
 * These values are hardcoded based on the immutable CloudFormation stack.
 * 
 * NO DYNAMIC FETCHING - all values are known at build time.
 * This eliminates the need for /api/config calls and runtime configuration.
 * 
 * @benefits
 * - Zero configuration loading time
 * - No API dependency for basic app functionality
 * - Predictable behavior across all environments
 * - Better caching and performance
 * - Simplified debugging
 */

export interface StaticConfig {
  // Immutable Infrastructure (never changes after initial deployment)
  immutable: {
    // Frontend - CloudFront + Custom Domain
    frontendDomain: string;
    cloudfrontDistributionId: string;
    
    // Authentication - Cognito
    userPoolId: string;
    clientId: string;
    region: string;
    
    // Storage - S3
    s3BucketName: string;
  };
  
  // Application Infrastructure (changes with each deployment)
  application: {
    // API endpoints (may change with deployments)
    apiDomain: string;
    apiUrl: string;
    graphqlUrl: string;
    wsUrl: string;
    
    // Shopify integration
    shopifyRedirectUri: string;
  };
  
  // Environment settings
  environment: 'development' | 'staging' | 'production';
  isSecure: boolean;
  
  // Feature flags
  features: {
    enableDebug: boolean;
    enableAnalytics: boolean;
    enableMockData: boolean;
    useWebCrypto: boolean;
  };
}

/**
 * Environment-specific static configurations
 * These are hardcoded based on the immutable infrastructure deployment
 */

// Production Static Configuration
const PRODUCTION_CONFIG: StaticConfig = {
  immutable: {
    frontendDomain: 'app.ordernimbus.com',
    cloudfrontDistributionId: 'EZLBQFH8BW8XD', // This will be set after immutable stack deployment
    userPoolId: 'us-west-1_FIXED_POOL_ID',      // This will be set after immutable stack deployment
    clientId: 'fixed_client_id_from_cognito',   // This will be set after immutable stack deployment
    region: 'us-west-1',
    s3BucketName: 'ordernimbus-production-frontend-335021149718',
  },
  application: {
    apiDomain: 'api.ordernimbus.com',
    apiUrl: 'https://api.ordernimbus.com',
    graphqlUrl: 'https://api.ordernimbus.com/graphql',
    wsUrl: 'wss://api.ordernimbus.com/ws',
    shopifyRedirectUri: 'https://api.ordernimbus.com/api/shopify/callback',
  },
  environment: 'production',
  isSecure: true,
  features: {
    enableDebug: false,
    enableAnalytics: true,
    enableMockData: false,
    useWebCrypto: true,
  },
};

// Staging Static Configuration
const STAGING_CONFIG: StaticConfig = {
  immutable: {
    frontendDomain: 'd1a2b3c4d5e6f7.cloudfront.net', // CloudFront domain for staging
    cloudfrontDistributionId: 'STAGING_DIST_ID',      // This will be set after immutable stack deployment
    userPoolId: 'us-west-1_STAGING_POOL_ID',          // This will be set after immutable stack deployment
    clientId: 'staging_client_id_from_cognito',       // This will be set after immutable stack deployment
    region: 'us-west-1',
    s3BucketName: 'ordernimbus-staging-frontend-335021149718',
  },
  application: {
    apiDomain: 'api-staging.ordernimbus.com',
    apiUrl: 'https://api-staging.ordernimbus.com',
    graphqlUrl: 'https://api-staging.ordernimbus.com/graphql',
    wsUrl: 'wss://api-staging.ordernimbus.com/ws',
    shopifyRedirectUri: 'https://api-staging.ordernimbus.com/api/shopify/callback',
  },
  environment: 'staging',
  isSecure: true,
  features: {
    enableDebug: true,
    enableAnalytics: false,
    enableMockData: false,
    useWebCrypto: true,
  },
};

// Development Static Configuration
const DEVELOPMENT_CONFIG: StaticConfig = {
  immutable: {
    frontendDomain: 'localhost:3000',
    cloudfrontDistributionId: 'dev-local',
    userPoolId: 'dev-pool-id',
    clientId: 'dev-client-id',
    region: 'us-west-1',
    s3BucketName: 'dev-local-bucket',
  },
  application: {
    apiDomain: 'localhost:3001',
    apiUrl: 'http://localhost:3001',
    graphqlUrl: 'http://localhost:3001/graphql',
    wsUrl: 'ws://localhost:3001/ws',
    shopifyRedirectUri: 'http://localhost:3001/api/shopify/callback',
  },
  environment: 'development',
  isSecure: false,
  features: {
    enableDebug: true,
    enableAnalytics: false,
    enableMockData: true,
    useWebCrypto: false,
  },
};

/**
 * Environment detection for static configuration
 * Uses build-time environment variables and runtime hostname detection
 */
const detectStaticEnvironment = (): 'development' | 'staging' | 'production' => {
  // Build-time environment variable takes precedence
  const buildEnv = process.env.REACT_APP_ENVIRONMENT;
  if (buildEnv === 'production' || buildEnv === 'staging' || buildEnv === 'development') {
    return buildEnv;
  }
  
  // Runtime hostname detection (fallback)
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    
    if (hostname === 'app.ordernimbus.com') {
      return 'production';
    }
    
    if (hostname.includes('staging') || hostname.includes('cloudfront.net')) {
      return 'staging';
    }
    
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'development';
    }
  }
  
  // Default to production for safety
  return 'production';
};

/**
 * Get static configuration based on environment
 * No async operations, no API calls - instant configuration
 */
export const getStaticConfig = (): StaticConfig => {
  const env = detectStaticEnvironment();
  
  switch (env) {
    case 'production':
      return PRODUCTION_CONFIG;
    case 'staging':
      return STAGING_CONFIG;
    case 'development':
      return DEVELOPMENT_CONFIG;
    default:
      console.warn(`Unknown environment: ${env}, defaulting to production`);
      return PRODUCTION_CONFIG;
  }
};

/**
 * Configuration update utilities
 * These functions help update the static configuration after immutable stack deployment
 */

// Helper to generate updated production config after immutable stack deployment
export const generateProductionConfig = (immutableStackOutputs: {
  userPoolId: string;
  clientId: string;
  cloudfrontDistributionId: string;
  s3BucketName: string;
  frontendDomain?: string;
}): StaticConfig => {
  return {
    ...PRODUCTION_CONFIG,
    immutable: {
      ...PRODUCTION_CONFIG.immutable,
      userPoolId: immutableStackOutputs.userPoolId,
      clientId: immutableStackOutputs.clientId,
      cloudfrontDistributionId: immutableStackOutputs.cloudfrontDistributionId,
      s3BucketName: immutableStackOutputs.s3BucketName,
      frontendDomain: immutableStackOutputs.frontendDomain || PRODUCTION_CONFIG.immutable.frontendDomain,
    },
  };
};

// Helper to generate updated staging config
export const generateStagingConfig = (immutableStackOutputs: {
  userPoolId: string;
  clientId: string;
  cloudfrontDistributionId: string;
  s3BucketName: string;
  frontendDomain: string;
}): StaticConfig => {
  return {
    ...STAGING_CONFIG,
    immutable: {
      ...STAGING_CONFIG.immutable,
      userPoolId: immutableStackOutputs.userPoolId,
      clientId: immutableStackOutputs.clientId,
      cloudfrontDistributionId: immutableStackOutputs.cloudfrontDistributionId,
      s3BucketName: immutableStackOutputs.s3BucketName,
      frontendDomain: immutableStackOutputs.frontendDomain,
    },
  };
};

/**
 * Convenience functions for easy access to static config values
 */
const staticConfig = getStaticConfig();

export const getStaticApiUrl = (): string => staticConfig.application.apiUrl;
export const getStaticGraphQLUrl = (): string => staticConfig.application.graphqlUrl;
export const getStaticWebSocketUrl = (): string => staticConfig.application.wsUrl;
export const getStaticUserPoolId = (): string => staticConfig.immutable.userPoolId;
export const getStaticClientId = (): string => staticConfig.immutable.clientId;
export const getStaticRegion = (): string => staticConfig.immutable.region;
export const getStaticFrontendDomain = (): string => staticConfig.immutable.frontendDomain;
export const getStaticShopifyRedirectUri = (): string => staticConfig.application.shopifyRedirectUri;

export const isStaticProduction = (): boolean => staticConfig.environment === 'production';
export const isStaticStaging = (): boolean => staticConfig.environment === 'staging';
export const isStaticDevelopment = (): boolean => staticConfig.environment === 'development';

/**
 * Debug utility to log static configuration
 */
export const logStaticConfig = (): void => {
  if (staticConfig.features.enableDebug) {
    console.group('🔧 OrderNimbus Static Configuration');
    console.log('Environment:', staticConfig.environment);
    console.log('Frontend Domain:', staticConfig.immutable.frontendDomain);
    console.log('API URL:', staticConfig.application.apiUrl);
    console.log('User Pool ID:', staticConfig.immutable.userPoolId);
    console.log('Client ID:', staticConfig.immutable.clientId);
    console.log('Region:', staticConfig.immutable.region);
    console.log('Features:', staticConfig.features);
    console.groupEnd();
  }
};

/**
 * Validate static configuration completeness
 */
export const validateStaticConfig = (): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (!staticConfig.immutable.userPoolId || staticConfig.immutable.userPoolId.includes('FIXED')) {
    errors.push('User Pool ID not properly configured in static config');
  }
  
  if (!staticConfig.immutable.clientId || staticConfig.immutable.clientId.includes('fixed')) {
    errors.push('Client ID not properly configured in static config');
  }
  
  if (!staticConfig.application.apiUrl) {
    errors.push('API URL not configured in static config');
  }
  
  if (staticConfig.environment === 'production' && !staticConfig.isSecure) {
    errors.push('Production environment must use HTTPS');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Export the main configuration object for global access
 */
export const STATIC_CONFIG = staticConfig;

/**
 * Configuration migration helper
 * Helps transition from dynamic config to static config
 */
export const getConfigMigrationStatus = () => {
  return {
    staticConfigEnabled: true,
    dynamicConfigEnabled: false, // Set to false to disable old dynamic config
    migrationComplete: true,
    configSource: 'static',
    lastUpdated: '2024-01-15T10:00:00Z',
  };
};

// Auto-log configuration on module load in debug mode
if (staticConfig.features.enableDebug) {
  logStaticConfig();
}