import React, { useState } from 'react';
import './LoginPage.css';
import { signIn } from 'aws-amplify/auth';
import toast from 'react-hot-toast';
import { ClipLoader } from 'react-spinners';

interface LoginPageProps {
  onLogin: (email: string) => void;
  onSignupClick: () => void;
  onForgotClick: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin, onSignupClick, onForgotClick }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // Simple validation
    if (!email || !password) {
      setError('Please enter both email and password');
      setIsLoading(false);
      return;
    }

    try {
      // Use Cognito for authentication
      const { isSignedIn } = await signIn({ 
        username: email.toLowerCase().trim(), 
        password: password 
      });
      
      if (isSignedIn) {
        toast.success(`Welcome back!`, {
          icon: '👋',
        });
        onLogin(email);
      } else {
        setError('Authentication failed. Please try again.');
        toast.error('Authentication failed');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      
      // Handle specific Cognito errors
      if (error.name === 'UserNotFoundException' || error.name === 'NotAuthorizedException') {
        setError('Invalid email or password');
        toast.error('Invalid credentials');
      } else if (error.name === 'UserNotConfirmedException') {
        setError('Please verify your email address before logging in');
        toast.error('Please verify your email first');
      } else if (error.name === 'NetworkError') {
        setError('Network error. Please check your connection and try again.');
        toast.error('Network error - check your connection');
      } else {
        setError(error.message || 'An error occurred during login');
        toast.error('Login failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-header">
          <h1>OrderNimbus</h1>
          <h2>Sales Forecasting Platform</h2>
          <p>AI-Powered Insights for Retail Success</p>
        </div>
        
        <form onSubmit={handleSubmit} className="login-form" name="loginForm" autoComplete="on">
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              type="email"
              id="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              disabled={isLoading}
              aria-label="Email Address"
              aria-required="true"
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              disabled={isLoading}
              aria-label="Password"
              aria-required="true"
            />
          </div>
          
          {error && <div className="error-message">{error}</div>}
          
          <button type="submit" className="login-button" disabled={isLoading}>
            {isLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <ClipLoader size={16} color="#ffffff" />
                <span>Signing in...</span>
              </div>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
        
        <div className="login-footer">
          <a href="#forgot" onClick={(e) => { e.preventDefault(); onForgotClick(); }}>Forgot Password?</a>
          <span className="separator">•</span>
          <a href="#signup" onClick={(e) => { e.preventDefault(); onSignupClick(); }}>Create Account</a>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;