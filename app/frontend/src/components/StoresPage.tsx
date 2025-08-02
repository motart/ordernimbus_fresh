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
}

const StoresPage: React.FC = () => {
  const [stores, setStores] = useState<Store[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
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

  useEffect(() => {
    // Load stores from localStorage
    const savedStores = localStorage.getItem('ordernimbus_stores');
    if (savedStores) {
      setStores(JSON.parse(savedStores));
    } else {
      // Set demo stores if none exist
      const demoStores: Store[] = [
        {
          id: '1',
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
          id: '2',
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
      localStorage.setItem('ordernimbus_stores', JSON.stringify(demoStores));
    }
  }, []);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name) {
      toast.error('Please enter a store name');
      return;
    }

    if (formData.type === 'shopify' && !formData.shopifyDomain) {
      toast.error('Please enter your Shopify domain');
      return;
    }

    const newStore: Store = {
      id: editingStore ? editingStore.id : Date.now().toString(),
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
    localStorage.setItem('ordernimbus_stores', JSON.stringify(updatedStores));
    setShowAddModal(false);
    resetForm();
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

  const handleDelete = (storeId: string) => {
    if (window.confirm('Are you sure you want to delete this store?')) {
      const updatedStores = stores.filter(store => store.id !== storeId);
      setStores(updatedStores);
      localStorage.setItem('ordernimbus_stores', JSON.stringify(updatedStores));
      toast.success('Store deleted successfully');
    }
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

  return (
    <div className="stores-page">
      <div className="page-header">
        <div className="header-content">
          <h1>Stores</h1>
          <p className="subtitle">Manage your retail locations and online stores</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAddModal(true)}>
          {React.createElement(FiPlus as any)}
          Add Store
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
    </div>
  );
};

export default StoresPage;