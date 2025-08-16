import React, { useState, useEffect } from 'react';
import './StoresPage.css';
import toast from 'react-hot-toast';
import { getApiUrl } from '../config/environment';
import { 
  FiPlus, 
  FiEdit2, 
  FiTrash2, 
  FiMapPin,
  FiGlobe,
  FiX,
  FiCheck,
  FiUpload
} from 'react-icons/fi';
import { SiShopify } from 'react-icons/si';
import { MdStorefront } from 'react-icons/md';
import useSecureData from '../hooks/useSecureData';
import { useAuth } from '../contexts/AuthContext';
import ShopifyConnect from './ShopifyConnect';
import CSVUploadModal from './CSVUploadModal';
import './CSVUploadModal.css';

interface Store {
  id: string;
  name: string;
  displayName?: string;
  type: 'brick-and-mortar' | 'shopify' | 'other';
  address?: string;
  address1?: string;
  city?: string;
  state?: string;
  province?: string;
  zipCode?: string;
  zip?: string;
  country?: string;
  website?: string;
  shopifyDomain?: string;
  myshopifyDomain?: string;
  primaryDomain?: string;
  apiKey?: string;
  status: 'active' | 'inactive';
  createdAt: string;
  lastSync?: string;
  syncStatus?: 'pending' | 'syncing' | 'completed' | 'failed' | 'partial';
  primaryLocationId?: number;
  syncMetadata?: {
    productsCount?: number;
    ordersCount?: number;
    inventoryCount?: number;
    error?: string;
  };
  totalProducts?: number;
  totalOrders?: number;
  productsCount?: number;
  ordersCount?: number;
  inventoryCount?: number;
  lastForecast?: string;
  forecastAccuracy?: number;
  nextForecast?: string;
  forecastStatus?: 'pending' | 'processing' | 'ready' | 'error';
  email?: string;
  phone?: string;
  shopOwner?: string;
  planName?: string;
  currency?: string;
}

interface Forecast {
  date: string;
  predictedSales: number;
  confidence: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}

