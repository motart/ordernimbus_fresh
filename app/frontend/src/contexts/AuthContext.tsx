import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { signIn, signUp, signOut, getCurrentUser, fetchAuthSession, confirmSignUp } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import toast from 'react-hot-toast';

// User info interface matching Cognito attributes
export interface UserInfo {
  userId: string;
  email: string;
  companyId?: string;
  companyName?: string;
  role?: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: UserInfo | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, companyName: string, firstName?: string, lastName?: string) => Promise<{ success: boolean; error?: string; needsVerification?: boolean }>;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  getCompanyId: () => string | null;
  confirmRegistration: (email: string, code: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<UserInfo | null>(null);

  // Check authentication status on mount and auth events
  useEffect(() => {
    checkAuthStatus();

    // Listen for auth events
    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      switch (payload.event) {
        case 'signedIn':
          checkAuthStatus();
          break;
        case 'signedOut':
          setIsAuthenticated(false);
          setUser(null);
          break;
        case 'tokenRefresh':
          checkAuthStatus();
          break;
        case 'tokenRefresh_failure':
          console.error('Token refresh failed');
          break;
      }
    });

    return unsubscribe;
  }, []);

  const checkAuthStatus = async () => {
    try {
      setIsLoading(true);
      const currentUser = await getCurrentUser();
      
      if (currentUser) {
        // Get user attributes from Cognito
        const session = await fetchAuthSession();
        const idToken = session.tokens?.idToken;
        
        if (idToken) {
          // Parse user info from ID token
          const payload = idToken.payload;
          
          const userInfo: UserInfo = {
            userId: currentUser.userId,
            email: payload.email as string || '',
            companyId: payload['custom:company_id'] as string,
            companyName: payload['custom:company_name'] as string,
            role: payload['custom:role'] as string || 'user'
          };
          
          setUser(userInfo);
          setIsAuthenticated(true);
        }
      }
    } catch (error) {
      console.log('Not authenticated');
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await signIn({ 
        username: email.toLowerCase().trim(), 
        password 
      });
      
      if (result.isSignedIn) {
        await checkAuthStatus();
        return { success: true };
      } else if (result.nextStep) {
        // Handle additional steps if needed (MFA, new password, etc.)
        return { 
          success: false, 
          error: `Additional step required: ${result.nextStep.signInStep}` 
        };
      }
      
      return { success: false, error: 'Login failed' };
    } catch (error: any) {
      console.error('Login error:', error);
      
      if (error.name === 'NotAuthorizedException') {
        return { success: false, error: 'Invalid email or password' };
      } else if (error.name === 'UserNotFoundException') {
        return { success: false, error: 'User not found' };
      } else if (error.name === 'UserNotConfirmedException') {
        return { success: false, error: 'Please verify your email first' };
      }
      
      return { success: false, error: error.message || 'Login failed' };
    }
  };

  const register = async (
    email: string, 
    password: string, 
    companyName: string, 
    firstName?: string, 
    lastName?: string
  ): Promise<{ success: boolean; error?: string; needsVerification?: boolean }> => {
    try {
      // Generate unique company ID
      const companyId = `company-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      
      const result = await signUp({
        username: email.toLowerCase().trim(),
        password,
        options: {
          userAttributes: {
            email: email.toLowerCase().trim(),
            'custom:company_id': companyId,
            'custom:company_name': companyName,
            'custom:role': 'admin',
            ...(firstName && { given_name: firstName }),
            ...(lastName && { family_name: lastName })
          }
        }
      });
      
      if (result.isSignUpComplete) {
        // Auto sign in after registration
        const loginResult = await login(email, password);
        return { success: loginResult.success, error: loginResult.error };
      } else if (result.nextStep?.signUpStep === 'CONFIRM_SIGN_UP') {
        // Needs email verification
        return { 
          success: true, 
          needsVerification: true 
        };
      }
      
      return { success: false, error: 'Registration incomplete' };
    } catch (error: any) {
      console.error('Registration error:', error);
      
      if (error.name === 'UsernameExistsException') {
        return { success: false, error: 'User already exists' };
      }
      
      return { success: false, error: error.message || 'Registration failed' };
    }
  };

  const confirmRegistration = async (email: string, code: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await confirmSignUp({
        username: email.toLowerCase().trim(),
        confirmationCode: code
      });
      
      if (result.isSignUpComplete) {
        return { success: true };
      }
      
      return { success: false, error: 'Verification incomplete' };
    } catch (error: any) {
      console.error('Confirmation error:', error);
      return { success: false, error: error.message || 'Verification failed' };
    }
  };

  const logout = async () => {
    try {
      await signOut();
      setIsAuthenticated(false);
      setUser(null);
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Logout failed');
    }
  };

  const getAccessToken = async (): Promise<string | null> => {
    try {
      const session = await fetchAuthSession();
      return session.tokens?.accessToken?.toString() || null;
    } catch (error) {
      console.error('Failed to get access token:', error);
      return null;
    }
  };

  const getCompanyId = (): string | null => {
    return user?.companyId || null;
  };

  const value: AuthContextType = {
    isAuthenticated,
    isLoading,
    user,
    login,
    register,
    logout,
    getAccessToken,
    getCompanyId,
    confirmRegistration
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;