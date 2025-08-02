import React, { useState } from 'react';
import './ForgotPassword.css';
import { resetPassword, confirmResetPassword } from 'aws-amplify/auth';
import toast from 'react-hot-toast';
import { ClipLoader } from 'react-spinners';

interface ForgotPasswordProps {
  onBackToLogin: () => void;
}

const ForgotPassword: React.FC<ForgotPasswordProps> = ({ onBackToLogin }) => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showResetForm, setShowResetForm] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('Please enter your email address');
      return;
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);

    try {
      // Request password reset from Cognito
      await resetPassword({ username: email.toLowerCase().trim() });
      setShowResetForm(true);
      toast.success('Reset code sent to your email!', {
        icon: '📧',
        duration: 5000,
      });
    } catch (err: any) {
      console.error('Password reset error:', err);
      if (err.name === 'UserNotFoundException') {
        setError('No account found with this email address');
      } else {
        setError(err.message || 'Failed to send reset email. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);

    try {
      await confirmResetPassword({
        username: email.toLowerCase().trim(),
        confirmationCode: verificationCode,
        newPassword: newPassword
      });
      toast.success('Password reset successfully!', {
        icon: '🎉',
      });
      setIsSubmitted(true);
    } catch (err: any) {
      console.error('Password reset confirmation error:', err);
      setError(err.message || 'Failed to reset password. Please check your code and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="forgot-container">
        <div className="forgot-box">
          <div className="success-icon">✓</div>
          <h2>Password Reset Successfully</h2>
          <p>Your password has been reset.</p>
          <p className="email-display">{email}</p>
          <p className="instructions">
            You can now sign in with your new password.
          </p>
          <button 
            className="back-button" 
            onClick={onBackToLogin}
          >
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  if (showResetForm) {
    return (
      <div className="forgot-container">
        <div className="forgot-box">
          <div className="forgot-header">
            <h1>Reset Your Password</h1>
            <p>Enter the verification code sent to {email} and your new password.</p>
          </div>

          <form onSubmit={handleResetPassword} className="forgot-form">
            <div className="form-group">
              <label htmlFor="verificationCode">Verification Code</label>
              <input
                type="text"
                id="verificationCode"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                placeholder="Enter 6-digit code"
                required
                disabled={isLoading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="newPassword">New Password</label>
              <input
                type="password"
                id="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                required
                disabled={isLoading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm New Password</label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                required
                disabled={isLoading}
              />
            </div>

            {error && <div className="error-message">{error}</div>}

            <button type="submit" className="reset-button" disabled={isLoading}>
              {isLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <ClipLoader size={16} color="#ffffff" />
                  <span>Resetting...</span>
                </div>
              ) : (
                'Reset Password'
              )}
            </button>
          </form>

          <div className="forgot-footer">
            <a href="#" onClick={(e) => { e.preventDefault(); setShowResetForm(false); setError(''); }}>
              ← Back to Email Entry
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="forgot-container">
      <div className="forgot-box">
        <div className="forgot-header">
          <h1>Reset Your Password</h1>
          <p>Enter your email address and we'll send you instructions to reset your password.</p>
        </div>

        <form onSubmit={handleSubmit} className="forgot-form" name="forgotPasswordForm" autoComplete="on">
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
              placeholder="Enter your registered email"
              disabled={isLoading}
              autoFocus
              aria-label="Email Address"
              aria-required="true"
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="reset-button" disabled={isLoading}>
            {isLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <ClipLoader size={16} color="#ffffff" />
                <span>Sending...</span>
              </div>
            ) : (
              'Send Reset Instructions'
            )}
          </button>
        </form>

        <div className="forgot-footer">
          <a href="#login" onClick={(e) => { e.preventDefault(); onBackToLogin(); }}>
            ← Back to Sign In
          </a>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;