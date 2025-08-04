/**
 * SecureDataManager - User-specific data isolation with encryption
 * 
 * This utility provides:
 * 1. User-scoped data storage using Cognito user ID as partition key
 * 2. Client-side encryption using Web Crypto API
 * 3. Secure localStorage with user context
 * 4. Data separation enforcement
 */

import { getCurrentUser } from 'aws-amplify/auth';

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
      // Add timeout to prevent hanging
      const userPromise = getCurrentUser();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Authentication timeout')), 5000)
      );
      
      const user = await Promise.race([userPromise, timeoutPromise]) as any;
      
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
      const tempUserId = `temp-user-${Date.now()}`;
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
    const encoder = new TextEncoder();
    const data = encoder.encode(`${userId}:${email}:ordernimbus_salt_2024`);
    return await crypto.subtle.digest('SHA-256', data);
  }

  /**
   * Generate encryption key from key material
   */
  private async generateEncryptionKey(keyMaterial: ArrayBuffer): Promise<CryptoKey> {
    return await crypto.subtle.importKey(
      'raw',
      keyMaterial,
      { name: this.encryptionAlgorithm },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt data with user-specific key
   */
  private async encryptData(data: string): Promise<EncryptedData> {
    if (!this.userContext) {
      throw new Error('SecureDataManager not initialized');
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
}

export default SecureDataManager;