import { authService } from '../services/auth';
import React, { useState, useEffect } from 'react';
import './CustomersPage.css';
import toast from 'react-hot-toast';
import { ClipLoader } from 'react-spinners';
import { FiRefreshCw, FiSearch, FiFilter, FiUsers, FiPlus, FiMail, FiPhone, FiMapPin } from 'react-icons/fi';
import ManualEntryModal from './ManualEntryModal';
import './ManualEntryModal.css';
import { getApiUrl } from '../config/environment';

interface Customer {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  zip?: string;
  country?: string;
  tags?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  total_orders?: number;
  total_spent?: string;
}

const CustomersPage: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    setIsLoading(true);
    try {
      // userId is now extracted from JWT token on backend
      
      const response = await authService.authenticatedRequest(`/api/customers`);

      if (response.ok) {
        const data = await response.json();
        setCustomers(data.customers || []);
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Failed to load customers');
        setCustomers([]);
      }
    } catch (error) {
      console.error('Error loading customers:', error);
      toast.error('Error loading customers');
      setCustomers([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadCustomers();
    setIsRefreshing(false);
    toast.success('Customers refreshed');
  };

  const handleManualEntry = async (customerData: any) => {
    try {
      // userId is now extracted from JWT token on backend
      
      const response = await authService.authenticatedRequest(`/api/customers`, {
        method: 'POST',
        body: JSON.stringify({
          storeId: customerData.storeId,
          customer: {
            ...customerData,
            id: `manual-${Date.now()}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            total_orders: 0,
            total_spent: '0.00'
          }
        })
      });

      if (response.ok) {
        toast.success('Customer created successfully');
        await loadCustomers();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create customer');
      }
    } catch (error) {
      console.error('Error creating customer:', error);
      toast.error(`Failed to create customer: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

  const getCustomerName = (customer: Customer) => {
    return `${customer.first_name} ${customer.last_name}`.trim();
  };

  const getCustomerLocation = (customer: Customer) => {
    const parts = [customer.city, customer.province, customer.country].filter(Boolean);
    return parts.join(', ') || '--';
  };

  // Get unique countries for filter
  const countries = Array.from(new Set(customers.map(c => c.country).filter(Boolean)));

  const filteredCustomers = customers.filter(customer => {
    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = 
        getCustomerName(customer).toLowerCase().includes(searchLower) ||
        customer.email?.toLowerCase().includes(searchLower) ||
        customer.phone?.toLowerCase().includes(searchLower) ||
        customer.company?.toLowerCase().includes(searchLower) ||
        getCustomerLocation(customer).toLowerCase().includes(searchLower);
      
      if (!matchesSearch) return false;
    }

    // Country filter
    if (countryFilter !== 'all' && customer.country !== countryFilter) {
      return false;
    }

    return true;
  });

  const customerStats = {
    total: customers.length,
    totalSpent: customers.reduce((sum, customer) => sum + parseFloat(customer.total_spent || '0'), 0),
    avgOrderValue: customers.length > 0 
      ? customers.reduce((sum, customer) => sum + parseFloat(customer.total_spent || '0'), 0) / 
        customers.reduce((sum, customer) => sum + (customer.total_orders || 0), 0 || 1)
      : 0
  };

  return (
    <div className="customers-page">
      <header className="customers-header">
        <div className="header-content">
          <div className="header-left">
            <h1>Customer Management</h1>
            <p>Manage your customer database and track customer relationships</p>
          </div>
          <div className="header-actions">
            <button 
              onClick={() => setShowManualEntry(true)}
              className="manual-entry-btn"
            >
              {React.createElement(FiPlus as any)}
              Add Customer
            </button>
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

      <div className="customers-controls">
        <div className="controls-row">
          <div className="search-container">
            {React.createElement(FiSearch as any, { className: 'search-icon' })}
            <input
              type="text"
              placeholder="Search customers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>

          <div className="filter-container">
            {React.createElement(FiFilter as any, { className: 'filter-icon' })}
            <select
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Countries</option>
              {countries.map(country => (
                <option key={country} value={country}>{country}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {customers.length > 0 && (
        <div className="customer-summary">
          <div className="summary-card">
            <div className="summary-value">{customerStats.total}</div>
            <div className="summary-label">Total Customers</div>
          </div>
          <div className="summary-card">
            <div className="summary-value">{formatCurrency(customerStats.totalSpent)}</div>
            <div className="summary-label">Total Customer Value</div>
          </div>
          <div className="summary-card">
            <div className="summary-value">{formatCurrency(customerStats.avgOrderValue)}</div>
            <div className="summary-label">Avg Order Value</div>
          </div>
        </div>
      )}

      <div className="customers-content">
        {isLoading ? (
          <div className="loading-state">
            <ClipLoader size={40} color="#667eea" />
            <p>Loading customers...</p>
          </div>
        ) : customers.length === 0 ? (
          <div className="empty-state">
            {React.createElement(FiUsers as any, { size: 64, color: '#9ca3af' })}
            <h3>No Customers Found</h3>
            <p>No customers in your database yet. Add your first customer to get started.</p>
            <button onClick={() => setShowManualEntry(true)} className="action-button">
              Add Customer
            </button>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="empty-state">
            {React.createElement(FiSearch as any, { size: 64, color: '#9ca3af' })}
            <h3>No Results Found</h3>
            <p>No customers match your current search and filters.</p>
            <button onClick={() => { setSearchTerm(''); setCountryFilter('all'); }} className="action-button">
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="customers-table">
            <div className="table-header">
              <div className="header-cell">Customer</div>
              <div className="header-cell">Contact</div>
              <div className="header-cell">Location</div>
              <div className="header-cell">Orders</div>
              <div className="header-cell">Total Spent</div>
              <div className="header-cell">Joined</div>
            </div>
            <div className="table-body">
              {filteredCustomers.map((customer) => (
                <div key={customer.id} className="table-row">
                  <div className="cell customer-cell">
                    <div className="customer-info">
                      <div className="customer-name">{getCustomerName(customer)}</div>
                      {customer.company && <div className="customer-company">{customer.company}</div>}
                      {customer.tags && (
                        <div className="customer-tags">
                          {customer.tags.split(',').map((tag, index) => (
                            <span key={index} className="tag">{tag.trim()}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="cell contact-cell">
                    <div className="contact-info">
                      <div className="contact-item">
                        {React.createElement(FiMail as any, { size: 14 })}
                        <span>{customer.email}</span>
                      </div>
                      {customer.phone && (
                        <div className="contact-item">
                          {React.createElement(FiPhone as any, { size: 14 })}
                          <span>{customer.phone}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="cell location-cell">
                    <div className="location-info">
                      {React.createElement(FiMapPin as any, { size: 14 })}
                      <span>{getCustomerLocation(customer)}</span>
                    </div>
                  </div>
                  <div className="cell orders-cell">
                    <span className="orders-count">{customer.total_orders || 0}</span>
                  </div>
                  <div className="cell spent-cell">
                    <span className="spent-amount">{formatCurrency(customer.total_spent || '0')}</span>
                  </div>
                  <div className="cell">
                    {formatDate(customer.created_at)}
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
        title="Add New Customer"
        type="customer"
        stores={[]}
      />
    </div>
  );
};

export default CustomersPage;