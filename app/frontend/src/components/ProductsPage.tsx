import { authService } from '../services/auth';
import React, { useState, useEffect } from 'react';
import './ProductsPage.css';
import toast from 'react-hot-toast';
import { ClipLoader } from 'react-spinners';
import { FiRefreshCw, FiSearch, FiFilter, FiPackage, FiPlus, FiTag, FiDollarSign } from 'react-icons/fi';
import ManualEntryModal from './ManualEntryModal';
import './ManualEntryModal.css';
import { getApiUrl } from '../config/environment';

interface Product {
  id: string;
  storeId: string;
  title: string;
  description?: string;
  vendor?: string;
  product_type?: string;
  price: string;
  sku?: string;
  barcode?: string;
  inventory_quantity?: number;
  weight?: number;
  compare_at_price?: string;
  tags?: string;
  created_at: string;
  updated_at: string;
}

interface Store {
  id: string;
  name?: string;
  displayName?: string;
  type?: string;
  shopifyDomain?: string;
  syncStatus?: string;
}

const ProductsPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [vendorFilter, setVendorFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);

  useEffect(() => {
    loadStores();
  }, []);

  useEffect(() => {
    if (selectedStore) {
      loadProducts();
    }
  }, [selectedStore]);

  const loadStores = async () => {
    try {
      // userId is now extracted from JWT token on backend
      
      const response = await authService.authenticatedRequest(`/api/stores`);

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

  const loadProducts = async () => {
    if (!selectedStore) return;
    
    setIsLoading(true);
    try {
      // userId is now extracted from JWT token on backend
      
      const response = await authService.authenticatedRequest(`/api/products?storeId=${selectedStore}`);

      if (response.ok) {
        const data = await response.json();
        setProducts(data.products || []);
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Failed to load products');
        setProducts([]);
      }
    } catch (error) {
      console.error('Error loading products:', error);
      toast.error('Error loading products');
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadProducts();
    setIsRefreshing(false);
    toast.success('Products refreshed');
  };

  const handleManualEntry = async (productData: any) => {
    try {
      // userId is now extracted from JWT token on backend
      
      const response = await authService.authenticatedRequest(`/api/products`, {
        method: 'POST',
        body: JSON.stringify({
          storeId: productData.storeId,
          product: {
            ...productData,
            id: `manual-${Date.now()}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            price: parseFloat(productData.price) || 0,
            compare_at_price: productData.compare_at_price ? parseFloat(productData.compare_at_price) : null,
            inventory_quantity: parseInt(productData.inventory_quantity) || 0,
            weight: parseInt(productData.weight) || 0
          }
        })
      });

      if (response.ok) {
        toast.success('Product created successfully');
        await loadProducts();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create product');
      }
    } catch (error) {
      console.error('Error creating product:', error);
      toast.error(`Failed to create product: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  };

  const formatCurrency = (amount: string | number) => {
    const num = parseFloat(amount?.toString() || '0');
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(num);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Get unique product types and vendors for filters
  const productTypes = Array.from(new Set(products.map(p => p.product_type).filter(Boolean)));
  const vendors = Array.from(new Set(products.map(p => p.vendor).filter(Boolean)));

  const filteredProducts = products.filter(product => {
    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = 
        product.title?.toLowerCase().includes(searchLower) ||
        product.vendor?.toLowerCase().includes(searchLower) ||
        product.product_type?.toLowerCase().includes(searchLower) ||
        product.sku?.toLowerCase().includes(searchLower) ||
        product.tags?.toLowerCase().includes(searchLower);
      
      if (!matchesSearch) return false;
    }

    // Type filter
    if (typeFilter !== 'all' && product.product_type !== typeFilter) {
      return false;
    }

    // Vendor filter
    if (vendorFilter !== 'all' && product.vendor !== vendorFilter) {
      return false;
    }

    return true;
  });

  const selectedStoreObj = stores.find(s => s.id === selectedStore);
  const selectedStoreName = selectedStoreObj ? 
    (selectedStoreObj.displayName || selectedStoreObj.name || selectedStoreObj.shopifyDomain || selectedStoreObj.id) : 
    'Unknown Store';

  return (
    <div className="order-page">
      <header className="order-header">
        <div className="header-content">
          <div className="header-left">
            <h1>Product Management</h1>
            <p>Manage your product catalog across all stores</p>
          </div>
          <div className="header-actions">
            {selectedStore && (
              <button 
                onClick={() => setShowManualEntry(true)}
                className="csv-upload-btn"
              >
                {React.createElement(FiPlus as any)}
                Add Product
              </button>
            )}
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

      <div className="order-controls">
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
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Types</option>
              {productTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div className="filter-container">
            <select
              value={vendorFilter}
              onChange={(e) => setVendorFilter(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Vendors</option>
              {vendors.map(vendor => (
                <option key={vendor} value={vendor}>{vendor}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {selectedStore && !isLoading && products.length > 0 && (
        <div className="order-summary">
          <div className="summary-card">
            <div className="summary-value">{filteredProducts.length}</div>
            <div className="summary-label">Total Products</div>
          </div>
          <div className="summary-card low-stock">
            <div className="summary-value">
              {filteredProducts.filter(p => (p.inventory_quantity || 0) < 10 && (p.inventory_quantity || 0) > 0).length}
            </div>
            <div className="summary-label">Low Stock</div>
          </div>
          <div className="summary-card out-of-stock">
            <div className="summary-value">
              {filteredProducts.filter(p => (p.inventory_quantity || 0) === 0).length}
            </div>
            <div className="summary-label">Out of Stock</div>
          </div>
          <div className="summary-card revenue">
            <div className="summary-value">
              {formatCurrency(
                filteredProducts.reduce((sum, p) => sum + (parseFloat(p.price) || 0) * (p.inventory_quantity || 0), 0)
              )}
            </div>
            <div className="summary-label">Total Value</div>
          </div>
        </div>
      )}

      <div className="order-content">
        {!selectedStore ? (
          <div className="empty-state">
            {React.createElement(FiPackage as any, { size: 64, color: '#9ca3af' })}
            <h3>Select a Store</h3>
            <p>Choose a store from the dropdown to view its products</p>
          </div>
        ) : isLoading ? (
          <div className="loading-state">
            <ClipLoader size={40} color="#667eea" />
            <p>Loading products for {selectedStoreName}...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="empty-state">
            {React.createElement(FiPackage as any, { size: 64, color: '#9ca3af' })}
            <h3>No Products Found</h3>
            <p>No products found for {selectedStoreName}. Add your first product to get started.</p>
            <button onClick={() => setShowManualEntry(true)} className="action-button">
              Add Product
            </button>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="empty-state">
            {React.createElement(FiSearch as any, { size: 64, color: '#9ca3af' })}
            <h3>No Results Found</h3>
            <p>No products match your current search and filters.</p>
            <button onClick={() => { setSearchTerm(''); setTypeFilter('all'); setVendorFilter('all'); }} className="action-button">
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="order-table">
            <div className="table-header">
              <div className="header-cell">Product</div>
              <div className="header-cell">Type</div>
              <div className="header-cell">Vendor</div>
              <div className="header-cell">Price</div>
              <div className="header-cell">Inventory</div>
              <div className="header-cell">Created</div>
            </div>
            <div className="table-body">
              {filteredProducts.map((product) => (
                <div key={product.id} className="table-row">
                  <div className="cell product-cell">
                    <div className="product-info">
                      <div className="product-title">{product.title}</div>
                      {product.sku && <div className="product-sku">SKU: {product.sku}</div>}
                      {product.tags && (
                        <div className="product-tags">
                          {React.createElement(FiTag as any, { size: 12 })}
                          {product.tags}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="cell">{product.product_type || '--'}</div>
                  <div className="cell">{product.vendor || '--'}</div>
                  <div className="cell price-cell">
                    <div className="price-info">
                      <div className="current-price">{formatCurrency(product.price)}</div>
                      {product.compare_at_price && parseFloat(product.compare_at_price) > parseFloat(product.price) && (
                        <div className="compare-price">{formatCurrency(product.compare_at_price)}</div>
                      )}
                    </div>
                  </div>
                  <div className="cell inventory-cell">
                    <span className={`inventory-badge ${(product.inventory_quantity || 0) > 0 ? 'in-stock' : 'out-of-stock'}`}>
                      {product.inventory_quantity || 0}
                    </span>
                  </div>
                  <div className="cell">
                    {formatDate(product.created_at)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Manual Entry Modal */}
      <ManualEntryModal
        isOpen={showManualEntry}
        onClose={() => setShowManualEntry(false)}
        onSubmit={handleManualEntry}
        title="Add New Product"
        type="product"
        stores={stores}
        selectedStore={selectedStore}
      />
    </div>
  );
};

export default ProductsPage;