import React, { useEffect } from 'react';
import './App.css';
import './animations.css';
import Dashboard from './components/Dashboard';
import AuthPage from './components/AuthPage';
import { Toaster } from 'react-hot-toast';
import { ConfigProvider, useConfig } from './contexts/ConfigContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { configureAmplify } from './config/amplify-config';

// Configure Amplify after config is loaded (will be done in AppInitializer)
let amplifyConfigured = false;

// App initializer that configures Amplify with cloud config
const AppInitializer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { config, isLoading: configLoading, error: configError } = useConfig();

  useEffect(() => {
    if (config && !amplifyConfigured) {
      console.log('Configuring Amplify with cloud configuration');
      configureAmplify({
        userPoolId: config.userPoolId,
        clientId: config.clientId,
        region: config.region
      });
      amplifyConfigured = true;
    }
  }, [config]);

  if (configLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Initializing OrderNimbus...</p>
        </div>
      </div>
    );
  }

  if (configError) {
    return (
      <div className="loading-container">
        <div className="error-message">
          <h3>Configuration Error</h3>
          <p>{configError}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

// App content that uses auth context
const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading OrderNimbus...</p>
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
  return (
    <ConfigProvider>
      <AppInitializer>
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
      </AppInitializer>
    </ConfigProvider>
  );
}

export default App;