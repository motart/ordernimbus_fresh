import { useState, useEffect } from 'react';

/**
 * Custom hook to fetch and manage application configuration
 * Fetches configuration from the API on app startup
 * Falls back to environment variables if API fails
 */
export const useAppConfig = () => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        // Get base API URL from environment or use default
        const baseUrl = process.env.REACT_APP_API_URL || 
                       window.location.hostname === 'localhost' 
                         ? 'http://localhost:3001'
                         : `https://${window.location.hostname.replace('app.', 'api.')}/production`;
        
        const response = await fetch(`${baseUrl}/api/config`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`Config fetch failed: ${response.status}`);
        }

        const data = await response.json();
        
        // Validate required fields
        if (!data.userPoolId || !data.clientId) {
          throw new Error('Invalid configuration: missing Cognito credentials');
        }

        // Store in sessionStorage for this session
        sessionStorage.setItem('appConfig', JSON.stringify(data));
        
        setConfig(data);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch configuration:', err);
        
        // Try to use cached config from sessionStorage
        const cachedConfig = sessionStorage.getItem('appConfig');
        if (cachedConfig) {
          console.log('Using cached configuration');
          setConfig(JSON.parse(cachedConfig));
        } else {
          // Fall back to environment variables
          console.log('Falling back to environment variables');
          const fallbackConfig = {
            environment: process.env.REACT_APP_ENVIRONMENT || 'production',
            region: process.env.REACT_APP_REGION || 'us-west-1',
            apiUrl: process.env.REACT_APP_API_URL,
            userPoolId: process.env.REACT_APP_USER_POOL_ID,
            clientId: process.env.REACT_APP_CLIENT_ID,
            features: {
              enableDebug: process.env.REACT_APP_ENABLE_DEBUG === 'true',
              enableAnalytics: process.env.REACT_APP_ENABLE_ANALYTICS === 'true',
              enableMockData: process.env.REACT_APP_ENABLE_MOCK_DATA === 'true',
            },
          };
          
          // Only use fallback if we have the required fields
          if (fallbackConfig.userPoolId && fallbackConfig.clientId) {
            setConfig(fallbackConfig);
          } else {
            setError('Configuration not available. Please check your deployment.');
          }
        }
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, []);

  // Helper function to refresh configuration
  const refreshConfig = async () => {
    setLoading(true);
    sessionStorage.removeItem('appConfig');
    window.location.reload(); // Simplest way to ensure full app refresh with new config
  };

  return {
    config,
    loading,
    error,
    refreshConfig,
  };
};

// Helper function to get config synchronously (from sessionStorage)
export const getStoredConfig = () => {
  const stored = sessionStorage.getItem('appConfig');
  if (stored) {
    return JSON.parse(stored);
  }
  
  // Return env-based config as fallback
  return {
    environment: process.env.REACT_APP_ENVIRONMENT || 'production',
    region: process.env.REACT_APP_REGION || 'us-west-1',
    apiUrl: process.env.REACT_APP_API_URL,
    userPoolId: process.env.REACT_APP_USER_POOL_ID,
    clientId: process.env.REACT_APP_CLIENT_ID,
  };
};