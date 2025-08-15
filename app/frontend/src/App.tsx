import React, { useEffect, useState } from 'react';
import './App.css';
import './animations.css';
import Dashboard from './components/Dashboard';
import AuthPage from './components/AuthPage';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { configureAmplify } from './config/amplify-config';

// Function to fetch config from API
const fetchConfigFromAPI = async () => {
  // Determine the config endpoint URL
  let configEndpoint: string;
  const hostname = window.location.hostname;
  
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    configEndpoint = 'http://localhost:3001/api/config';
  } else if (hostname === 'app.ordernimbus.com' || hostname.includes('cloudfront.net')) {
    configEndpoint = 'https://p12brily0d.execute-api.us-west-1.amazonaws.com/production/api/config';
  } else if (process.env.REACT_APP_API_URL) {
    configEndpoint = `${process.env.REACT_APP_API_URL}/api/config`;
  } else {
    // Fallback to relative path
    configEndpoint = '/api/config';
  }
  
  console.log('Fetching configuration from:', configEndpoint);
  
  try {
    const response = await fetch(configEndpoint);
    if (response.ok) {
      const config = await response.json();
      console.log('Configuration loaded from API');
      return config;
    }
    console.error('Failed to fetch config, status:', response.status);
  } catch (error) {
    console.error('Error fetching configuration:', error);
  }
  
  return null;
};

// App content that uses auth context
const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    // IMPORTANT: Only show spinner, no text - this prevents text overlapping the spinner
    // DO NOT add any <p> or text elements here - recurring bug fixed
    return (
      <div className="loading-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthPage />;
  }

  return <Dashboard />;
};

function App() {
  const [isConfigured, setIsConfigured] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    const initializeApp = async () => {
      setIsLoadingConfig(true);
      
      // First try to fetch config from API
      const apiConfig = await fetchConfigFromAPI();
      
      if (apiConfig && apiConfig.userPoolId && apiConfig.clientId) {
        console.log('Configuring Amplify with API configuration');
        const configured = configureAmplify({
          userPoolId: apiConfig.userPoolId,
          clientId: apiConfig.clientId,
          region: apiConfig.region || 'us-west-1'
        });
        setIsConfigured(configured);
        if (!configured) {
          setConfigError('Failed to configure authentication');
        }
      } else {
        // Fallback to environment variables if API fails
        const userPoolId = process.env.REACT_APP_USER_POOL_ID;
        const clientId = process.env.REACT_APP_CLIENT_ID;
        const region = process.env.REACT_APP_REGION || 'us-west-1';
        
        if (userPoolId && clientId) {
          console.log('Configuring Amplify with environment variables');
          const configured = configureAmplify({
            userPoolId,
            clientId,
            region
          });
          setIsConfigured(configured);
          if (!configured) {
            setConfigError('Failed to configure authentication');
          }
        } else {
          setConfigError('Unable to load configuration from API or environment');
        }
      }
      
      setIsLoadingConfig(false);
    };

    initializeApp();
  }, []);

  if (isLoadingConfig) {
    return (
      <div className="loading-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  if (!isConfigured || configError) {
    return (
      <div className="loading-container">
        <div className="error-message">
          <h3>Configuration Error</h3>
          <p>{configError || 'Failed to configure application'}</p>
          <p style={{ fontSize: '14px', marginTop: '10px' }}>
            Please refresh the page or contact support if the issue persists.
          </p>
        </div>
      </div>
    );
  }

  return (
    <AuthProvider>
      <div className="App">
        <Toaster 
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#363636',
              color: '#fff',
            },
          }}
        />
        <AppContent />
      </div>
    </AuthProvider>
  );
}

export default App;