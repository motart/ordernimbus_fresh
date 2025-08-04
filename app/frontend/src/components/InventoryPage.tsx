import React, { useState, useEffect } from 'react';
import './InventoryPage.css';
import toast from 'react-hot-toast';
import { ClipLoader } from 'react-spinners';
import { FiRefreshCw, FiSearch, FiFilter, FiPackage, FiAlertTriangle, FiCheckCircle } from 'react-icons/fi';

interface InventoryItem {
  id: string;
  storeId: string;
  inventoryItemId: string;
  locationId: string;
  available: number;
  updatedAt: string;
  syncedAt: number;
  // Product info (joined from products table)
  productId?: string;
  title?: string;
  vendor?: string;
  productType?: string;
  variants?: Array<{
    id: string;
    title: string;
    price: string;
    sku?: string;
    inventory_item_id: string;
  }>;
}

interface Store {
  id: string;
  name?: string;
  displayName?: string;
  type?: string;
  shopifyDomain?: string;
  syncStatus?: string;
}

const InventoryPage: React.FC = () => {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in-stock' | 'low-stock' | 'out-of-stock'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    loadStores();
  }, []);

  useEffect(() => {
    if (selectedStore) {
      loadInventory();
    }
  }, [selectedStore]);

  const loadStores = async () => {
    try {
      const userId = localStorage.getItem('currentUserId') || 'e85183d0-3061-70b8-25f5-171fd848ac9d';
      
      const response = await fetch('http://127.0.0.1:3001/api/stores', {
        headers: {
          'Content-Type': 'application/json',
          'userId': userId
        }
      });

      if (response.ok) {
        const data = await response.json();
        setStores(data.stores || []);
        
        // Auto-select first store
        if (data.stores && data.stores.length > 0 && !selectedStore) {
          setSelectedStore(data.stores[0].id);
        }
      } else {
        toast.error('Failed to load stores');
      }
    } catch (error) {
      console.error('Error loading stores:', error);
      toast.error('Error loading stores');
    }
  };

  const loadInventory = async () => {
    if (!selectedStore) return;
    
    setIsLoading(true);
    try {
      const userId = localStorage.getItem('currentUserId') || 'e85183d0-3061-70b8-25f5-171fd848ac9d';
      
      const response = await fetch(`http://127.0.0.1:3001/api/inventory?storeId=${selectedStore}`, {
        headers: {
          'Content-Type': 'application/json',
          'userId': userId
        }
      });

      if (response.ok) {
        const data = await response.json();
        setInventory(data.inventory || []);
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Failed to load inventory');
        setInventory([]);
      }
    } catch (error) {
      console.error('Error loading inventory:', error);
      toast.error('Error loading inventory');
      setInventory([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadInventory();
    setIsRefreshing(false);
    toast.success('Inventory refreshed');
  };

  const getStockStatus = (available: number) => {
    if (available === 0) return 'out-of-stock';
    if (available < 10) return 'low-stock';
    return 'in-stock';
  };

  const getStockStatusColor = (status: string) => {
    switch (status) {
      case 'out-of-stock': return '#ef4444';
      case 'low-stock': return '#f59e0b';
      case 'in-stock': return '#10b981';
      default: return '#6b7280';
    }
  };

  const getStockStatusIcon = (status: string) => {
    switch (status) {
      case 'out-of-stock': return FiAlertTriangle;
      case 'low-stock': return FiAlertTriangle;
      case 'in-stock': return FiCheckCircle;
      default: return FiPackage;
    }
  };

  const filteredInventory = inventory.filter(item => {
    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = 
        item.title?.toLowerCase().includes(searchLower) ||
        item.vendor?.toLowerCase().includes(searchLower) ||
        item.productType?.toLowerCase().includes(searchLower) ||
        item.variants?.some(v => 
          v.title?.toLowerCase().includes(searchLower) ||
          v.sku?.toLowerCase().includes(searchLower)
        );
      
      if (!matchesSearch) return false;
    }

    // Stock filter
    if (stockFilter !== 'all') {
      const status = getStockStatus(item.available);
      if (status !== stockFilter) return false;
    }

    return true;
  });

  const stockSummary = {
    total: inventory.length,
    inStock: inventory.filter(item => getStockStatus(item.available) === 'in-stock').length,
    lowStock: inventory.filter(item => getStockStatus(item.available) === 'low-stock').length,
    outOfStock: inventory.filter(item => getStockStatus(item.available) === 'out-of-stock').length,
  };

  const selectedStoreObj = stores.find(s => s.id === selectedStore);
  const selectedStoreName = selectedStoreObj ? 
    (selectedStoreObj.displayName || selectedStoreObj.name || selectedStoreObj.shopifyDomain || selectedStoreObj.id) : 
    'Unknown Store';

  return (
    <div className="inventory-page">
      <header className="inventory-header">
        <div className="header-content">
          <div className="header-left">
            <h1>Inventory Management</h1>
            <p>Track and manage your product inventory across all stores</p>
          </div>
          <div className="header-actions">
            <button 
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="refresh-btn"
            >
              {React.createElement(FiRefreshCw as any, { className: isRefreshing ? 'spinning' : '' })}
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
      </header>

      <div className="inventory-controls">
        <div className="controls-row">
          <div className="store-selector-container">
            <label>Store:</label>
            <select 
              value={selectedStore} 
              onChange={(e) => setSelectedStore(e.target.value)}
              className="store-selector"
            >
              <option value="">Select a store</option>
              {stores.map(store => {
                const storeName = store.displayName || store.name || store.shopifyDomain || store.id;
                const storeType = store.type || 'shopify';
                return (
                  <option key={store.id} value={store.id}>
                    {storeName} ({storeType})
                  </option>
                );
              })}
            </select>
          </div>

          <div className="search-container">
            {React.createElement(FiSearch as any, { className: 'search-icon' })}
            <input
              type="text"
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>

          <div className="filter-container">
            {React.createElement(FiFilter as any, { className: 'filter-icon' })}
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value as any)}
              className="filter-select"
            >
              <option value="all">All Stock</option>
              <option value="in-stock">In Stock</option>
              <option value="low-stock">Low Stock</option>
              <option value="out-of-stock">Out of Stock</option>
            </select>
          </div>
        </div>
      </div>

      {selectedStore && (
        <div className="stock-summary">
          <div 
            className={`summary-card ${stockFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStockFilter('all')}
          >
            <div className="summary-value">{stockSummary.total}</div>
            <div className="summary-label">Total Items</div>
          </div>
          <div 
            className={`summary-card in-stock ${stockFilter === 'in-stock' ? 'active' : ''}`}
            onClick={() => setStockFilter('in-stock')}
          >
            <div className="summary-value">{stockSummary.inStock}</div>
            <div className="summary-label">In Stock</div>
          </div>
          <div 
            className={`summary-card low-stock ${stockFilter === 'low-stock' ? 'active' : ''}`}
            onClick={() => setStockFilter('low-stock')}
          >
            <div className="summary-value">{stockSummary.lowStock}</div>
            <div className="summary-label">Low Stock</div>
          </div>
          <div 
            className={`summary-card out-of-stock ${stockFilter === 'out-of-stock' ? 'active' : ''}`}
            onClick={() => setStockFilter('out-of-stock')}
          >
            <div className="summary-value">{stockSummary.outOfStock}</div>
            <div className="summary-label">Out of Stock</div>
          </div>
        </div>
      )}

      <div className="inventory-content">
        {!selectedStore ? (
          <div className="empty-state">
            {React.createElement(FiPackage as any, { size: 64, color: '#9ca3af' })}
            <h3>Select a Store</h3>
            <p>Choose a store from the dropdown to view its inventory</p>
          </div>
        ) : isLoading ? (
          <div className="loading-state">
            <ClipLoader size={40} color="#667eea" />
            <p>Loading inventory for {selectedStoreName}...</p>
          </div>
        ) : inventory.length === 0 ? (
          <div className="empty-state">
            {React.createElement(FiPackage as any, { size: 64, color: '#9ca3af' })}
            <h3>No Inventory Data</h3>
            <p>No inventory found for {selectedStoreName}. Make sure your store is synced.</p>
            <button onClick={handleRefresh} className="action-button">
              Refresh Inventory
            </button>
          </div>
        ) : filteredInventory.length === 0 ? (
          <div className="empty-state">
            {React.createElement(FiSearch as any, { size: 64, color: '#9ca3af' })}
            <h3>No Results Found</h3>
            <p>No inventory items match your current search and filters.</p>
            <button onClick={() => { setSearchTerm(''); setStockFilter('all'); }} className="action-button">
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="inventory-table">
            <div className="table-header">
              <div className="header-cell">Product</div>
              <div className="header-cell">Vendor</div>
              <div className="header-cell">Type</div>
              <div className="header-cell">Stock Level</div>
              <div className="header-cell">Status</div>
              <div className="header-cell">Last Updated</div>
            </div>
            <div className="table-body">
              {filteredInventory.map((item) => {
                const status = getStockStatus(item.available);
                const StatusIcon = getStockStatusIcon(status);
                const statusColor = getStockStatusColor(status);

                return (
                  <div key={item.id} className="table-row">
                    <div className="cell product-cell">
                      <div className="product-info">
                        <div className="product-title">{item.title || 'Unknown Product'}</div>
                        {item.variants && item.variants.length > 0 && (
                          <div className="product-variants">
                            {item.variants.map(variant => (
                              <span key={variant.id} className="variant-tag">
                                {variant.title} - ${variant.price}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="cell">{item.vendor || '--'}</div>
                    <div className="cell">{item.productType || '--'}</div>
                    <div className="cell stock-level">{item.available}</div>
                    <div className="cell status-cell">
                      <div className="status-badge" style={{ color: statusColor }}>
                        {React.createElement(StatusIcon as any, { size: 16 })}
                        <span>{status.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                      </div>
                    </div>
                    <div className="cell">
                      {new Date(item.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InventoryPage;