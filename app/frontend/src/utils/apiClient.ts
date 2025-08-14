// Centralized API client with environment-aware configuration
import { getENV_CONFIG, debugLog, getApiUrl } from '../config/environment';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export class ApiClient {
  private getBaseUrl(): string {
    // Always get the latest API URL dynamically
    return getApiUrl();
  }
  
  constructor() {
    // Don't cache the base URL - get it dynamically
    debugLog('ApiClient initialized');
  }
  
  private async makeRequest<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}${endpoint}`;
    
    const defaultHeaders = {
      'Content-Type': 'application/json',
      ...options.headers
    };
    
    const requestOptions: RequestInit = {
      ...options,
      headers: defaultHeaders
    };
    
    const config = getENV_CONFIG();
    debugLog('Making API request:', {
      url,
      method: options.method || 'GET',
      environment: config.environment
    });
    
    try {
      const response = await fetch(url, requestOptions);
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorJson.message || errorMessage;
        } catch {
          // If not JSON, use the text as error message
          if (errorText) errorMessage = errorText;
        }
        
        return {
          success: false,
          error: errorMessage
        };
      }
      
      const data = await response.json();
      return {
        success: true,
        data
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debugLog('API request failed:', error);
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }
  
  async get<T>(endpoint: string, headers?: Record<string, string>): Promise<ApiResponse<T>> {
    return this.makeRequest<T>(endpoint, { method: 'GET', headers });
  }
  
  async post<T>(
    endpoint: string, 
    body?: any, 
    headers?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    return this.makeRequest<T>(endpoint, {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
  }
  
  async put<T>(
    endpoint: string, 
    body?: any, 
    headers?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    return this.makeRequest<T>(endpoint, {
      method: 'PUT',
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
  }
  
  async delete<T>(endpoint: string, headers?: Record<string, string>): Promise<ApiResponse<T>> {
    return this.makeRequest<T>(endpoint, { method: 'DELETE', headers });
  }
}

// Singleton instance
export const apiClient = new ApiClient();

// Convenience functions for common operations
export const api = {
  // Store operations
  stores: {
    list: (userId: string) => apiClient.get('/api/stores', { userId }),
    create: (userId: string, storeData: any) => 
      apiClient.post('/api/stores', storeData, { userId }),
    update: (userId: string, storeId: string, storeData: any) => 
      apiClient.put(`/api/stores/${storeId}`, storeData, { userId }),
    delete: (userId: string, storeId: string) => 
      apiClient.delete(`/api/stores/${storeId}`, { userId })
  },
  
  // Shopify operations
  shopify: {
    connect: (userId: string, storeDomain: string) => 
      apiClient.post('/api/shopify/connect', { userId, storeDomain }),
    sync: (userId: string, storeId: string, shopifyDomain: string, apiKey: string) => 
      apiClient.post('/api/shopify/sync', { userId, storeId, shopifyDomain, apiKey })
  },
  
  // Product operations
  products: {
    list: (userId: string, storeId?: string) => {
      const params = storeId ? `?storeId=${storeId}` : '';
      return apiClient.get(`/api/products${params}`, { userId });
    },
    create: (userId: string, productData: any) => 
      apiClient.post('/api/products', productData, { userId })
  },
  
  // Order operations
  orders: {
    list: (userId: string, storeId?: string) => {
      const params = storeId ? `?storeId=${storeId}` : '';
      return apiClient.get(`/api/orders${params}`, { userId });
    },
    create: (userId: string, orderData: any) => 
      apiClient.post('/api/orders', orderData, { userId })
  },
  
  // Inventory operations
  inventory: {
    list: (userId: string, storeId?: string) => {
      const params = storeId ? `?storeId=${storeId}` : '';
      return apiClient.get(`/api/inventory${params}`, { userId });
    },
    create: (userId: string, inventoryData: any) => 
      apiClient.post('/api/inventory', inventoryData, { userId })
  },
  
  // Customer operations
  customers: {
    list: (userId: string, storeId?: string) => {
      const params = storeId ? `?storeId=${storeId}` : '';
      return apiClient.get(`/api/customers${params}`, { userId });
    },
    create: (userId: string, customerData: any) => 
      apiClient.post('/api/customers', customerData, { userId })
  }
};