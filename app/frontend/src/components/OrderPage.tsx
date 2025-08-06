import React, { useState, useEffect } from 'react';
import './OrderPage.css';
import toast from 'react-hot-toast';
import { ClipLoader } from 'react-spinners';
import { FiRefreshCw, FiSearch, FiFilter, FiShoppingBag, FiDollarSign, FiCheckCircle, FiClock, FiX, FiAlertCircle, FiUpload, FiPlus } from 'react-icons/fi';
import CSVUploadModal from './CSVUploadModal';
import ManualEntryModal from './ManualEntryModal';
import './CSVUploadModal.css';
import './ManualEntryModal.css';
import { getApiUrl } from '../config/environment';

interface OrderItem {
  id: string;
  product_id: string;
  title: string;
  quantity: number;
  price: string;
  variant_title?: string;
  sku?: string;
}

interface Order {
  id: string;
  storeId: string;
  name: string;
  email?: string;
  phone?: string;
  total_price: string;
  currency: string;
  financial_status: string;
  fulfillment_status: string | null;
  created_at: string;
  updated_at: string;
  tags?: string;
  note?: string;
  line_items: OrderItem[];
  shipping_address?: {
    first_name?: string;
    last_name?: string;
    company?: string;
    address1?: string;
    city?: string;
    province?: string;
    country?: string;
    zip?: string;
  };
  billing_address?: {
    first_name?: string;
    last_name?: string;
    company?: string;
    address1?: string;
    city?: string;
    province?: string;
    country?: string;
    zip?: string;
  };
}

interface Store {
  id: string;
  name?: string;
  displayName?: string;
  type?: string;
  shopifyDomain?: string;
  syncStatus?: string;
}

