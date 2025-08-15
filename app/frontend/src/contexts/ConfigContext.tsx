/**
 * ConfigContext - Cloud-native configuration management
 * 
 * This context fetches configuration from the cloud at runtime,
 * eliminating the need for build-time environment variables.
 * All configuration is stored in AWS and fetched dynamically.
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import toast from 'react-hot-toast';

interface AppConfig {
  // API URLs
  apiUrl: string;
  wsUrl: string;
  graphqlUrl: string;
  
  // AWS Cognito
  userPoolId: string;
  clientId: string;
  region: string;
  
  // Environment
  environment: 'development' | 'staging' | 'production';
  version: string;
  
  // Features
  features: {
    enableDebug: boolean;
    enableAnalytics: boolean;
    enableMockData: boolean;
    shopifyIntegration: boolean;
    csvUpload: boolean;
    multiTenant: boolean;
  };
  
  // Additional settings
  maxFileUploadSize: number;
  supportedFileTypes: string[];
  sessionTimeout: number;
  buildTime: string;
  deploymentId: string;
}

interface ConfigContextType {
  config: AppConfig | null;
  isLoading: boolean;
  error: string | null;
  refetchConfig: () => Promise<void>;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

// Determine config endpoint URL - this is the ONLY URL we need to know
// Everything else comes from the config endpoint
const getConfigUrl = (): string => {
  // The config endpoint URL can be provided via environment variable
  const configEndpoint = process.env.REACT_APP_CONFIG_ENDPOINT;
  
  if (configEndpoint) {
    // Using config endpoint from environment
    return configEndpoint;
  }
  
  // For local development
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    // Local development mode - using local config endpoint
    return 'http://localhost:3001/api/config';
  }
  
  // In production, dynamically determine the API endpoint
  // If frontend is served from app.ordernimbus.com, API is at the known production endpoint
  if (hostname === 'app.ordernimbus.com' || hostname.includes('cloudfront.net')) {
    // Production API Gateway endpoint
    return 'https://p12brily0d.execute-api.us-west-1.amazonaws.com/production/api/config';
  }
  
  // Fallback: Try to use the API URL from environment if available
  const apiUrl = process.env.REACT_APP_API_URL;
  if (apiUrl) {
    return `${apiUrl}/api/config`;
  }
  
  // Last resort: use a relative path (works if served from same domain)
  console.warn('Using relative config endpoint - this may not work in all deployments');
  return '/api/config';
};

export const ConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const configUrl = getConfigUrl();
      // Fetching configuration from config endpoint
      
      const response = await fetch(configUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch configuration: ${response.status}`);
      }
      
      const data = await response.json();
      // Configuration loaded successfully
      
      setConfig(data);
      
      // Store in sessionStorage for quick access (but always validate)
      sessionStorage.setItem('app-config', JSON.stringify(data));
      sessionStorage.setItem('app-config-timestamp', Date.now().toString());
      
    } catch (err) {
      console.error('Failed to load configuration:', err);
      setError(err instanceof Error ? err.message : 'Failed to load configuration');
      
      // Try to use cached config if available and recent (< 1 hour old)
      const cachedConfig = sessionStorage.getItem('app-config');
      const cachedTimestamp = sessionStorage.getItem('app-config-timestamp');
      
      if (cachedConfig && cachedTimestamp) {
        const age = Date.now() - parseInt(cachedTimestamp, 10);
        if (age < 3600000) { // 1 hour
          console.log('Using cached configuration');
          setConfig(JSON.parse(cachedConfig));
          setError(null); // Clear error if we have cached config
        }
      }
      
      // If still no config and not localhost, show error
      if (!config && window.location.hostname !== 'localhost') {
        toast.error('Unable to load application configuration');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
    
    // Refresh config when the app comes back into focus
    const handleFocus = () => {
      const cachedTimestamp = sessionStorage.getItem('app-config-timestamp');
      if (cachedTimestamp) {
        const age = Date.now() - parseInt(cachedTimestamp, 10);
        if (age > 300000) { // 5 minutes
          fetchConfig();
        }
      }
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const refetchConfig = async () => {
    await fetchConfig();
  };

  return (
    <ConfigContext.Provider value={{ config, isLoading, error, refetchConfig }}>
      {children}
    </ConfigContext.Provider>
  );
};

export const useConfig = (): ConfigContextType => {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
};

// Helper functions to access config values
export const useApiUrl = (): string => {
  const { config } = useConfig();
  return config?.apiUrl || '';
};

export const useCognitoConfig = () => {
  const { config } = useConfig();
  return {
    userPoolId: config?.userPoolId || '',
    clientId: config?.clientId || '',
    region: config?.region || 'us-west-1',
  };
};

export const useFeatureFlags = () => {
  const { config } = useConfig();
  return config?.features || {
    enableDebug: false,
    enableAnalytics: false,
    enableMockData: false,
    shopifyIntegration: true,
    csvUpload: true,
    multiTenant: true,
  };
};