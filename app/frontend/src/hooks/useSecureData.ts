/**
 * useSecureData Hook - React hook for secure, user-scoped data management
 * 
 * This hook provides:
 * 1. Easy access to SecureDataManager
 * 2. React state integration
 * 3. Automatic initialization and cleanup
 * 4. Error handling
 */

import { useEffect, useState, useCallback } from 'react';
import SecureDataManager from '../utils/SecureDataManager';
import toast from 'react-hot-toast';

interface UseSecureDataOptions {
  autoMigrate?: boolean;
  onError?: (error: Error) => void;
}

interface UseSecureDataResult {
  isInitialized: boolean;
  error: string | null;
  setData: <T>(key: string, data: T) => Promise<void>;
  getData: <T>(key: string) => Promise<T | null>;
  removeData: (key: string) => Promise<void>;
  clearAllData: () => Promise<void>;
  userContext: { userId: string; email: string } | null;
}

export const useSecureData = (options: UseSecureDataOptions = {}): UseSecureDataResult => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userContext, setUserContext] = useState<{ userId: string; email: string } | null>(null);
  
  const { autoMigrate = true, onError } = options;
  const dataManager = SecureDataManager.getInstance();

  // Initialize the secure data manager
  useEffect(() => {
    const initialize = async () => {
      try {
        setError(null);
        
        // Try normal initialization first
        try {
          await dataManager.initialize();
        } catch (authError) {
          console.warn('Authentication failed:', authError);
          
          // In production, don't fall back - require authentication
          if (process.env.NODE_ENV === 'production') {
            throw new Error('Authentication required. Please log in to continue.');
          }
          
          // Only fall back in development
          console.warn('Running in development mode - using fallback');
          await (dataManager as any).initializeFallback();
        }
        
        const context = dataManager.getUserContext();
        if (context) {
          setUserContext({
            userId: context.userId,
            email: context.email
          });
        }

        // Migrate legacy data if enabled (only in authenticated mode)
        if (autoMigrate && context && !context.userId.startsWith('local-dev')) {
          try {
            await dataManager.migrateLegacyData();
          } catch (migrationError) {
            console.warn('Legacy data migration failed:', migrationError);
            // Don't fail initialization for migration errors
          }
        }

        setIsInitialized(true);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to initialize secure data manager';
        setError(errorMessage);
        console.error('SecureDataManager initialization error:', err);
        
        if (onError) {
          onError(err instanceof Error ? err : new Error(errorMessage));
        }
        
        // In production, if initialization fails, user needs to log in
        if (process.env.NODE_ENV === 'production' && errorMessage.includes('Authentication')) {
          // Redirect to login page
          window.location.href = '/login';
        }
      }
    };

    initialize();

    // Cleanup on unmount
    return () => {
      dataManager.reset();
      setIsInitialized(false);
      setUserContext(null);
    };
  }, [autoMigrate, onError]);

  // Store data securely
  const setData = useCallback(async <T>(key: string, data: T): Promise<void> => {
    if (!isInitialized) {
      throw new Error('SecureDataManager not initialized');
    }

    try {
      await dataManager.setSecureData(key, data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to store data';
      console.error('Failed to store secure data:', err);
      toast.error('Failed to save data securely');
      throw new Error(errorMessage);
    }
  }, [isInitialized]);

  // Retrieve data securely
  const getData = useCallback(async <T>(key: string): Promise<T | null> => {
    if (!isInitialized) {
      throw new Error('SecureDataManager not initialized');
    }

    try {
      return await dataManager.getSecureData<T>(key);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to retrieve data';
      console.error('Failed to retrieve secure data:', err);
      return null;
    }
  }, [isInitialized]);

  // Remove data securely
  const removeData = useCallback(async (key: string): Promise<void> => {
    if (!isInitialized) {
      throw new Error('SecureDataManager not initialized');
    }

    try {
      await dataManager.removeSecureData(key);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to remove data';
      console.error('Failed to remove secure data:', err);
      toast.error('Failed to remove data');
      throw new Error(errorMessage);
    }
  }, [isInitialized]);

  // Clear all user data
  const clearAllData = useCallback(async (): Promise<void> => {
    if (!isInitialized) {
      throw new Error('SecureDataManager not initialized');
    }

    try {
      await dataManager.clearUserData();
      toast.success('All data cleared securely');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to clear data';
      console.error('Failed to clear user data:', err);
      toast.error('Failed to clear data');
      throw new Error(errorMessage);
    }
  }, [isInitialized]);

  return {
    isInitialized,
    error,
    setData,
    getData,
    removeData,
    clearAllData,
    userContext
  };
};

export default useSecureData;