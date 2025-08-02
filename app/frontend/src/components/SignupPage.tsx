import React, { useState } from 'react';
import './SignupPage.css';
import { signUp, confirmSignUp, signIn } from 'aws-amplify/auth';
import toast from 'react-hot-toast';
import { ClipLoader } from 'react-spinners';

interface SignupPageProps {
  onSignup: (email: string) => void;
  onBackToLogin: () => void;
}

const SignupPage: React.FC<SignupPageProps> = ({ onSignup, onBackToLogin }) => {
  const [formData, setFormData] = useState({
    companyName: '',
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    agreeToTerms: false
  });
  const [errors, setErrors] = useState<any>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');

  const validateForm = () => {
    const newErrors: any = {};

    if (!formData.companyName) newErrors.companyName = 'Company name is required';
    if (!formData.fullName) newErrors.fullName = 'Full name is required';
    if (!formData.email) newErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Email is invalid';
    
    if (!formData.password) newErrors.password = 'Password is required';
    else if (formData.password.length < 8) newErrors.password = 'Password must be at least 8 characters';
    
    if (!formData.confirmPassword) newErrors.confirmPassword = 'Please confirm your password';
    else if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = 'Passwords do not match';
    
    if (!formData.agreeToTerms) newErrors.agreeToTerms = 'You must agree to the terms';

    return newErrors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const newErrors = validateForm();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      // Sign up with Cognito
      const { isSignUpComplete, nextStep } = await signUp({
        username: formData.email.toLowerCase().trim(),
        password: formData.password,
        options: {
          userAttributes: {
            email: formData.email.toLowerCase().trim(),
            name: formData.fullName,
            'custom:company': formData.companyName
          }
        }
      });

      if (nextStep.signUpStep === 'CONFIRM_SIGN_UP') {
        // Need email verification
        setShowVerification(true);
        toast.success('Verification code sent to your email!', {
          icon: '📧',
          duration: 5000,
        });
      } else if (isSignUpComplete) {
        // Auto-confirmed, sign in
        await signIn({ 
          username: formData.email.toLowerCase().trim(), 
          password: formData.password 
        });
        onSignup(formData.email);
      }
    } catch (error: any) {
      console.error('Signup error:', error);
      
      if (error.name === 'UsernameExistsException') {
        setErrors({ email: 'An account with this email already exists' });
      } else if (error.name === 'InvalidPasswordException') {
        setErrors({ password: error.message });
      } else {
        setErrors({ general: error.message || 'An error occurred during signup' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrors({});

    try {
      await confirmSignUp({
        username: formData.email.toLowerCase().trim(),
        confirmationCode: verificationCode
      });

      // Sign in after verification
      await signIn({ 
        username: formData.email.toLowerCase().trim(), 
        password: formData.password 
      });
      
      toast.success('Email verified! Welcome to OrderNimbus!', {
        icon: '🎉',
      });
      onSignup(formData.email);
    } catch (error: any) {
      console.error('Verification error:', error);
      setErrors({ verification: error.message || 'Invalid verification code' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors((prev: any) => ({ ...prev, [name]: '' }));
    }
  };

  return (
    <div className="signup-container">
      <div className="signup-box">
        <div className="signup-header">
          <h1>{showVerification ? 'Verify Your Email' : 'Create Your Account'}</h1>
          <p>{showVerification ? 'Enter the verification code sent to your email' : 'Start your 14-day free trial of OrderNimbus'}</p>
        </div>

        {showVerification ? (
          <form onSubmit={handleVerification} className="signup-form">
            <div className="form-row">
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
                {errors.verification && <span className="error-text">{errors.verification}</span>}
              </div>
            </div>
            <button type="submit" className="signup-button" disabled={isLoading}>
              {isLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <ClipLoader size={16} color="#ffffff" />
                  <span>Verifying...</span>
                </div>
              ) : (
                'Verify Email'
              )}
            </button>
          </form>
        ) : (
        <>
        {errors.general && <div className="error-message" style={{marginBottom: '20px', padding: '10px', backgroundColor: '#fee', borderRadius: '6px', color: '#c33'}}>{errors.general}</div>}
        <form onSubmit={handleSubmit} className="signup-form" name="signupForm" autoComplete="on">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="companyName">Company Name</label>
              <input
                type="text"
                id="companyName"
                name="companyName"
                autoComplete="organization"
                required
                value={formData.companyName}
                onChange={handleChange}
                placeholder="Your company name"
                disabled={isLoading}
                aria-label="Company Name"
                aria-required="true"
              />
              {errors.companyName && <span className="error-text">{errors.companyName}</span>}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="fullName">Full Name</label>
              <input
                type="text"
                id="fullName"
                name="fullName"
                autoComplete="name"
                required
                value={formData.fullName}
                onChange={handleChange}
                placeholder="John Doe"
                disabled={isLoading}
                aria-label="Full Name"
                aria-required="true"
              />
              {errors.fullName && <span className="error-text">{errors.fullName}</span>}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="email">Work Email</label>
              <input
                type="email"
                id="email"
                name="email"
                autoComplete="email"
                required
                value={formData.email}
                onChange={handleChange}
                placeholder="john@company.com"
                disabled={isLoading}
                aria-label="Work Email"
                aria-required="true"
              />
              {errors.email && <span className="error-text">{errors.email}</span>}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                name="password"
                autoComplete="new-password"
                required
                value={formData.password}
                onChange={handleChange}
                placeholder="Minimum 8 characters"
                disabled={isLoading}
                aria-label="Password"
                aria-required="true"
              />
              {errors.password && <span className="error-text">{errors.password}</span>}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                autoComplete="new-password"
                required
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Re-enter your password"
                disabled={isLoading}
                aria-label="Confirm Password"
                aria-required="true"
              />
              {errors.confirmPassword && <span className="error-text">{errors.confirmPassword}</span>}
            </div>
          </div>

          <div className="checkbox-group">
            <input
              type="checkbox"
              id="agreeToTerms"
              name="agreeToTerms"
              checked={formData.agreeToTerms}
              onChange={handleChange}
              disabled={isLoading}
            />
            <label htmlFor="agreeToTerms">
              I agree to the <a href="#terms" onClick={(e) => e.preventDefault()}>Terms of Service</a> and <a href="#privacy" onClick={(e) => e.preventDefault()}>Privacy Policy</a>
            </label>
          </div>
          {errors.agreeToTerms && <span className="error-text">{errors.agreeToTerms}</span>}

          <button type="submit" className="signup-button" disabled={isLoading}>
            {isLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <ClipLoader size={16} color="#ffffff" />
                <span>Creating Account...</span>
              </div>
            ) : (
              'Create Account'
            )}
          </button>
        </form>
        </>
        )}

        {!showVerification && (
        <div className="signup-benefits">
          <h3>What's included:</h3>
          <ul>
            <li>✓ AI-powered sales forecasting</li>
            <li>✓ Real-time analytics dashboard</li>
            <li>✓ Multi-store management</li>
            <li>✓ CSV data import/export</li>
            <li>✓ 14-day free trial, no credit card required</li>
          </ul>
        </div>
        )}

        <div className="signup-footer">
          <p>Already have an account? <a href="#login" onClick={(e) => { e.preventDefault(); onBackToLogin(); }}>Sign In</a></p>
        </div>
      </div>
    </div>
  );
};

export default SignupPage;