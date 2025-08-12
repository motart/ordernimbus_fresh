import React, { useEffect } from 'react';
import './App.css';
import './animations.css';
import Dashboard from './components/Dashboard';
import AuthPage from './components/AuthPage';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { configureAmplify } from './config/amplify-config';

// Configure Amplify on app initialization
const amplifyConfigured = configureAmplify();

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