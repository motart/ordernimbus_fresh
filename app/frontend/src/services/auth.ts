// Authentication service for OrderNimbus
// DEPRECATED: This service is being replaced by AWS Amplify Auth
// Use AuthContext instead which now uses Amplify directly
import { getApiUrl } from '../config/environment';

interface LoginResponse {
  success: boolean;
  tokens?: {
    AccessToken: string;
    ExpiresIn: number;
    TokenType: string;
    RefreshToken: string;
    IdToken: string;
  };
  error?: string;
}

interface RegisterResponse {
  success: boolean;
  message?: string;
  userId?: string;
  companyId?: string;
  companyName?: string;
  error?: string;
}

// UserInfo type has moved to AuthContext
// Import from '../contexts/AuthContext' instead

// Keep local interface for this file only
interface UserInfoLocal {
  userId: string;
  email: string;
  companyId: string;
  companyName: string;
  role: string;
}

class AuthService {
  private apiUrl: string;
  private accessToken: string | null = null;
  private userInfo: UserInfoLocal | null = null;

  constructor() {
    // Use dynamic API URL based on environment
    this.apiUrl = getApiUrl();
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const token = localStorage.getItem('ordernimbus_access_token');
      const user = localStorage.getItem('ordernimbus_user_info');
      
      if (token && user) {
        this.accessToken = token;
        this.userInfo = JSON.parse(user);
      }
    } catch (error) {
      console.warn('Failed to load auth from storage:', error);
      this.clearAuth();
    }
  }

  private saveToStorage() {
    try {
      if (this.accessToken) {
        localStorage.setItem('ordernimbus_access_token', this.accessToken);
      }
      if (this.userInfo) {
        localStorage.setItem('ordernimbus_user_info', JSON.stringify(this.userInfo));
      }
    } catch (error) {
      console.error('Failed to save auth to storage:', error);
    }
  }

  private clearAuth() {
    this.accessToken = null;
    this.userInfo = null;
    localStorage.removeItem('ordernimbus_access_token');
    localStorage.removeItem('ordernimbus_user_info');
  }

  async register(email: string, password: string, companyName: string, firstName?: string, lastName?: string): Promise<RegisterResponse> {
    try {
      const response = await fetch(`${this.apiUrl}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          password,
          companyName,
          firstName,
          lastName
        })
      });

      const data: RegisterResponse = await response.json();
      return data;
    } catch (error) {
      console.error('Registration error:', error);
      return {
        success: false,
        error: 'Registration failed. Please try again.'
      };
    }
  }

  async login(email: string, password: string): Promise<LoginResponse> {
    try {
      const response = await fetch(`${this.apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      const data: LoginResponse = await response.json();
      
      if (data.success && data.tokens) {
        this.accessToken = data.tokens.AccessToken;
        
        // Extract user info from ID token (JWT payload)
        try {
          const idTokenPayload = JSON.parse(atob(data.tokens.IdToken.split('.')[1]));
          this.userInfo = {
            userId: idTokenPayload.sub,
            email: idTokenPayload.email,
            companyId: idTokenPayload['custom:company_id'],
            companyName: idTokenPayload['custom:company_name'],
            role: idTokenPayload['custom:role'] || 'admin'
          };
          this.saveToStorage();
        } catch (parseError) {
          console.error('Failed to parse ID token:', parseError);
        }
      }

      return data;
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        error: 'Login failed. Please try again.'
      };
    }
  }

  logout() {
    this.clearAuth();
    // Optionally redirect to login page
    window.location.href = '/login';
  }

  isAuthenticated(): boolean {
    return !!this.accessToken && !!this.userInfo;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getUserInfo(): UserInfoLocal | null {
    return this.userInfo;
  }

  getCompanyId(): string | null {
    return this.userInfo?.companyId || null;
  }

  // Create authenticated API call helper
  async authenticatedRequest(endpoint: string, options: RequestInit = {}) {
    // Check if we have a valid access token
    if (!this.accessToken || !this.userInfo) {
      // No valid authentication - redirect to login
      this.clearAuth();
      throw new Error('Authentication required. Please log in.');
    }

    // Get the actual userId from localStorage (set by AuthContext from Amplify)
    const currentUserId = localStorage.getItem('currentUserId');
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.accessToken}`, // JWT token for API Gateway Authorizer
      'userId': currentUserId || this.userInfo?.userId, // Use currentUserId from localStorage first
      ...options.headers
    };

    const response = await fetch(`${this.apiUrl}${endpoint}`, {
      ...options,
      headers
    });

    if (response.status === 401) {
      // Token expired or invalid
      this.clearAuth();
      throw new Error('Authentication expired. Please log in again.');
    }

    return response;
  }
}

export const authService = new AuthService();
export type { LoginResponse, RegisterResponse };