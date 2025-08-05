import React, { useState } from 'react';
import './ManualEntryModal.css';
import toast from 'react-hot-toast';
import { FiX, FiPlus, FiSave, FiTrash2 } from 'react-icons/fi';
import { MdStore } from 'react-icons/md';

interface Store {
  id: string;
  name?: string;
  displayName?: string;
  type?: string;
  shopifyDomain?: string;
}

interface ManualEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
  title: string;
  type: 'order' | 'product' | 'customer' | 'inventory';
  stores: Store[];
  selectedStore?: string;
}

const ManualEntryModal: React.FC<ManualEntryModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  title,
  type,
  stores,
  selectedStore
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<any>({});

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setIsSubmitting(true);
      await onSubmit(formData);
      setFormData({});
      onClose();
    } catch (error) {
      console.error('Error submitting form:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev: any) => ({
      ...prev,
      [field]: value
    }));
  };

  const renderOrderForm = () => (
    <form onSubmit={handleSubmit} className="manual-entry-form">
      <div className="form-row">
        <div className="form-group">
          <label>{React.createElement(MdStore as any)} Store</label>
          <select
            value={formData.storeId || selectedStore || ''}
            onChange={(e) => handleInputChange('storeId', e.target.value)}
            required
          >
            <option value="">Select Store</option>
            {stores.map(store => (
              <option key={store.id} value={store.id}>
                {store.displayName || store.name || store.shopifyDomain || store.id}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Order Number</label>
          <input
            type="text"
            value={formData.name || ''}
            onChange={(e) => handleInputChange('name', e.target.value)}
            placeholder="e.g., #1001"
            required
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Customer Email</label>
          <input
            type="email"
            value={formData.email || ''}
            onChange={(e) => handleInputChange('email', e.target.value)}
            placeholder="customer@example.com"
          />
        </div>
        <div className="form-group">
          <label>Phone Number</label>
          <input
            type="tel"
            value={formData.phone || ''}
            onChange={(e) => handleInputChange('phone', e.target.value)}
            placeholder="+1 (555) 123-4567"
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Total Amount</label>
          <input
            type="number"
            step="0.01"
            value={formData.total_price || ''}
            onChange={(e) => handleInputChange('total_price', e.target.value)}
            placeholder="0.00"
            required
          />
        </div>
        <div className="form-group">
          <label>Currency</label>
          <select
            value={formData.currency || 'USD'}
            onChange={(e) => handleInputChange('currency', e.target.value)}
          >
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="CAD">CAD</option>
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Payment Status</label>
          <select
            value={formData.financial_status || 'pending'}
            onChange={(e) => handleInputChange('financial_status', e.target.value)}
          >
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="partially_paid">Partially Paid</option>
            <option value="refunded">Refunded</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div className="form-group">
          <label>Fulfillment Status</label>
          <select
            value={formData.fulfillment_status || ''}
            onChange={(e) => handleInputChange('fulfillment_status', e.target.value)}
          >
            <option value="">Unfulfilled</option>
            <option value="fulfilled">Fulfilled</option>
            <option value="partial">Partially Fulfilled</option>
            <option value="restocked">Restocked</option>
          </select>
        </div>
      </div>

      <div className="shipping-section">
        <h4>Shipping Address</h4>
        <div className="form-row">
          <div className="form-group">
            <label>First Name</label>
            <input
              type="text"
              value={formData.shipping_first_name || ''}
              onChange={(e) => handleInputChange('shipping_first_name', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Last Name</label>
            <input
              type="text"
              value={formData.shipping_last_name || ''}
              onChange={(e) => handleInputChange('shipping_last_name', e.target.value)}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Address</label>
            <input
              type="text"
              value={formData.shipping_address1 || ''}
              onChange={(e) => handleInputChange('shipping_address1', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>City</label>
            <input
              type="text"
              value={formData.shipping_city || ''}
              onChange={(e) => handleInputChange('shipping_city', e.target.value)}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>State/Province</label>
            <input
              type="text"
              value={formData.shipping_province || ''}
              onChange={(e) => handleInputChange('shipping_province', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>ZIP/Postal Code</label>
            <input
              type="text"
              value={formData.shipping_zip || ''}
              onChange={(e) => handleInputChange('shipping_zip', e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="form-actions">
        <button type="button" onClick={onClose} className="btn-secondary">
          Cancel
        </button>
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {React.createElement(FiSave as any)}
          {isSubmitting ? 'Creating...' : 'Create Order'}
        </button>
      </div>
    </form>
  );

  const renderProductForm = () => (
    <form onSubmit={handleSubmit} className="manual-entry-form">
      <div className="form-row">
        <div className="form-group">
          <label>{React.createElement(MdStore as any)} Store</label>
          <select
            value={formData.storeId || selectedStore || ''}
            onChange={(e) => handleInputChange('storeId', e.target.value)}
            required
          >
            <option value="">Select Store</option>
            {stores.map(store => (
              <option key={store.id} value={store.id}>
                {store.displayName || store.name || store.shopifyDomain || store.id}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Product Title</label>
          <input
            type="text"
            value={formData.title || ''}
            onChange={(e) => handleInputChange('title', e.target.value)}
            placeholder="Product name"
            required
          />
        </div>
      </div>

      <div className="form-group">
        <label>Description</label>
        <textarea
          value={formData.description || ''}
          onChange={(e) => handleInputChange('description', e.target.value)}
          placeholder="Product description"
          rows={3}
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Price</label>
          <input
            type="number"
            step="0.01"
            value={formData.price || ''}
            onChange={(e) => handleInputChange('price', e.target.value)}
            placeholder="0.00"
            required
          />
        </div>
        <div className="form-group">
          <label>Compare at Price</label>
          <input
            type="number"
            step="0.01"
            value={formData.compare_at_price || ''}
            onChange={(e) => handleInputChange('compare_at_price', e.target.value)}
            placeholder="0.00"
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>SKU</label>
          <input
            type="text"
            value={formData.sku || ''}
            onChange={(e) => handleInputChange('sku', e.target.value)}
            placeholder="Product SKU"
          />
        </div>
        <div className="form-group">
          <label>Barcode</label>
          <input
            type="text"
            value={formData.barcode || ''}
            onChange={(e) => handleInputChange('barcode', e.target.value)}
            placeholder="Product barcode"
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Inventory Quantity</label>
          <input
            type="number"
            value={formData.inventory_quantity || ''}
            onChange={(e) => handleInputChange('inventory_quantity', e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="form-group">
          <label>Weight (grams)</label>
          <input
            type="number"
            value={formData.weight || ''}
            onChange={(e) => handleInputChange('weight', e.target.value)}
            placeholder="0"
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Product Type</label>
          <input
            type="text"
            value={formData.product_type || ''}
            onChange={(e) => handleInputChange('product_type', e.target.value)}
            placeholder="e.g., Electronics, Clothing"
          />
        </div>
        <div className="form-group">
          <label>Vendor</label>
          <input
            type="text"
            value={formData.vendor || ''}
            onChange={(e) => handleInputChange('vendor', e.target.value)}
            placeholder="Product vendor"
          />
        </div>
      </div>

      <div className="form-actions">
        <button type="button" onClick={onClose} className="btn-secondary">
          Cancel
        </button>
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {React.createElement(FiSave as any)}
          {isSubmitting ? 'Creating...' : 'Create Product'}
        </button>
      </div>
    </form>
  );

  const renderCustomerForm = () => (
    <form onSubmit={handleSubmit} className="manual-entry-form">
      <div className="form-row">
        <div className="form-group">
          <label>First Name</label>
          <input
            type="text"
            value={formData.first_name || ''}
            onChange={(e) => handleInputChange('first_name', e.target.value)}
            placeholder="First name"
            required
          />
        </div>
        <div className="form-group">
          <label>Last Name</label>
          <input
            type="text"
            value={formData.last_name || ''}
            onChange={(e) => handleInputChange('last_name', e.target.value)}
            placeholder="Last name"
            required
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            value={formData.email || ''}
            onChange={(e) => handleInputChange('email', e.target.value)}
            placeholder="customer@example.com"
            required
          />
        </div>
        <div className="form-group">
          <label>Phone</label>
          <input
            type="tel"
            value={formData.phone || ''}
            onChange={(e) => handleInputChange('phone', e.target.value)}
            placeholder="+1 (555) 123-4567"
          />
        </div>
      </div>

      <div className="form-group">
        <label>Company</label>
        <input
          type="text"
          value={formData.company || ''}
          onChange={(e) => handleInputChange('company', e.target.value)}
          placeholder="Company name"
        />
      </div>

      <h4>Default Address</h4>
      <div className="form-row">
        <div className="form-group">
          <label>Address Line 1</label>
          <input
            type="text"
            value={formData.address1 || ''}
            onChange={(e) => handleInputChange('address1', e.target.value)}
            placeholder="Street address"
          />
        </div>
        <div className="form-group">
          <label>Address Line 2</label>
          <input
            type="text"
            value={formData.address2 || ''}
            onChange={(e) => handleInputChange('address2', e.target.value)}
            placeholder="Apt, suite, etc."
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>City</label>
          <input
            type="text"
            value={formData.city || ''}
            onChange={(e) => handleInputChange('city', e.target.value)}
            placeholder="City"
          />
        </div>
        <div className="form-group">
          <label>State/Province</label>
          <input
            type="text"
            value={formData.province || ''}
            onChange={(e) => handleInputChange('province', e.target.value)}
            placeholder="State or Province"
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>ZIP/Postal Code</label>
          <input
            type="text"
            value={formData.zip || ''}
            onChange={(e) => handleInputChange('zip', e.target.value)}
            placeholder="ZIP or Postal Code"
          />
        </div>
        <div className="form-group">
          <label>Country</label>
          <select
            value={formData.country || 'United States'}
            onChange={(e) => handleInputChange('country', e.target.value)}
          >
            <option value="United States">United States</option>
            <option value="Canada">Canada</option>
            <option value="United Kingdom">United Kingdom</option>
            <option value="Australia">Australia</option>
            <option value="Germany">Germany</option>
            <option value="France">France</option>
          </select>
        </div>
      </div>

      <div className="form-actions">
        <button type="button" onClick={onClose} className="btn-secondary">
          Cancel
        </button>
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {React.createElement(FiSave as any)}
          {isSubmitting ? 'Creating...' : 'Create Customer'}
        </button>
      </div>
    </form>
  );

  const renderInventoryForm = () => (
    <form onSubmit={handleSubmit} className="manual-entry-form">
      <div className="form-row">
        <div className="form-group">
          <label>{React.createElement(MdStore as any)} Store</label>
          <select
            value={formData.storeId || selectedStore || ''}
            onChange={(e) => handleInputChange('storeId', e.target.value)}
            required
          >
            <option value="">Select Store</option>
            {stores.map(store => (
              <option key={store.id} value={store.id}>
                {store.displayName || store.name || store.shopifyDomain || store.id}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Product Title</label>
          <input
            type="text"
            value={formData.title || ''}
            onChange={(e) => handleInputChange('title', e.target.value)}
            placeholder="Product name"
            required
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>SKU</label>
          <input
            type="text"
            value={formData.sku || ''}
            onChange={(e) => handleInputChange('sku', e.target.value)}
            placeholder="Product SKU"
            required
          />
        </div>
        <div className="form-group">
          <label>Barcode</label>
          <input
            type="text"
            value={formData.barcode || ''}
            onChange={(e) => handleInputChange('barcode', e.target.value)}
            placeholder="Product barcode"
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Current Stock</label>
          <input
            type="number"
            value={formData.available || ''}
            onChange={(e) => handleInputChange('available', e.target.value)}
            placeholder="0"
            required
          />
        </div>
        <div className="form-group">
          <label>Reserved Stock</label>
          <input
            type="number"
            value={formData.reserved || ''}
            onChange={(e) => handleInputChange('reserved', e.target.value)}
            placeholder="0"
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Unit Cost</label>
          <input
            type="number"
            step="0.01"
            value={formData.cost || ''}
            onChange={(e) => handleInputChange('cost', e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="form-group">
          <label>Unit Price</label>
          <input
            type="number"
            step="0.01"
            value={formData.price || ''}
            onChange={(e) => handleInputChange('price', e.target.value)}
            placeholder="0.00"
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Location</label>
          <input
            type="text"
            value={formData.location || ''}
            onChange={(e) => handleInputChange('location', e.target.value)}
            placeholder="Warehouse location"
          />
        </div>
        <div className="form-group">
          <label>Supplier</label>
          <input
            type="text"
            value={formData.supplier || ''}
            onChange={(e) => handleInputChange('supplier', e.target.value)}
            placeholder="Supplier name"
          />
        </div>
      </div>

      <div className="form-group">
        <label>Notes</label>
        <textarea
          value={formData.notes || ''}
          onChange={(e) => handleInputChange('notes', e.target.value)}
          placeholder="Additional notes about this inventory item"
          rows={2}
        />
      </div>

      <div className="form-actions">
        <button type="button" onClick={onClose} className="btn-secondary">
          Cancel
        </button>
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {React.createElement(FiSave as any)}
          {isSubmitting ? 'Creating...' : 'Add Inventory'}
        </button>
      </div>
    </form>
  );

  const renderForm = () => {
    switch (type) {
      case 'order':
        return renderOrderForm();
      case 'product':
        return renderProductForm();
      case 'customer':
        return renderCustomerForm();
      case 'inventory':
        return renderInventoryForm();
      default:
        return null;
    }
  };

  return (
    <div className="manual-entry-overlay" onClick={onClose}>
      <div className="manual-entry-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{React.createElement(FiPlus as any)} {title}</h2>
          <button onClick={onClose} className="close-button">
            {React.createElement(FiX as any, { size: 20 })}
          </button>
        </div>
        <div className="modal-content">
          {renderForm()}
        </div>
      </div>
    </div>
  );
};

export default ManualEntryModal;