const OrderPage: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid' | 'fulfilled' | 'cancelled'>('all');
  const [storeFilter, setStoreFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showCSVUpload, setShowCSVUpload] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);

  useEffect(() => {
    loadStores();
  }, []);

  useEffect(() => {
    if (selectedStore) {
      loadOrders();
    } else {
      loadAllOrders();
    }
  }, [selectedStore]);

  const loadStores = async () => {
    try {
      const userId = localStorage.getItem('currentUserId') || 'e85183d0-3061-70b8-25f5-171fd848ac9d';
      
      const response = await fetch(`${getApiUrl()}/api/stores`, {
        headers: {
          'Content-Type': 'application/json',
          'userId': userId
        }
      });

      if (response.ok) {
        const data = await response.json();
        setStores(data.stores || []);
        
        // Auto-load all orders initially
        if (data.stores && data.stores.length > 0 && !selectedStore) {
          setSelectedStore('');
        }
      } else {
        toast.error('Failed to load stores');
      }
    } catch (error) {
      console.error('Error loading stores:', error);
      toast.error('Error loading stores');
    }
  };

  const loadOrders = async () => {
    if (!selectedStore) return;
    
    setIsLoading(true);
    try {
      const userId = localStorage.getItem('currentUserId') || 'e85183d0-3061-70b8-25f5-171fd848ac9d';
      
      const response = await fetch(`${getApiUrl()}/api/orders?storeId=${selectedStore}`, {
        headers: {
          'Content-Type': 'application/json',
          'userId': userId
        }
      });

      if (response.ok) {
        const data = await response.json();
        setOrders(data.orders || []);
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Failed to load orders');
        setOrders([]);
      }
    } catch (error) {
      console.error('Error loading orders:', error);
      toast.error('Error loading orders');
      setOrders([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAllOrders = async () => {
    setIsLoading(true);
    try {
      const userId = localStorage.getItem('currentUserId') || 'e85183d0-3061-70b8-25f5-171fd848ac9d';
      
      // Load orders from all stores
      const response = await fetch(`${getApiUrl()}/api/orders`, {
        headers: {
          'Content-Type': 'application/json',
          'userId': userId
        }
      });

      if (response.ok) {
        const data = await response.json();
        setOrders(data.orders || []);
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Failed to load orders');
        setOrders([]);
      }
    } catch (error) {
      console.error('Error loading all orders:', error);
      toast.error('Error loading orders');
      setOrders([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    if (selectedStore) {
      await loadOrders();
    } else {
      await loadAllOrders();
    }
    setIsRefreshing(false);
    toast.success('Orders refreshed');
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'paid': return FiCheckCircle;
      case 'pending': return FiClock;
      case 'cancelled': case 'refunded': return FiX;
      case 'fulfilled': return FiCheckCircle;
      default: return FiAlertCircle;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'paid': case 'fulfilled': return '#10b981';
      case 'pending': case 'partial': return '#f59e0b';
      case 'cancelled': case 'refunded': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const formatCurrency = (amount: string, currency: string = 'USD') => {
    const num = parseFloat(amount || '0');
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase()
    }).format(num);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredOrders = orders.filter(order => {
    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const orderStore = stores.find(s => s.id === order.storeId);
      const storeName = orderStore ? 
        (orderStore.displayName || orderStore.name || orderStore.shopifyDomain || orderStore.id) : 
        'Unknown Store';
      
      const matchesSearch = 
        order.name?.toLowerCase().includes(searchLower) ||
        order.email?.toLowerCase().includes(searchLower) ||
        order.id?.toLowerCase().includes(searchLower) ||
        storeName.toLowerCase().includes(searchLower) ||
        order.line_items?.some(item => 
          item.title?.toLowerCase().includes(searchLower) ||
          item.sku?.toLowerCase().includes(searchLower)
        );
      
      if (!matchesSearch) return false;
    }

    // Store filter (only applies when viewing all stores)
    if (!selectedStore && storeFilter !== 'all') {
      if (order.storeId !== storeFilter) return false;
    }

    // Status filter
    if (statusFilter !== 'all') {
      switch (statusFilter) {
        case 'pending':
          return order.financial_status?.toLowerCase() === 'pending';
        case 'paid':
          return order.financial_status?.toLowerCase() === 'paid';
        case 'fulfilled':
          return order.fulfillment_status?.toLowerCase() === 'fulfilled';
        case 'cancelled':
          return order.financial_status?.toLowerCase() === 'cancelled' || 
                 order.financial_status?.toLowerCase() === 'refunded';
        default:
          return true;
      }
    }

    return true;
  });

  const orderSummary = {
    total: orders.length,
    pending: orders.filter(order => order.financial_status?.toLowerCase() === 'pending').length,
    paid: orders.filter(order => order.financial_status?.toLowerCase() === 'paid').length,
    fulfilled: orders.filter(order => order.fulfillment_status?.toLowerCase() === 'fulfilled').length,
    totalRevenue: orders.reduce((sum, order) => sum + parseFloat(order.total_price || '0'), 0)
  };

  const selectedStoreObj = stores.find(s => s.id === selectedStore);
  const selectedStoreName = selectedStoreObj ? 
    (selectedStoreObj.displayName || selectedStoreObj.name || selectedStoreObj.shopifyDomain || selectedStoreObj.id) : 
    'Unknown Store';

  const openOrderDetails = (order: Order) => {
    setSelectedOrder(order);
  };

  const closeOrderDetails = () => {
    setSelectedOrder(null);
  };

  const handleCSVUpload = async (csvData: any[], columnMappings: any, dataType: string) => {
    try {
      const userId = localStorage.getItem('currentUserId') || 'e85183d0-3061-70b8-25f5-171fd848ac9d';
      
      // Use the universal data upload endpoint
      const response = await fetch(`${getApiUrl()}/api/data/upload-csv`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'userId': userId
        },
        body: JSON.stringify({
          storeId: selectedStore,
          csvData,
          columnMappings,
          dataType
        })
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(result.message || `Successfully uploaded ${csvData.length} records`);
        // Reload orders to show the new data
        await loadOrders();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload CSV');
      }
    } catch (error) {
      console.error('Error uploading CSV:', error);
      throw error; // Re-throw to let the modal handle the error
    }
  };

  const handleManualEntry = async (orderData: any) => {
    try {
      const userId = localStorage.getItem('currentUserId') || 'e85183d0-3061-70b8-25f5-171fd848ac9d';
      
      // Add required fields for order creation
      const completeOrderData = {
        ...orderData,
        id: `manual-${Date.now()}`, // Generate a temporary ID
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        line_items: [], // Empty line items for now
        // Set default values for required fields
        financial_status: orderData.financial_status || 'pending',
        fulfillment_status: orderData.fulfillment_status || null,
        currency: orderData.currency || 'USD'
      };

      const response = await fetch(`${getApiUrl()}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'userId': userId
        },
        body: JSON.stringify({
          storeId: orderData.storeId,
          order: completeOrderData
        })
      });

      if (response.ok) {
        toast.success('Order created successfully');
        // Reload orders to show the new data
        if (selectedStore) {
          await loadOrders();
        } else {
          await loadAllOrders();
        }
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create order');
      }
    } catch (error) {
      console.error('Error creating order:', error);
      toast.error(`Failed to create order: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  };

  return (
    <div className="order-page">
      <header className="order-header">
        <div className="header-content">
          <div className="header-left">
            <h1>Order Management</h1>
            <p>View and manage orders from all your connected stores</p>
          </div>
          <div className="header-actions">
            <button 
              onClick={() => setShowManualEntry(true)}
              className="manual-entry-btn"
            >
              {React.createElement(FiPlus as any)}
              Add Order
            </button>
            {selectedStore && selectedStoreObj?.type !== 'shopify' && (
              <button 
                onClick={() => setShowCSVUpload(true)}
                className="csv-upload-btn"
              >
                {React.createElement(FiUpload as any)}
                Upload CSV
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
              <option value="">All Stores</option>
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
              placeholder="Search orders, customers, stores..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>

          {!selectedStore && (
            <div className="store-filter-container">
              <label>Filter by Store:</label>
              <select
                value={storeFilter}
                onChange={(e) => setStoreFilter(e.target.value)}
                className="store-filter-select"
              >
                <option value="all">All Stores</option>
                {stores.map(store => {
                  const storeName = store.displayName || store.name || store.shopifyDomain || store.id;
                  return (
                    <option key={store.id} value={store.id}>
                      {storeName}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          <div className="filter-container">
            {React.createElement(FiFilter as any, { className: 'filter-icon' })}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="filter-select"
            >
              <option value="all">All Orders</option>
              <option value="pending">Pending Payment</option>
              <option value="paid">Paid</option>
              <option value="fulfilled">Fulfilled</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {(selectedStore || orders.length > 0) && (
        <div className="order-summary">
          <div 
            className={`summary-card ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            <div className="summary-value">{orderSummary.total}</div>
            <div className="summary-label">Total Orders</div>
          </div>
          <div 
            className={`summary-card pending ${statusFilter === 'pending' ? 'active' : ''}`}
            onClick={() => setStatusFilter('pending')}
          >
            <div className="summary-value">{orderSummary.pending}</div>
            <div className="summary-label">Pending</div>
          </div>
          <div 
            className={`summary-card paid ${statusFilter === 'paid' ? 'active' : ''}`}
            onClick={() => setStatusFilter('paid')}
          >
            <div className="summary-value">{orderSummary.paid}</div>
            <div className="summary-label">Paid</div>
          </div>
          <div 
            className={`summary-card fulfilled ${statusFilter === 'fulfilled' ? 'active' : ''}`}
            onClick={() => setStatusFilter('fulfilled')}
          >
            <div className="summary-value">{orderSummary.fulfilled}</div>
            <div className="summary-label">Fulfilled</div>
          </div>
          <div className="summary-card revenue">
            <div className="summary-value">{formatCurrency(orderSummary.totalRevenue.toString())}</div>
            <div className="summary-label">Total Revenue</div>
          </div>
        </div>
      )}

      <div className="order-content">
        {stores.length === 0 ? (
          <div className="empty-state">
            {React.createElement(FiShoppingBag as any, { size: 64, color: '#9ca3af' })}
            <h3>No Stores Available</h3>
            <p>You need to connect at least one store to view orders</p>
          </div>
        ) : isLoading ? (
          <div className="loading-state">
            <ClipLoader size={40} color="#667eea" />
            <p>Loading orders {selectedStore ? `for ${selectedStoreName}` : 'from all stores'}...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="empty-state">
            {React.createElement(FiShoppingBag as any, { size: 64, color: '#9ca3af' })}
            <h3>No Orders Found</h3>
            <p>No orders found {selectedStore ? `for ${selectedStoreName}` : 'across all stores'}. Orders will appear here once your stores start receiving them.</p>
            <button onClick={handleRefresh} className="action-button">
              Refresh Orders
            </button>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="empty-state">
            {React.createElement(FiSearch as any, { size: 64, color: '#9ca3af' })}
            <h3>No Results Found</h3>
            <p>No orders match your current search and filters.</p>
            <button onClick={() => { setSearchTerm(''); setStatusFilter('all'); setStoreFilter('all'); }} className="action-button">
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="order-table">
            <div className="table-header">
              <div className="header-cell">Order</div>
              <div className="header-cell">Store</div>
              <div className="header-cell">Customer</div>
              <div className="header-cell">Amount</div>
              <div className="header-cell">Payment</div>
              <div className="header-cell">Fulfillment</div>
              <div className="header-cell">Date</div>
              <div className="header-cell">Actions</div>
            </div>
            <div className="table-body">
              {filteredOrders.map((order) => {
                const PaymentIcon = getStatusIcon(order.financial_status);
                const FulfillmentIcon = getStatusIcon(order.fulfillment_status || 'unfulfilled');
                const paymentColor = getStatusColor(order.financial_status);
                const fulfillmentColor = getStatusColor(order.fulfillment_status || 'unfulfilled');

                const orderStore = stores.find(s => s.id === order.storeId);
                const orderStoreName = orderStore ? 
                  (orderStore.displayName || orderStore.name || orderStore.shopifyDomain || orderStore.id) : 
                  'Unknown Store';

                return (
                  <div key={order.id} className="table-row">
                    <div className="cell order-cell">
                      <div className="order-info">
                        <div className="order-name">{order.name}</div>
                        <div className="order-items">
                          {order.line_items?.length || 0} item{(order.line_items?.length || 0) !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                    <div className="cell store-cell">
                      <div className="store-info">
                        <div className="store-name">{orderStoreName}</div>
                        <div className="store-type">{orderStore?.type || 'shopify'}</div>
                      </div>
                    </div>
                    <div className="cell customer-cell">
                      {order.email ? (
                        <div className="customer-info">
                          <div className="customer-email">{order.email}</div>
                          {order.shipping_address && (
                            <div className="customer-location">
                              {order.shipping_address.city}, {order.shipping_address.province}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="no-customer">--</span>
                      )}
                    </div>
                    <div className="cell amount-cell">
                      {formatCurrency(order.total_price, order.currency)}
                    </div>
                    <div className="cell status-cell">
                      <div className="status-badge" style={{ color: paymentColor }}>
                        {React.createElement(PaymentIcon as any, { size: 16 })}
                        <span>{order.financial_status?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Unknown'}</span>
                      </div>
                    </div>
                    <div className="cell status-cell">
                      <div className="status-badge" style={{ color: fulfillmentColor }}>
                        {React.createElement(FulfillmentIcon as any, { size: 16 })}
                        <span>{order.fulfillment_status?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Unfulfilled'}</span>
                      </div>
                    </div>
                    <div className="cell">
                      {formatDate(order.created_at)}
                    </div>
                    <div className="cell">
                      <button 
                        onClick={() => openOrderDetails(order)}
                        className="view-button"
                      >
                        View
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Order Details Modal */}
      {selectedOrder && (
        <div className="order-modal-overlay" onClick={closeOrderDetails}>
          <div className="order-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Order {selectedOrder.name}</h2>
              <button onClick={closeOrderDetails} className="close-button">
                {React.createElement(FiX as any, { size: 20 })}
              </button>
            </div>
            <div className="modal-content">
              <div className="order-details-section">
                <h3>Order Information</h3>
                <div className="details-grid">
                  <div className="detail-item">
                    <label>Order ID:</label>
                    <span>{selectedOrder.id}</span>
                  </div>
                  <div className="detail-item">
                    <label>Store:</label>
                    <span className="store-designation">
                      {(() => {
                        const orderStore = stores.find(s => s.id === selectedOrder.storeId);
                        return orderStore ? 
                          (orderStore.displayName || orderStore.name || orderStore.shopifyDomain || orderStore.id) : 
                          'Unknown Store';
                      })()} ({(() => {
                        const orderStore = stores.find(s => s.id === selectedOrder.storeId);
                        return orderStore?.type || 'shopify';
                      })()})
                    </span>
                  </div>
                  <div className="detail-item">
                    <label>Created:</label>
                    <span>{formatDate(selectedOrder.created_at)}</span>
                  </div>
                  <div className="detail-item">
                    <label>Payment Status:</label>
                    <span className="status" style={{ color: getStatusColor(selectedOrder.financial_status) }}>
                      {selectedOrder.financial_status?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                  </div>
                  <div className="detail-item">
                    <label>Fulfillment:</label>
                    <span className="status" style={{ color: getStatusColor(selectedOrder.fulfillment_status || 'unfulfilled') }}>
                      {selectedOrder.fulfillment_status?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Unfulfilled'}
                    </span>
                  </div>
                  <div className="detail-item">
                    <label>Total:</label>
                    <span className="amount">{formatCurrency(selectedOrder.total_price, selectedOrder.currency)}</span>
                  </div>
                </div>
              </div>

              <div className="order-details-section">
                <h3>Customer Information</h3>
                <div className="details-grid">
                  <div className="detail-item">
                    <label>Email:</label>
                    <span>{selectedOrder.email || '--'}</span>
                  </div>
                  <div className="detail-item">
                    <label>Phone:</label>
                    <span>{selectedOrder.phone || '--'}</span>
                  </div>
                </div>
                {selectedOrder.shipping_address && (
                  <div className="address-section">
                    <h4>Shipping Address</h4>
                    <div className="address">
                      <div>{selectedOrder.shipping_address.first_name} {selectedOrder.shipping_address.last_name}</div>
                      {selectedOrder.shipping_address.company && <div>{selectedOrder.shipping_address.company}</div>}
                      <div>{selectedOrder.shipping_address.address1}</div>
                      <div>{selectedOrder.shipping_address.city}, {selectedOrder.shipping_address.province} {selectedOrder.shipping_address.zip}</div>
                      <div>{selectedOrder.shipping_address.country}</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="order-details-section">
                <h3>Items ({selectedOrder.line_items?.length || 0})</h3>
                <div className="items-list">
                  {selectedOrder.line_items?.map((item, index) => (
                    <div key={index} className="item-row">
                      <div className="item-info">
                        <div className="item-title">{item.title}</div>
                        {item.variant_title && <div className="item-variant">{item.variant_title}</div>}
                        {item.sku && <div className="item-sku">SKU: {item.sku}</div>}
                      </div>
                      <div className="item-quantity">×{item.quantity}</div>
                      <div className="item-price">{formatCurrency(item.price)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSV Upload Modal */}
      <CSVUploadModal
        isOpen={showCSVUpload}
        onClose={() => setShowCSVUpload(false)}
        onUpload={handleCSVUpload}
        storeId={selectedStore}
        storeName={selectedStoreName}
      />

      {/* Manual Entry Modal */}
      <ManualEntryModal
        isOpen={showManualEntry}
        onClose={() => setShowManualEntry(false)}
        onSubmit={handleManualEntry}
        title="Add New Order"
        type="order"
        stores={stores}
        selectedStore={selectedStore}
      />
    </div>
  );
};

export default OrderPage;