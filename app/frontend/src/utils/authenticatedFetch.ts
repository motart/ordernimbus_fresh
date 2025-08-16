/**
 * Utility function for making authenticated API requests using AWS Amplify
 * This replaces the deprecated authService.authenticatedRequest
 */

import { getApiUrl } from '../config/environment';

interface AuthContext {
  getAccessToken: () => Promise<string | null>;
}

/**
 * Create an authenticated fetch function with the auth context
 * @param auth - The auth context from useAuth hook
 * @returns A function that makes authenticated requests
 */
export const createAuthenticatedFetch = (auth: AuthContext) => {
  return async (endpoint: string, options: RequestInit = {}) => {
    const token = await auth.getAccessToken();
    if (!token) {
      throw new Error('Authentication required. Please log in.');
    }

    const apiUrl = getApiUrl();
    const url = endpoint.startsWith('http') ? endpoint : `${apiUrl}${endpoint}`;
    
    return fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
  };
};

/**
 * Legacy compatibility wrapper for gradual migration
 * @deprecated Use createAuthenticatedFetch instead
 */
export const authenticatedRequest = async (
  endpoint: string, 
  options: RequestInit = {},
  getAccessToken: () => Promise<string | null>
) => {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Authentication required. Please log in.');
  }

  const apiUrl = getApiUrl();
  const url = endpoint.startsWith('http') ? endpoint : `${apiUrl}${endpoint}`;
  
  return fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
};