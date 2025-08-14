import React, { useEffect, useState } from 'react';
import './App.css';
import './animations.css';
import Dashboard from './components/Dashboard';
import AuthPage from './components/AuthPage';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { configureAmplify } from './config/amplify-config';

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
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log('Initializing OrderNimbus...');
        await configureAmplify();
        console.log('Configuration loaded successfully');
        setConfigLoading(false);
      } catch (error) {
        console.error('Failed to initialize app:', error);
        setConfigError('Failed to load configuration. Please refresh the page.');
        setConfigLoading(false);
      }
    };

    initializeApp();
  }, []);

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
          <h2>Configuration Error</h2>
          <p>{configError}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
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