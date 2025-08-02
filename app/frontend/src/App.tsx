import React, { useState, useEffect } from 'react';
import './App.css';
import './animations.css';
import LoginPage from './components/LoginPage';
import SignupPage from './components/SignupPage';
import ForgotPassword from './components/ForgotPassword';
import Dashboard from './components/Dashboard';
import { Amplify } from 'aws-amplify';
import { awsConfig } from './aws-config';
import { getCurrentUser } from 'aws-amplify/auth';
import { Toaster } from 'react-hot-toast';
import { ClipLoader } from 'react-spinners';

type PageType = 'login' | 'signup' | 'forgot' | 'dashboard';

function App() {
  const [currentPage, setCurrentPage] = useState<PageType>('login');
  const [userEmail, setUserEmail] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Amplify.configure(awsConfig);
    checkCurrentUser();
  }, []);

  const checkCurrentUser = async () => {
    try {
      const user = await getCurrentUser();
      if (user && user.signInDetails?.loginId) {
        setUserEmail(user.signInDetails.loginId);
        setCurrentPage('dashboard');
      }
    } catch (error) {
      // No user is signed in, stay on login page
      console.log('No authenticated user');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = (email: string) => {
    setUserEmail(email);
    setCurrentPage('dashboard');
  };

  const handleSignup = (email: string) => {
    setUserEmail(email);
    setCurrentPage('dashboard');
  };

  const handleLogout = () => {
    setUserEmail('');
    setCurrentPage('login');
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'login':
        return (
          <LoginPage 
            onLogin={handleLogin}
            onSignupClick={() => setCurrentPage('signup')}
            onForgotClick={() => setCurrentPage('forgot')}
          />
        );
      case 'signup':
        return (
          <SignupPage 
            onSignup={handleSignup}
            onBackToLogin={() => setCurrentPage('login')}
          />
        );
      case 'forgot':
        return (
          <ForgotPassword 
            onBackToLogin={() => setCurrentPage('login')}
          />
        );
      case 'dashboard':
        return (
          <Dashboard 
            userEmail={userEmail} 
            onLogout={handleLogout}
          />
        );
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="App">
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          flexDirection: 'column',
          gap: '20px'
        }}>
          <ClipLoader size={50} color="#667eea" />
          <p style={{ color: '#667eea', fontSize: '16px' }}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      <Toaster 
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#333',
            color: '#fff',
            borderRadius: '8px',
            padding: '12px 16px',
          },
          success: {
            iconTheme: {
              primary: '#10b981',
              secondary: '#fff',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
          },
        }}
      />
      {renderPage()}
    </div>
  );
}

export default App;