const StoresPage: React.FC = () => {
  const [stores, setStores] = useState<Store[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showShopifyConnect, setShowShopifyConnect] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [showForecastModal, setShowForecastModal] = useState(false);
  const [selectedStoreForForecast, setSelectedStoreForForecast] = useState<Store | null>(null);
  const [forecastData, setForecastData] = useState<Forecast[]>([]);
  const [isGeneratingForecast, setIsGeneratingForecast] = useState(false);
  const [isLoadingStores, setIsLoadingStores] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [storeToDelete, setStoreToDelete] = useState<Store | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showCSVUpload, setShowCSVUpload] = useState(false);
  const [selectedStoreForCSV, setSelectedStoreForCSV] = useState<Store | null>(null);
  const [newStoreIds, setNewStoreIds] = useState<Set<string>>(new Set()); // Track newly added stores
  const [formData, setFormData] = useState({
    name: '',
    type: 'brick-and-mortar' as Store['type'],
    address: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'United States',
    website: '',
    shopifyDomain: '',
    apiKey: '',
    status: 'active' as Store['status']
  });

  // Initialize secure data management
  const { 
    isInitialized, 
    error: secureDataError, 
    setData, 
    getData 
  } = useSecureData();
  const { user, getAccessToken } = useAuth();

  // Helper function for authenticated API requests
  const authenticatedFetch = async (endpoint: string, options: RequestInit = {}) => {
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

  // Load stores function - moved outside useEffect to be reusable
  const loadStores = async () => {
    if (!user) return;
    
    setIsLoadingStores(true);
    try {
      // Use the authenticated fetch helper
      const response = await authenticatedFetch(`/api/stores?t=${Date.now()}`);
      
      if (response.ok) {
        const result = await response.json();
        if (result.stores && result.stores.length >= 0) {
          setStores(result.stores);
          // Successfully loaded stores from API
          
          // Save to local storage as backup
          if (result.stores.length > 0) {
            await setData('stores', result.stores);
          }
        }
      } else if (response.status === 401) {
        toast.error('Please log in again');
        return;
      } else {
        throw new Error('Failed to load stores from API');
      }
    } catch (error) {
      console.error('Error loading stores:', error);
      toast.error('Failed to load stores. Please try again.');
      
      // Try to load from local storage as fallback
      try {
        const localStores = await getData<Store[]>('stores');
        if (localStores && localStores.length > 0) {
          setStores(localStores);
          // Loaded stores from local storage as fallback
        }
      } catch (localError) {
        console.warn('No local stores found:', localError);
      }
    } finally {
      setIsLoadingStores(false);
    }
  };

  // Load stores securely when initialized
  useEffect(() => {
    loadStores();
  }, [user]);

  // Refresh stores when page gains focus (e.g., navigating back)
  useEffect(() => {
    const handleFocus = () => {
      // Only reload if not currently loading
      if (!isLoadingStores) {
        loadStores();
      }
    };

    window.addEventListener('focus', handleFocus);
    
    // Also refresh when the component becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !isLoadingStores) {
        loadStores();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isLoadingStores]);

  // Handle secure data errors
  useEffect(() => {
    if (secureDataError) {
      toast.error(`Security Error: ${secureDataError}`);
    }
  }, [secureDataError]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'brick-and-mortar',
      address: '',
      city: '',
      state: '',
      zipCode: '',
      country: 'United States',
      website: '',
      shopifyDomain: '',
      apiKey: '',
      status: 'active'
    });
    setEditingStore(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isInitialized) {
      toast.error('System not ready. Please wait...');
      return;
    }

    if (!formData.name) {
      toast.error('Please enter a store name');
      return;
    }

    // Shopify stores are connected via OAuth, not through this form
    if (formData.type === 'shopify') {
      toast.error('Please use the "Connect to Shopify" button to add a Shopify store');
      return;
    }

    try {
      const apiUrl = getApiUrl();
      
      const storePayload = {
        userId: user?.userId || 'test-user',
        name: formData.name,
        type: formData.type,
        address: formData.address,
        city: formData.city,
        state: formData.state,
        zipCode: formData.zipCode,
        country: formData.country,
        website: formData.website,
        shopifyDomain: formData.shopifyDomain,
        apiKey: formData.apiKey || 'development-mode', // Use 'development-mode' for sample data
        status: formData.status
      };

      // Call API to create/update store
      const method = editingStore ? 'PUT' : 'POST';
      const endpoint = editingStore 
        ? `${apiUrl}/api/stores/${editingStore.id}`
        : `${apiUrl}/api/stores`;
      
      const response = await authenticatedFetch(endpoint, {
        method: method,
        body: JSON.stringify(storePayload)
      });

      if (!response.ok) {
        throw new Error('Failed to save store');
      }

      const result = await response.json();
      const savedStore = result.store;
      
      // Update local state
      let updatedStores;
      if (editingStore) {
        updatedStores = stores.map(store => 
          store.id === editingStore.id ? savedStore : store
        );
        toast.success('Store updated successfully');
      } else {
        updatedStores = [...stores, savedStore];
        toast.success('Store added successfully');
        
        // For Shopify stores, show sync status
        if (savedStore.type === 'shopify') {
          toast('🔄 Syncing Shopify data...', { duration: 5000 });
          
          // Poll for sync status
          setTimeout(() => pollSyncStatus(savedStore.id), 3000);
        }
      }
      
      setStores(updatedStores);
      await setData('stores', updatedStores);
      setShowAddModal(false);
      resetForm();
    } catch (error) {
      console.error('Failed to save store:', error);
      toast.error('Failed to save store');
    }
  };

  // Poll for Shopify sync status
  const handleShopifyConnectSuccess = async (storeData: any) => {
    // Shopify connection successful, handling store data
    
    // Close the modal immediately for better UX
    setShowShopifyConnect(false);
    
    // Show loading toast
    toast.loading('Importing your Shopify store data...', { id: 'shopify-sync' });
    
    try {
      // Extract the store domain from the storeData passed from OAuth callback
      const storeDomain = storeData.storeDomain || storeData.shopifyDomain || storeData.shop || '';
      const storeId = storeData.storeId || storeDomain.replace('.myshopify.com', '');
      const userId = user?.userId || storeData.userId || 'test-user';
      
      // Validate we have required data
      if (!storeDomain) {
        throw new Error('Store domain is missing from OAuth callback');
      }
      
      if (!userId) {
        throw new Error('User ID is missing');
      }
      
      // Syncing with store
      
      // First, trigger the sync endpoint to start importing data
      const apiUrl = getApiUrl();
      const syncResponse = await authenticatedFetch(`/api/shopify/sync`, {
        method: 'POST',
        body: JSON.stringify({
          userId: userId,  // Required parameter
          shopifyDomain: storeDomain,  // The Lambda expects this field name
          storeId: storeId,
          syncType: 'initial'  // Optional: specify sync type
        })
      });
      
      if (syncResponse.ok) {
        const syncResult = await syncResponse.json();
        // Sync initiated successfully
        
        // Update the toast with progress
        toast.success(`✅ Connected! Imported ${syncResult.data?.products || 0} products, ${syncResult.data?.orders || 0} orders`, { 
          id: 'shopify-sync',
          duration: 5000 
        });
        
        // Store the previous store IDs before reloading
        const previousStoreIds = new Set(stores.map(s => s.id));
        
        // Reload stores to show the new store
        await loadStores();
        
        // Find the newly added store
        setStores(prevStores => {
          const newStore = prevStores.find((s: Store) => 
            !previousStoreIds.has(s.id) && (
              s.shopifyDomain === storeData.storeDomain || 
              s.myshopifyDomain === storeData.storeDomain
            )
          );
          
          if (newStore) {
            // Mark this store as new for animation
            setNewStoreIds(prev => new Set(prev).add(newStore.id));
            
            // Remove the "new" status after animation completes
            setTimeout(() => {
              setNewStoreIds(prev => {
                const updated = new Set(prev);
                updated.delete(newStore.id);
                return updated;
              });
            }, 5000); // Keep "new" badge for 5 seconds
            
            toast.success(`🎉 ${newStore.name || 'Your Shopify store'} is ready to use!`, { duration: 4000 });
          }
          
          return prevStores;
        });
      } else {
        // Handle non-ok response
        const errorText = await syncResponse.text();
        let errorMessage = 'Store connected but data sync failed';
        
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorMessage;
          console.error('Sync error:', errorData);
        } catch {
          console.error('Sync error (non-JSON):', errorText);
        }
        
        // Even if sync fails, try to load the stores
        await loadStores();
        toast.error(`${errorMessage}. Try manual sync.`, { id: 'shopify-sync' });
      }
    } catch (error: any) {
      console.error('Failed to sync Shopify store:', error);
      const errorMessage = error.message || 'Connection successful but sync failed';
      toast.error(`${errorMessage}. Please try manual sync.`, { id: 'shopify-sync' });
      
      // Still reload stores even if sync failed
      await loadStores();
    }
  };

  const pollSyncStatus = async (storeId: string) => {
    const apiUrl = getApiUrl();
    let attempts = 0;
    const maxAttempts = 20;
    
    const checkStatus = async () => {
      try {
        const response = await authenticatedFetch(`/api/stores`);
        
        if (response.ok) {
          const result = await response.json();
          const store = result.stores.find((s: Store) => s.id === storeId);
          
          if (store) {
            // Update store in state
            setStores(prev => prev.map(s => s.id === storeId ? store : s));
            
            if (store.syncStatus === 'completed') {
              toast.success(`✅ Shopify sync complete! Imported ${store.syncMetadata?.productsCount || 0} products`);
              return;
            } else if (store.syncStatus === 'failed') {
              toast.error('❌ Shopify sync failed. Please check your credentials.');
              return;
            } else if (store.syncStatus === 'syncing' && attempts < maxAttempts) {
              attempts++;
              setTimeout(checkStatus, 2000);
            }
          }
        }
      } catch (error) {
        console.error('Error checking sync status:', error);
      }
    };
    
    checkStatus();
  };

  const handleEdit = (store: Store) => {
    setEditingStore(store);
    setFormData({
      name: store.name,
      type: store.type,
      address: store.address || '',
      city: store.city || '',
      state: store.state || '',
      zipCode: store.zipCode || '',
      country: store.country || 'United States',
      website: store.website || '',
      shopifyDomain: store.shopifyDomain || '',
      apiKey: store.apiKey || '',
      status: store.status
    });
    setShowAddModal(true);
  };

  const handleDeleteClick = (store: Store) => {
    setStoreToDelete(store);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!isInitialized || !storeToDelete) {
      toast.error('System not ready. Please wait...');
      return;
    }

    setIsDeleting(true);
    try {
      const apiUrl = getApiUrl();
      
      // Call API to delete store using DELETE method
      const response = await authenticatedFetch(`/api/stores/${storeToDelete.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        const updatedStores = stores.filter(store => store.id !== storeToDelete.id);
        setStores(updatedStores);
        await setData('stores', updatedStores);
        toast.success(`${storeToDelete.name} has been deleted`);
      } else {
        throw new Error('Failed to delete store');
      }
    } catch (error) {
      console.error('Failed to delete store:', error);
      toast.error('Failed to delete store');
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
      setStoreToDelete(null);
    }
  };

  const cancelDelete = () => {
    setShowDeleteModal(false);
    setStoreToDelete(null);
  };

  const handleCSVUploadClick = (store: Store) => {
    setSelectedStoreForCSV(store);
    setShowCSVUpload(true);
  };

  const handleCSVUpload = async (csvData: any[], columnMappings: any, dataType: string) => {
    if (!selectedStoreForCSV) return;
    
    try {
      const apiUrl = getApiUrl();
      const endpoint = dataType === 'orders' ? '/api/orders/upload-csv' : '/api/data/upload-csv';
      
      const response = await authenticatedFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          dataType: dataType,
          storeId: selectedStoreForCSV.id,
          data: csvData,
          columnMappings: columnMappings
        })
      });

      if (response.ok) {
        const result = await response.json();
        
        // Show detailed success message based on data type
        if (dataType === 'inventory' && result.inventoryCreated && result.productsCreated) {
          toast.success(`✅ Successfully uploaded ${result.inventoryCreated} inventory items and created ${result.productsCreated} products for ${selectedStoreForCSV.name}`, { duration: 6000 });
          toast.success('Navigate to the Inventory page to see your uploaded items!', { duration: 5000 });
        } else {
          const count = result.itemsCreated || result.ordersCreated || result.productsCreated || result.inventoryCreated || result.customersCreated || csvData.length;
          toast.success(`Successfully uploaded ${count} ${dataType} to ${selectedStoreForCSV.name}`);
        }
        
        // Log any errors for debugging
        if (result.errors && result.errors.length > 0) {
          console.error('Upload errors:', result.errors);
          toast.error(`⚠️ ${result.errors.length} items had errors during upload`, { duration: 5000 });
        }
        
        // Refresh stores to update counts after a short delay to ensure DB is updated
        toast('Refreshing store data...', { 
          duration: 1000,
          icon: '🔄'
        });
        setTimeout(async () => {
          await loadStores();
          toast.success('Store data refreshed!', { duration: 2000 });
        }, 1500);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload CSV');
      }
    } catch (error) {
      console.error('Error uploading CSV:', error);
      throw error; // Re-throw to let the modal handle the error
    }
  };

  const triggerManualSync = async (store: Store) => {
    if (store.type !== 'shopify' || !store.apiKey) {
      toast.error('Cannot sync: Store is not properly connected to Shopify');
      return;
    }

    try {
      toast('🔄 Starting manual sync...', { duration: 2000 });
      
      const apiUrl = getApiUrl();
      const response = await authenticatedFetch(`/api/shopify/sync`, {
        method: 'POST',
        body: JSON.stringify({
          storeId: store.id,
          shop: store.shopifyDomain
        })
      });

      if (response.ok) {
        const result = await response.json();
        
        // Check if there were any warnings (partial sync)
        if (result.warnings && result.warnings.length > 0) {
          toast.success(`⚠️ Partial sync complete! Imported ${result.stats?.products || 0} products. Some data requires additional permissions.`, { duration: 5000 });
        } else {
          toast.success(`✅ Sync complete! Imported ${result.stats?.products || 0} products, ${result.stats?.orders || 0} orders`);
        }
        
        // Update store sync status
        const syncStatus = result.warnings && result.warnings.length > 0 ? 'partial' : 'completed';
        const updatedStores = stores.map(s => 
          s.id === store.id 
            ? { 
                ...s, 
                syncStatus: syncStatus as any,
                lastSync: new Date().toISOString(),
                syncMetadata: {
                  productsCount: result.stats?.products || 0,
                  ordersCount: result.stats?.orders || 0,
                  inventoryCount: result.stats?.inventory || 0,
                  notes: result.note
                }
              }
            : s
        );
        setStores(updatedStores);
        await setData('stores', updatedStores);
      } else {
        const error = await response.json();
        toast.error(`Sync failed: ${error.message || 'Unknown error'}`);
        
        // Update store sync status to failed
        const updatedStores = stores.map(s => 
          s.id === store.id 
            ? { ...s, syncStatus: 'failed' as const }
            : s
        );
        setStores(updatedStores);
        await setData('stores', updatedStores);
      }
    } catch (error) {
      console.error('Manual sync error:', error);
      toast.error('Failed to trigger sync');
    }
  };

  const generateForecast = async (store: Store) => {
    setSelectedStoreForForecast(store);
    setIsGeneratingForecast(true);
    setShowForecastModal(true);
    
    // Check if store has actual data
    const userEmail = localStorage.getItem('userEmail') || '';
    const salesData = localStorage.getItem(`sales_data_${userEmail}`);
    
    if (!salesData) {
      toast.error('No sales data available. Please upload historical data first.');
      setIsGeneratingForecast(false);
      setShowForecastModal(false);
      return;
    }
    
    toast('🤖 Generating AI forecast from your data...', { duration: 3000 });
    
    setTimeout(async () => {
      // In a real app, this would call an API to generate forecasts
      // For now, show message that real data is needed
      setForecastData([]);
      setIsGeneratingForecast(false);
      
      toast('📊 Forecast generation requires integration with ML backend. Upload more data to improve accuracy.');
      
      // Update store with forecast request info
      const updatedStores = stores.map(s => 
        s.id === store.id 
          ? { 
              ...s, 
              lastForecast: new Date().toISOString(),
              forecastAccuracy: 0, // No accuracy until real forecast
              nextForecast: undefined,
              forecastStatus: 'pending' as const
            }
          : s
      );
      setStores(updatedStores);
      
      try {
        await setData('stores', updatedStores);
      } catch (error) {
        console.error('Failed to save forecast request:', error);
      }
    }, 3000);
  };

  const getStoreIcon = (type: Store['type']) => {
    switch (type) {
      case 'brick-and-mortar':
        return React.createElement(MdStorefront as any);
      case 'shopify':
        return React.createElement(SiShopify as any);
      default:
        return React.createElement(FiGlobe as any);
    }
  };

  const getStoreTypeLabel = (type: Store['type']) => {
    switch (type) {
      case 'brick-and-mortar':
        return 'Brick & Mortar';
      case 'shopify':
        return 'Shopify';
      default:
        return 'Other';
    }
  };

  // Show loading state while secure data is initializing
  if (!isInitialized || isLoadingStores) {
    return (
      <div className="stores-page">
        <div className="page-header">
          <div className="header-content">
            <h1>
              Stores
              <span className="page-subtitle">Manage your retail locations and online stores</span>
            </h1>
          </div>
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '300px',
          flexDirection: 'column',
          gap: '20px'
        }}>
          <div className="spinner"></div>
          <p style={{ color: '#667eea', fontSize: '16px' }}>
            {!isInitialized ? 'Initializing secure data...' : 'Loading your stores...'}
          </p>
          {user && (
            <p style={{ color: '#6b7280', fontSize: '14px' }}>
              User: {user?.email || 'Unknown User'}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="stores-page">
      <div className="page-header">
        <div className="header-content">
          <h1>Stores</h1>
        </div>
        <div className="header-actions">
          <button className="btn-shopify" onClick={() => setShowShopifyConnect(true)}>
            {React.createElement(SiShopify as any)}
            <span>Connect Shopify</span>
          </button>
          <button className="btn-primary add-store-btn" onClick={() => setShowAddModal(true)}>
            {React.createElement(FiPlus as any)}
            <span>Add Store</span>
          </button>
        </div>
      </div>

      <div className="stores-stats">
        <div className="stat-card">
          <div className="stat-value">{stores.length}</div>
          <div className="stat-label">Total Stores</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {stores.filter(s => s.type === 'brick-and-mortar').length}
          </div>
          <div className="stat-label">Physical Locations</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {stores.filter(s => s.type === 'shopify').length}
          </div>
          <div className="stat-label">Shopify Stores</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {stores.filter(s => s.status === 'active').length}
          </div>
          <div className="stat-label">Active Stores</div>
        </div>
      </div>

      <div className="stores-grid">
        {stores.map(store => (
          <div key={store.id} className={`store-card ${newStoreIds.has(store.id) ? 'new-store' : ''}`}>
            <div className="store-header">
              <div className="store-icon">
                {getStoreIcon(store.type)}
              </div>
              <div className="store-actions">
                {store.type !== 'shopify' && (
                  <button 
                    className="btn-icon" 
                    onClick={() => handleEdit(store)}
                    title="Edit store"
                  >
                    {React.createElement(FiEdit2 as any)}
                  </button>
                )}
                <button 
                  className="btn-icon delete" 
                  onClick={() => handleDeleteClick(store)}
                  title="Delete store"
                >
                  {React.createElement(FiTrash2 as any)}
                </button>
              </div>
            </div>
            
            <h3 className="store-name">{store.name || store.displayName || 'Unnamed Store'}</h3>
            
            <div className="store-type">
              <span className={`type-badge ${store.type}`}>
                {getStoreTypeLabel(store.type)}
              </span>
              <span className={`status-badge ${store.status}`}>
                {store.status}
              </span>
            </div>

            {store.type === 'brick-and-mortar' && store.city && (
              <div className="store-location">
                {React.createElement(FiMapPin as any)}
                {store.city}, {store.state}
              </div>
            )}

            {store.type === 'shopify' && (
              <>
                <div className="store-domain">
                  {React.createElement(FiGlobe as any)}
                  {store.myshopifyDomain || store.shopifyDomain || store.primaryDomain || 'Shopify Store'}
                </div>
                {(store.city || store.province) && (
                  <div className="store-location">
                    {React.createElement(FiMapPin as any)}
                    {store.city || ''}{store.city && (store.province || store.state) ? ', ' : ''}
                    {store.province || store.state || ''}
                    {store.country ? `, ${store.country}` : ''}
                  </div>
                )}
              </>
            )}

            <div className="store-stats">
              {(store.productsCount !== undefined || store.totalProducts !== undefined || store.syncMetadata?.productsCount !== undefined) && (
                <div className="stat">
                  <span className="stat-value">{store.productsCount || store.syncMetadata?.productsCount || store.totalProducts || 0}</span>
                  <span className="stat-label">Products</span>
                </div>
              )}
              {(store.ordersCount !== undefined || store.totalOrders !== undefined || store.syncMetadata?.ordersCount !== undefined) && (
                <div className="stat">
                  <span className="stat-value">{store.ordersCount || store.syncMetadata?.ordersCount || store.totalOrders || 0}</span>
                  <span className="stat-label">Orders</span>
                </div>
              )}
              {store.type === 'shopify' && store.planName && (
                <div className="stat">
                  <span className="stat-value">{store.planName}</span>
                  <span className="stat-label">Plan</span>
                </div>
              )}
            </div>
            
            {/* Sync Status Indicator */}
            {store.type === 'shopify' && store.syncStatus && (
              <div className={`sync-status sync-${store.syncStatus}`}>
                {store.syncStatus === 'pending' && (
                  <>
                    <span>⏳ Sync Pending</span>
                    <button
                      onClick={() => triggerManualSync(store)}
                      className="sync-now-btn"
                      title="Manually trigger sync"
                    >
                      Sync Now
                    </button>
                  </>
                )}
                {store.syncStatus === 'syncing' && '🔄 Syncing...'}
                {store.syncStatus === 'completed' && '✅ Synced'}
                {store.syncStatus === 'partial' && (
                  <>
                    <span>⚠️ Partial Sync</span>
                    <button
                      onClick={() => triggerManualSync(store)}
                      className="sync-now-btn"
                      title="Retry full sync"
                    >
                      Retry
                    </button>
                  </>
                )}
                {store.syncStatus === 'failed' && (
                  <>
                    <span>❌ Sync Failed</span>
                    <button
                      onClick={() => triggerManualSync(store)}
                      className="sync-now-btn"
                      title="Retry sync"
                    >
                      Retry
                    </button>
                  </>
                )}
              </div>
            )}

            <div className="store-footer">
              {store.type === 'shopify' && store.shopOwner && (
                <span className="store-owner">Owner: {store.shopOwner}</span>
              )}
              <span className="created-date">Added {new Date(store.createdAt).toLocaleDateString()}</span>
              {store.lastSync && (
                <span className="sync-date">Synced {new Date(store.lastSync).toLocaleDateString()}</span>
              )}
            </div>

            {/* Actions Section */}
            <div className="store-actions-section">
              {store.type === 'brick-and-mortar' && (
                <button 
                  className="btn-csv-upload"
                  onClick={() => handleCSVUploadClick(store)}
                  title="Import any business data from CSV - Orders, Products, Inventory, and more"
                >
                  {React.createElement(FiUpload as any)}
                  📁 Import Data
                </button>
              )}
              
              <button 
                className="btn-forecast"
                onClick={() => generateForecast(store)}
                disabled={isGeneratingForecast && selectedStoreForForecast?.id === store.id}
              >
                {isGeneratingForecast && selectedStoreForForecast?.id === store.id ? (
                  <>
                    <span className="spinner"></span>
                    Generating...
                  </>
                ) : (
                  <>
                    📊 Generate Forecast
                  </>
                )}
              </button>
              
              {store.forecastStatus === 'ready' && store.lastForecast && (
                <div className="forecast-info">
                  <span className="forecast-accuracy">
                    {store.forecastAccuracy ? `${Math.round(store.forecastAccuracy)}% Accuracy` : ''}
                  </span>
                  <span className="forecast-date">
                    Last: {new Date(store.lastForecast).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {stores.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">🏪</div>
          <h2>No Stores Added Yet</h2>
          <p>To start managing your inventory and generating forecasts, you need to add your first store.</p>
          <button className="btn-primary" onClick={() => setShowAddModal(true)}>
            {React.createElement(FiPlus as any)}
            Add Your First Store
          </button>
        </div>
      )}

      {/* Add/Edit Store Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => {setShowAddModal(false); resetForm();}}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingStore ? 'Edit Store' : 'Add New Store'}</h2>
              <button 
                className="btn-icon"
                onClick={() => {setShowAddModal(false); resetForm();}}
              >
                {React.createElement(FiX as any)}
              </button>
            </div>

            <form onSubmit={handleSubmit} className="store-form">
              <div className="form-group">
                <label htmlFor="name">Store Name *</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="Enter store name"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="type">Store Type *</label>
                <select
                  id="type"
                  name="type"
                  value={formData.type}
                  onChange={handleInputChange}
                  required
                >
                  <option value="brick-and-mortar">Brick & Mortar</option>
                  <option value="shopify">Shopify</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {formData.type === 'brick-and-mortar' && (
                <>
                  <div className="form-group">
                    <label htmlFor="address">Street Address</label>
                    <input
                      type="text"
                      id="address"
                      name="address"
                      value={formData.address}
                      onChange={handleInputChange}
                      placeholder="123 Main Street"
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="city">City</label>
                      <input
                        type="text"
                        id="city"
                        name="city"
                        value={formData.city}
                        onChange={handleInputChange}
                        placeholder="San Francisco"
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="state">State</label>
                      <input
                        type="text"
                        id="state"
                        name="state"
                        value={formData.state}
                        onChange={handleInputChange}
                        placeholder="CA"
                        maxLength={2}
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="zipCode">ZIP Code</label>
                      <input
                        type="text"
                        id="zipCode"
                        name="zipCode"
                        value={formData.zipCode}
                        onChange={handleInputChange}
                        placeholder="94105"
                      />
                    </div>
                  </div>
                </>
              )}

              {formData.type === 'shopify' && (
                <>
                  <div className="shopify-connect-section">
                    <div className="shopify-connect-info">
                      {React.createElement(SiShopify as any, { className: "shopify-icon-large" })}
                      <h3>Connect Your Shopify Store</h3>
                      <p>Click the button below to securely connect your Shopify store through OAuth. No API keys needed!</p>
                      
                      <button
                        type="button"
                        className="btn-shopify-connect"
                        onClick={(e) => {
                          e.preventDefault();
                          setShowAddModal(false);
                          setShowShopifyConnect(true);
                        }}
                      >
                        {React.createElement(SiShopify as any)}
                        Connect to Shopify
                      </button>
                      
                      <div className="connect-benefits">
                        <h4>What happens next:</h4>
                        <ul>
                          <li>✓ Secure OAuth authentication</li>
                          <li>✓ Automatic data import</li>
                          <li>✓ No manual API keys required</li>
                          <li>✓ Works with all Shopify stores</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="form-group">
                <label htmlFor="website">Website</label>
                <input
                  type="url"
                  id="website"
                  name="website"
                  value={formData.website}
                  onChange={handleInputChange}
                  placeholder="https://www.example.com"
                />
              </div>

              <div className="form-group">
                <label htmlFor="status">Status</label>
                <select
                  id="status"
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              {formData.type !== 'shopify' ? (
                <div className="form-actions">
                  <button 
                    type="button" 
                    className="btn-secondary"
                    onClick={() => {setShowAddModal(false); resetForm();}}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    {React.createElement(FiCheck as any)}
                    {editingStore ? 'Update Store' : 'Add Store'}
                  </button>
                </div>
              ) : (
                <div className="form-actions">
                  <button 
                    type="button" 
                    className="btn-secondary"
                    onClick={() => {setShowAddModal(false); resetForm();}}
                  >
                    Close
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Forecast Modal */}
      {showForecastModal && selectedStoreForForecast && (
        <div className="modal-overlay" onClick={() => {setShowForecastModal(false); setSelectedStoreForForecast(null);}}>
          <div className="modal-content forecast-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Sales Forecast - {selectedStoreForForecast.name}</h2>
              <button 
                className="btn-icon"
                onClick={() => {setShowForecastModal(false); setSelectedStoreForForecast(null);}}
              >
                {React.createElement(FiX as any)}
              </button>
            </div>

            <div className="forecast-content">
              {isGeneratingForecast ? (
                <div className="forecast-loading">
                  <div className="loading-spinner"></div>
                  <h3>Analyzing Historical Data...</h3>
                  <p>Our AI is processing sales patterns and generating accurate predictions</p>
                </div>
              ) : (
                <>
                  <div className="forecast-summary">
                    <div className="summary-card">
                      <div className="summary-value">
                        ${forecastData.slice(0, 7).reduce((sum, f) => sum + f.predictedSales, 0).toLocaleString()}
                      </div>
                      <div className="summary-label">Next 7 Days Revenue</div>
                    </div>
                    <div className="summary-card">
                      <div className="summary-value">
                        ${forecastData.slice(0, 30).reduce((sum, f) => sum + f.predictedSales, 0).toLocaleString()}
                      </div>
                      <div className="summary-label">Next 30 Days Revenue</div>
                    </div>
                    <div className="summary-card">
                      <div className="summary-value">
                        {Math.round(forecastData.slice(0, 7).reduce((sum, f) => sum + f.confidence, 0) / 7)}%
                      </div>
                      <div className="summary-label">Avg Confidence</div>
                    </div>
                  </div>

                  <div className="forecast-table">
                    <h3>Daily Forecast</h3>
                    <div className="table-header">
                      <span>Date</span>
                      <span>Predicted Sales</span>
                      <span>Confidence</span>
                      <span>Trend</span>
                    </div>
                    {forecastData.slice(0, 7).map((forecast, index) => (
                      <div key={index} className="table-row">
                        <span>{new Date(forecast.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                        <span className="sales-value">${forecast.predictedSales.toLocaleString()}</span>
                        <span className={`confidence ${forecast.confidence > 80 ? 'high' : forecast.confidence > 60 ? 'medium' : 'low'}`}>
                          {forecast.confidence}%
                        </span>
                        <span className={`trend ${forecast.trend}`}>
                          {forecast.trend === 'increasing' ? '📈' : forecast.trend === 'decreasing' ? '📉' : '➡️'}
                          {' '}{forecast.trend}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="forecast-actions">
                    <button 
                      className="btn-secondary"
                      onClick={() => {setShowForecastModal(false); setSelectedStoreForForecast(null);}}
                    >
                      Close
                    </button>
                    <button className="btn-primary">
                      View Full Report
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Shopify Connect Modal */}
      {showShopifyConnect && (
        <ShopifyConnect
          userId={user?.userId || 'e85183d0-3061-70b8-25f5-171fd848ac9d'}
          onSuccess={handleShopifyConnectSuccess}
          onCancel={() => setShowShopifyConnect(false)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && storeToDelete && (
        <div className="modal-overlay" onClick={cancelDelete}>
          <div className="modal-content delete-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete Store</h2>
              <button 
                className="btn-icon"
                onClick={cancelDelete}
                disabled={isDeleting}
              >
                {React.createElement(FiX as any)}
              </button>
            </div>

            <div className="delete-modal-body">
              <div className="delete-warning-icon">
                {React.createElement(FiTrash2 as any, { size: 48 })}
              </div>
              
              <h3>Are you sure you want to delete this store?</h3>
              
              <div className="store-delete-info">
                <div className="store-delete-details">
                  <div className="store-icon-small">
                    {getStoreIcon(storeToDelete.type)}
                  </div>
                  <div>
                    <div className="store-name-delete">{storeToDelete.name}</div>
                    <div className="store-type-delete">{getStoreTypeLabel(storeToDelete.type)}</div>
                    {storeToDelete.type === 'shopify' && storeToDelete.shopifyDomain && (
                      <div className="store-domain-delete">{storeToDelete.shopifyDomain}</div>
                    )}
                    {storeToDelete.type === 'brick-and-mortar' && storeToDelete.city && (
                      <div className="store-location-delete">
                        {storeToDelete.city}, {storeToDelete.state}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="delete-warning-text">
                <p className="warning-title">⚠️ This action cannot be undone</p>
                <p>All data associated with this store will be permanently deleted, including:</p>
                <ul>
                  <li>• Historical sales data</li>
                  <li>• Product inventory</li>
                  <li>• Forecasts and analytics</li>
                  <li>• Store configuration</li>
                </ul>
              </div>
            </div>

            <div className="modal-actions">
              <button 
                className="btn-secondary"
                onClick={cancelDelete}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button 
                className="btn-danger"
                onClick={confirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <span className="spinner"></span>
                    Deleting...
                  </>
                ) : (
                  <>
                    {React.createElement(FiTrash2 as any)}
                    Delete Store
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Upload Modal */}
      {showCSVUpload && (
        <CSVUploadModal
          isOpen={showCSVUpload}
          onClose={() => setShowCSVUpload(false)}
          onUpload={handleCSVUpload}
          storeId={selectedStoreForCSV?.id || ''}
          storeName={selectedStoreForCSV?.name || ''}
        />
      )}
    </div>
  );
};

export default StoresPage;