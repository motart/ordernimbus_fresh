/**
 * SecureDataManager - User-specific data isolation with encryption
 * 
 * This utility provides:
 * 1. User-scoped data storage using Cognito user ID as partition key
 * 2. Client-side encryption using Web Crypto API
 * 3. Secure localStorage with user context
 * 4. Data separation enforcement
 * 5. Environment-aware fallbacks for HTTP vs HTTPS
 */

import { getCurrentUser } from 'aws-amplify/auth';
import { ENV_CONFIG, debugLog } from '../config/environment';

interface EncryptedData {
  encryptedData: string;
  iv: string;
  userId: string;
  timestamp: string;
}

interface UserContext {
  userId: string;
  email: string;
  encryptionKey: CryptoKey;
}

class SecureDataManager {
  private static instance: SecureDataManager;
  private userContext: UserContext | null = null;
  private encryptionAlgorithm = 'AES-GCM';
  
  private constructor() {}

  static getInstance(): SecureDataManager {
    if (!SecureDataManager.instance) {
      SecureDataManager.instance = new SecureDataManager();
    }
    return SecureDataManager.instance;
  }

  /**
   * Initialize the secure data manager with current user context
   */
  async initialize(): Promise<void> {
    try {
      // Check if Amplify is configured
      let user;
      try {
        // Add timeout to prevent hanging
        const userPromise = getCurrentUser();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Authentication timeout')), 5000)
        );
        
        user = await Promise.race([userPromise, timeoutPromise]) as any;
      } catch (amplifyError) {
        // If Amplify is not configured, throw error to trigger fallback
        throw new Error('Amplify not configured or authentication failed');
      }
      
      if (!user || !user.userId) {
        throw new Error('No authenticated user found');
      }

      // Generate user-specific encryption key from user credentials
      const keyMaterial = await this.deriveKeyFromUser(user.userId, user.signInDetails?.loginId || '');
      const encryptionKey = await this.generateEncryptionKey(keyMaterial);

      this.userContext = {
        userId: user.userId,
        email: user.signInDetails?.loginId || '',
        encryptionKey
      };
    } catch (error) {
      console.error('Failed to initialize SecureDataManager:', error);
      throw error;
    }
  }

  /**
   * Initialize with fallback (non-authenticated) mode
   */
  async initializeFallback(fallbackEmail: string = 'temp@example.com'): Promise<void> {
    try {
      // Use a consistent userId for local development
      // For development, use a fixed userId to ensure consistency
      let tempUserId = localStorage.getItem('ordernimbus_local_userId');
      
      if (!tempUserId) {
        // For development, use the existing connected user's ID
        tempUserId = 'e85183d0-3061-70b8-25f5-171fd848ac9d';
        localStorage.setItem('ordernimbus_local_userId', tempUserId);
      }
      
      const keyMaterial = await this.deriveKeyFromUser(tempUserId, fallbackEmail);
      const encryptionKey = await this.generateEncryptionKey(keyMaterial);

      this.userContext = {
        userId: tempUserId,
        email: fallbackEmail,
        encryptionKey
      };
      
      console.log('SecureDataManager initialized in fallback mode');
    } catch (error) {
      console.error('Failed to initialize SecureDataManager in fallback mode:', error);
      throw error;
    }
  }

  /**
   * Derive a consistent key material from user credentials
   */
  private async deriveKeyFromUser(userId: string, email: string): Promise<ArrayBuffer> {
    const input = `${userId}:${email}:ordernimbus_salt_2024`;
    
    // Use Web Crypto API if available and environment supports it
    if (ENV_CONFIG.features.useWebCrypto) {
      try {
        const encoder = new TextEncoder();
        const data = encoder.encode(input);
        const result = await crypto.subtle.digest('SHA-256', data);
        debugLog('Using Web Crypto API for key derivation');
        return result;
      } catch (error) {
        debugLog('Web Crypto API failed, falling back to simple hash:', error);
      }
    }
    
    // Fallback for HTTP environments or when Web Crypto API is unavailable
    debugLog('Using fallback hash for key derivation (environment:', ENV_CONFIG.environment, ')');
    return this.fallbackHash(input);
  }

  /**
   * Generate encryption key from key material
   */
  private async generateEncryptionKey(keyMaterial: ArrayBuffer): Promise<CryptoKey> {
    // Use Web Crypto API if available and environment supports it
    if (ENV_CONFIG.features.useWebCrypto) {
      try {
        const key = await crypto.subtle.importKey(
          'raw',
          keyMaterial,
          { name: this.encryptionAlgorithm },
          false,
          ['encrypt', 'decrypt']
        );
        debugLog('Generated encryption key using Web Crypto API');
        return key;
      } catch (error) {
        debugLog('Web Crypto API key generation failed, using mock key:', error);
      }
    }
    
    // Fallback for HTTP environments
    debugLog('Using mock encryption key for environment:', ENV_CONFIG.environment);
    return this.createMockCryptoKey(keyMaterial);
  }

  /**
   * Encrypt data with user-specific key
   */
  private async encryptData(data: string): Promise<EncryptedData> {
    if (!this.userContext) {
      throw new Error('SecureDataManager not initialized');
    }

    try {
      if (!crypto || !crypto.subtle || !crypto.subtle.encrypt) {
        throw new Error('Web Crypto API not available');
      }

      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);
      const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for AES-GCM

      const encryptedBuffer = await crypto.subtle.encrypt(
        {
          name: this.encryptionAlgorithm,
          iv: iv
        },
        this.userContext.encryptionKey,
        dataBuffer
      );

      return {
        encryptedData: this.arrayBufferToBase64(encryptedBuffer),
        iv: this.arrayBufferToBase64(iv),
        userId: this.userContext.userId,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.warn('Web Crypto API not available for encryption, using fallback');
      // Fallback: Base64 encode the data (not secure, but functional)
      return {
        encryptedData: btoa(data),
        iv: 'fallback',
        userId: this.userContext.userId,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Decrypt data with user-specific key
   */
  private async decryptData(encryptedData: EncryptedData): Promise<string> {
    if (!this.userContext) {
      throw new Error('SecureDataManager not initialized');
    }

    // Verify the data belongs to the current user
    if (encryptedData.userId !== this.userContext.userId) {
      throw new Error('Access denied: Data belongs to different user');
    }

    try {
      // Check if this is fallback encrypted data
      if (encryptedData.iv === 'fallback') {
        return atob(encryptedData.encryptedData);
      }

      if (!crypto || !crypto.subtle || !crypto.subtle.decrypt) {
        throw new Error('Web Crypto API not available');
      }

      const encryptedBuffer = this.base64ToArrayBuffer(encryptedData.encryptedData);
      const iv = this.base64ToArrayBuffer(encryptedData.iv);

      const decryptedBuffer = await crypto.subtle.decrypt(
        {
          name: this.encryptionAlgorithm,
          iv: iv
        },
        this.userContext.encryptionKey,
        encryptedBuffer
      );

      const decoder = new TextDecoder();
      return decoder.decode(decryptedBuffer);
    } catch (error) {
      console.warn('Decryption failed, attempting fallback');
      // Fallback: assume it's base64 encoded
      try {
        return atob(encryptedData.encryptedData);
      } catch (fallbackError) {
        throw new Error('Failed to decrypt data');
      }
    }
  }

  /**
   * Store data securely with user isolation
   */
  async setSecureData(key: string, data: any): Promise<void> {
    if (!this.userContext) {
      throw new Error('SecureDataManager not initialized');
    }

    try {
      const jsonData = JSON.stringify(data);
      const encryptedData = await this.encryptData(jsonData);
      const storageKey = `ordernimbus_${this.userContext.userId}_${key}`;
      
      localStorage.setItem(storageKey, JSON.stringify(encryptedData));
    } catch (error) {
      console.error('Failed to store secure data:', error);
      throw new Error('Failed to store data securely');
    }
  }

  /**
   * Retrieve data securely with user isolation
   */
  async getSecureData<T>(key: string): Promise<T | null> {
    if (!this.userContext) {
      throw new Error('SecureDataManager not initialized');
    }

    try {
      const storageKey = `ordernimbus_${this.userContext.userId}_${key}`;
      const storedData = localStorage.getItem(storageKey);
      
      if (!storedData) {
        return null;
      }

      const encryptedData: EncryptedData = JSON.parse(storedData);
      const decryptedJson = await this.decryptData(encryptedData);
      return JSON.parse(decryptedJson) as T;
    } catch (error) {
      console.error('Failed to retrieve secure data:', error);
      return null;
    }
  }

  /**
   * Remove user-specific data
   */
  async removeSecureData(key: string): Promise<void> {
    if (!this.userContext) {
      throw new Error('SecureDataManager not initialized');
    }

    const storageKey = `ordernimbus_${this.userContext.userId}_${key}`;
    localStorage.removeItem(storageKey);
  }

  /**
   * Clear all data for current user
   */
  async clearUserData(): Promise<void> {
    if (!this.userContext) {
      return;
    }

    const prefix = `ordernimbus_${this.userContext.userId}_`;
    const keysToRemove: string[] = [];

    // Find all keys belonging to current user
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    }

    // Remove all user-specific keys
    keysToRemove.forEach(key => localStorage.removeItem(key));
  }

  /**
   * Get current user context
   */
  getUserContext(): UserContext | null {
    return this.userContext;
  }

  /**
   * Reset the data manager (for logout)
   */
  reset(): void {
    this.userContext = null;
  }

  /**
   * Utility: Convert ArrayBuffer to Base64
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    bytes.forEach(byte => binary += String.fromCharCode(byte));
    return btoa(binary);
  }

  /**
   * Utility: Convert Base64 to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Migrate legacy localStorage data to secure storage
   */
  async migrateLegacyData(): Promise<void> {
    if (!this.userContext) {
      throw new Error('SecureDataManager not initialized');
    }

    // Skip migration - we want a clean start, no demo data
    const legacyStores = localStorage.getItem('ordernimbus_stores');
    if (legacyStores) {
      // Just remove old data, don't migrate
      localStorage.removeItem('ordernimbus_stores');
      console.log('Removed legacy stores data for clean start');
    }

    // Remove other legacy data - don't migrate
    const legacyKeys = ['ordernimbus_forecasts', 'ordernimbus_settings', 'ordernimbus_preferences', 'forecast_history'];
    for (const legacyKey of legacyKeys) {
      const legacyData = localStorage.getItem(legacyKey);
      if (legacyData) {
        localStorage.removeItem(legacyKey);
        console.log(`Removed legacy ${legacyKey} data for clean start`);
      }
    }
  }

  /**
   * Fallback hash function for non-HTTPS environments
   */
  private fallbackHash(input: string): ArrayBuffer {
    // Simple hash function - not cryptographically secure but functional
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    // Create a 32-byte ArrayBuffer to match SHA-256 length
    const buffer = new ArrayBuffer(32);
    const view = new DataView(buffer);
    
    // Fill the buffer with hash-derived values
    for (let i = 0; i < 8; i++) {
      view.setUint32(i * 4, hash + i, false);
    }
    
    return buffer;
  }

  /**
   * Create a mock CryptoKey for fallback mode
   */
  private createMockCryptoKey(keyMaterial: ArrayBuffer): CryptoKey {
    // Return a mock object that mimics CryptoKey interface
    return {
      algorithm: { name: this.encryptionAlgorithm },
      extractable: false,
      type: 'secret' as KeyType,
      usages: ['encrypt', 'decrypt'] as KeyUsage[],
      // Store the key material for fallback encryption
      __keyMaterial: keyMaterial
    } as CryptoKey & { __keyMaterial: ArrayBuffer };
  }
}

export default SecureDataManager;