import React from 'react';
import './App.css';
import './animations.css';
import './styles/GlobalStyles.css';
import './components/ui/UIComponents.css';
import Dashboard from './components/Dashboard';
import AuthPage from './components/AuthPage';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { configureAmplify } from './config/amplify-config';
import { getENV_CONFIG } from './config/environment';

// Configure Amplify on app start
const config = getENV_CONFIG();
if (config.userPoolId && config.clientId) {
  console.log('Configuring Amplify with environment configuration');
  configureAmplify({
    userPoolId: config.userPoolId,
    clientId: config.clientId,
    region: config.region
  });
} else {
  console.error('Missing required configuration for Amplify');
}

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
  // Check if we have valid configuration
  if (!config.apiUrl || !config.userPoolId || !config.clientId) {
    return (
      <div className="loading-container">
        <div className="error-message">
          <h3>Configuration Error</h3>
          <p>Missing required configuration. Please check environment variables.</p>
          <p style={{ fontSize: '14px', marginTop: '10px' }}>
            Required: REACT_APP_API_URL, REACT_APP_USER_POOL_ID, REACT_APP_CLIENT_ID
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