import React, { useState, useEffect } from 'react';
import './StoresPage.css';
import toast from 'react-hot-toast';
import { 
  FiPlus, 
  FiEdit2, 
  FiTrash2, 
  FiMapPin,
  FiShoppingBag,
  FiGlobe,
  FiX,
  FiCheck,
  FiAlertCircle
} from 'react-icons/fi';
import { SiShopify } from 'react-icons/si';
import { MdStorefront } from 'react-icons/md';
import useSecureData from '../hooks/useSecureData';

interface Store {
  id: string;
  name: string;
  type: 'brick-and-mortar' | 'shopify' | 'other';
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  website?: string;
  shopifyDomain?: string;
  apiKey?: string;
  status: 'active' | 'inactive';
  createdAt: string;
  lastSync?: string;
  totalProducts?: number;
  totalOrders?: number;
  lastForecast?: string;
  forecastAccuracy?: number;
  nextForecast?: string;
  forecastStatus?: 'pending' | 'processing' | 'ready' | 'error';
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
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [showForecastModal, setShowForecastModal] = useState(false);
  const [selectedStoreForForecast, setSelectedStoreForForecast] = useState<Store | null>(null);
  const [forecastData, setForecastData] = useState<Forecast[]>([]);
  const [isGeneratingForecast, setIsGeneratingForecast] = useState(false);
  const [isLoadingStores, setIsLoadingStores] = useState(true);
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
    getData, 
    userContext 
  } = useSecureData();

  // Load stores securely when initialized
  useEffect(() => {
    const loadStores = async () => {
      if (!isInitialized) return;
      
      setIsLoadingStores(true);
      try {
        const savedStores = await getData<Store[]>('stores');
        if (savedStores && savedStores.length > 0) {
          setStores(savedStores);
        } else {
          // Set demo stores if none exist for this user
          const demoStores: Store[] = [
            {
              id: `${userContext?.userId}_1`,
              name: 'Downtown Flagship Store',
              type: 'brick-and-mortar',
              address: '123 Main Street',
              city: 'San Francisco',
              state: 'CA',
              zipCode: '94105',
              country: 'United States',
              status: 'active',
              createdAt: '2024-01-15',
              totalProducts: 1250,
              totalOrders: 3420
            },
            {
              id: `${userContext?.userId}_2`,
              name: 'Online Boutique',
              type: 'shopify',
              shopifyDomain: 'my-boutique.myshopify.com',
              website: 'https://www.myboutique.com',
              status: 'active',
              createdAt: '2024-02-01',
              lastSync: '2024-03-15',
              totalProducts: 850,
              totalOrders: 2100
            }
          ];
          setStores(demoStores);
          await setData('stores', demoStores);
        }
      } catch (error) {
        console.error('Failed to load stores:', error);
        toast.error('Failed to load stores');
      } finally {
        setIsLoadingStores(false);
      }
    };

    loadStores();
  }, [isInitialized, getData, setData, userContext]);

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

    if (formData.type === 'shopify' && !formData.shopifyDomain) {
      toast.error('Please enter your Shopify domain');
      return;
    }

    try {
      const newStore: Store = {
        id: editingStore ? editingStore.id : `${userContext?.userId}_${Date.now()}`,
        name: formData.name,
        type: formData.type,
        address: formData.address,
        city: formData.city,
        state: formData.state,
        zipCode: formData.zipCode,
        country: formData.country,
        website: formData.website,
        shopifyDomain: formData.shopifyDomain,
        apiKey: formData.apiKey,
        status: formData.status,
        createdAt: editingStore ? editingStore.createdAt : new Date().toISOString().split('T')[0],
        totalProducts: editingStore ? editingStore.totalProducts : 0,
        totalOrders: editingStore ? editingStore.totalOrders : 0
      };

      let updatedStores;
      if (editingStore) {
        updatedStores = stores.map(store => 
          store.id === editingStore.id ? newStore : store
        );
        toast.success('Store updated successfully');
      } else {
        updatedStores = [...stores, newStore];
        toast.success('Store added successfully');
      }

      setStores(updatedStores);
      await setData('stores', updatedStores);
      setShowAddModal(false);
      resetForm();
    } catch (error) {
      console.error('Failed to save store:', error);
      toast.error('Failed to save store securely');
    }
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

  const handleDelete = async (storeId: string) => {
    if (!isInitialized) {
      toast.error('System not ready. Please wait...');
      return;
    }

    if (window.confirm('Are you sure you want to delete this store?')) {
      try {
        const updatedStores = stores.filter(store => store.id !== storeId);
        setStores(updatedStores);
        await setData('stores', updatedStores);
        toast.success('Store deleted successfully');
      } catch (error) {
        console.error('Failed to delete store:', error);
        toast.error('Failed to delete store securely');
      }
    }
  };

  const generateForecast = async (store: Store) => {
    setSelectedStoreForForecast(store);
    setIsGeneratingForecast(true);
    setShowForecastModal(true);
    
    // Simulate ML forecast generation
    toast('🤖 Generating AI forecast...', { duration: 3000 });
    
    setTimeout(async () => {
      // Generate mock forecast data
      const forecast: Forecast[] = [];
      const baseValue = 5000 + Math.random() * 10000;
      
      for (let i = 0; i < 30; i++) {
        const date = new Date();
        date.setDate(date.getDate() + i);
        
        // Add weekly pattern
        const dayOfWeek = date.getDay();
        const weekendBoost = (dayOfWeek === 0 || dayOfWeek === 6) ? 1.3 : 1.0;
        
        // Add some randomness
        const variation = 0.8 + Math.random() * 0.4;
        
        // Trend direction
        const trend = i < 10 ? 'increasing' : i < 20 ? 'stable' : 'decreasing';
        const trendMultiplier = trend === 'increasing' ? 1 + (i * 0.01) : 
                               trend === 'decreasing' ? 1 - ((i - 20) * 0.01) : 1;
        
        forecast.push({
          date: date.toISOString().split('T')[0],
          predictedSales: Math.round(baseValue * weekendBoost * variation * trendMultiplier),
          confidence: Math.max(50, 95 - i * 2),
          trend: trend as 'increasing' | 'decreasing' | 'stable'
        });
      }
      
      setForecastData(forecast);
      setIsGeneratingForecast(false);
      
      // Update store with forecast info
      const updatedStores = stores.map(s => 
        s.id === store.id 
          ? { 
              ...s, 
              lastForecast: new Date().toISOString(),
              forecastAccuracy: 85 + Math.random() * 10,
              nextForecast: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
              forecastStatus: 'ready' as const
            }
          : s
      );
      setStores(updatedStores);
      
      try {
        await setData('stores', updatedStores);
        toast.success('✨ Forecast generated successfully!');
      } catch (error) {
        console.error('Failed to save forecast data:', error);
        toast.error('Forecast generated but failed to save securely');
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
            <h1>Stores</h1>
            <h2 className="page-title">Manage your retail locations and online stores</h2>
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
          {userContext && (
            <p style={{ color: '#6b7280', fontSize: '14px' }}>
              User: {userContext.email}
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
          <h2 className="page-title">Manage your retail locations and online stores</h2>
        </div>
        <button className="btn-primary add-store-btn" onClick={() => setShowAddModal(true)}>
          {React.createElement(FiPlus as any)}
          <span>Add Store</span>
        </button>
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
          <div key={store.id} className="store-card">
            <div className="store-header">
              <div className="store-icon">
                {getStoreIcon(store.type)}
              </div>
              <div className="store-actions">
                <button 
                  className="btn-icon" 
                  onClick={() => handleEdit(store)}
                  title="Edit store"
                >
                  {React.createElement(FiEdit2 as any)}
                </button>
                <button 
                  className="btn-icon delete" 
                  onClick={() => handleDelete(store.id)}
                  title="Delete store"
                >
                  {React.createElement(FiTrash2 as any)}
                </button>
              </div>
            </div>
            
            <h3 className="store-name">{store.name}</h3>
            
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

            {store.type === 'shopify' && store.shopifyDomain && (
              <div className="store-domain">
                {React.createElement(FiGlobe as any)}
                {store.shopifyDomain}
              </div>
            )}

            <div className="store-stats">
              {store.totalProducts !== undefined && (
                <div className="stat">
                  <span className="stat-value">{store.totalProducts.toLocaleString()}</span>
                  <span className="stat-label">Products</span>
                </div>
              )}
              {store.totalOrders !== undefined && (
                <div className="stat">
                  <span className="stat-value">{store.totalOrders.toLocaleString()}</span>
                  <span className="stat-label">Orders</span>
                </div>
              )}
            </div>

            <div className="store-footer">
              <span className="created-date">Added {store.createdAt}</span>
              {store.lastSync && (
                <span className="sync-date">Synced {store.lastSync}</span>
              )}
            </div>

            {/* Forecast Section */}
            <div className="store-forecast-section">
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
          {React.createElement(MdStorefront as any)}
          <h3>No stores added yet</h3>
          <p>Add your first store to get started</p>
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
                  <div className="form-group">
                    <label htmlFor="shopifyDomain">Shopify Domain *</label>
                    <input
                      type="text"
                      id="shopifyDomain"
                      name="shopifyDomain"
                      value={formData.shopifyDomain}
                      onChange={handleInputChange}
                      placeholder="your-store.myshopify.com"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="apiKey">API Key (Optional)</label>
                    <input
                      type="password"
                      id="apiKey"
                      name="apiKey"
                      value={formData.apiKey}
                      onChange={handleInputChange}
                      placeholder="Enter your Shopify API key"
                    />
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
    </div>
  );
};

export default StoresPage;