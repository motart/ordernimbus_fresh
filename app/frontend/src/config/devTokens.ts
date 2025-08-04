// Development environment tokens for automatic store connection
// These tokens are only used when running locally (development mode)

export interface DevStoreConfig {
  domain: string;
  token: string;
  displayName: string;
}

export const DEV_STORES: Record<string, DevStoreConfig> = {
  'ordernimbus-dev': {
    domain: 'ordernimbus-dev.myshopify.com',
    token: process.env.REACT_APP_DEV_SHOPIFY_TOKEN || '', // Set via environment variable for security
    displayName: 'OrderNimbus Dev Store'
  },
  // Add more dev stores here as needed
};

// Check if we're in development mode
export const isDevelopment = (): boolean => {
  return process.env.NODE_ENV === 'development' || 
         window.location.hostname === 'localhost' ||
         window.location.hostname === '127.0.0.1';
};

// Get dev token for a store domain
export const getDevToken = (storeDomain: string): string | null => {
  if (!isDevelopment()) return null;
  
  // Clean up domain
  const cleanDomain = storeDomain.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .replace('.myshopify.com', '');
  
  const devStore = DEV_STORES[cleanDomain];
  return devStore?.token || null;
};

// Check if a store is a dev store
export const isDevStore = (storeDomain: string): boolean => {
  if (!isDevelopment()) return false;
  
  const cleanDomain = storeDomain.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .replace('.myshopify.com', '');
  
  return cleanDomain in DEV_STORES;
};