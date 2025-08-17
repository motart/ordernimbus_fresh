/**
 * Payment Method Manager Component
 * Handles adding, viewing, and managing payment methods via Stripe
 * 
 * Security: Uses Stripe Elements for PCI compliance
 * UX: Clear feedback, secure card entry, easy management
 */

import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardElement,
  useStripe,
  useElements
} from '@stripe/react-stripe-js';
import { FaCreditCard, FaTrash, FaStar, FaPlus, FaTimes } from 'react-icons/fa';
import toast from 'react-hot-toast';
import './PaymentMethodManager.css';

// Initialize Stripe
const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || '');

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

interface PaymentMethodManagerProps {
  userId: string;
  onPaymentMethodAdded?: () => void;
  requirePaymentMethod?: boolean;
  trialEnding?: boolean;
}

/**
 * Add Payment Method Form Component
 */
const AddPaymentMethodForm: React.FC<{
  onSuccess: () => void;
  onCancel: () => void;
}> = ({ onSuccess, onCancel }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Get setup intent from backend
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/payment/setup-intent', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: localStorage.getItem('userEmail') // Should come from auth context
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create setup intent');
      }

      const { clientSecret } = await response.json();

      // Confirm card setup
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        throw new Error('Card element not found');
      }

      const { error: stripeError, setupIntent } = await stripe.confirmCardSetup(
        clientSecret,
        {
          payment_method: {
            card: cardElement,
          }
        }
      );

      if (stripeError) {
        setError(stripeError.message || 'Card verification failed');
        return;
      }

      if (setupIntent?.status === 'succeeded') {
        toast.success('Payment method added successfully!');
        onSuccess();
      }
    } catch (err: any) {
      console.error('Error adding payment method:', err);
      setError(err.message || 'Failed to add payment method');
      toast.error('Failed to add payment method');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="add-payment-form">
      <div className="form-header">
        <h3>Add Payment Method</h3>
        <button type="button" onClick={onCancel} className="close-btn">
          {React.createElement(FaTimes as any, { size: 20 })}
        </button>
      </div>

      <div className="card-element-wrapper">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#424770',
                '::placeholder': {
                  color: '#aab7c4',
                },
              },
              invalid: {
                color: '#9e2146',
              },
            },
          }}
        />
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <div className="form-footer">
        <p className="security-note">
          🔒 Your payment information is securely processed by Stripe.
          We never store your card details.
        </p>
        <div className="form-actions">
          <button
            type="button"
            onClick={onCancel}
            className="cancel-btn"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="submit-btn"
            disabled={!stripe || loading}
          >
            {loading ? 'Adding...' : 'Add Card'}
          </button>
        </div>
      </div>
    </form>
  );
};

/**
 * Main Payment Method Manager Component
 */
const PaymentMethodManager: React.FC<PaymentMethodManagerProps> = ({
  userId,
  onPaymentMethodAdded,
  requirePaymentMethod = false,
  trialEnding = false
}) => {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchPaymentMethods();
  }, []);

  const fetchPaymentMethods = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/payment/methods', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setPaymentMethods(data.paymentMethods || []);
      }
    } catch (error) {
      console.error('Failed to fetch payment methods:', error);
      toast.error('Failed to load payment methods');
    } finally {
      setLoading(false);
    }
  };

  const handleSetDefault = async (paymentMethodId: string) => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/payment/methods', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ paymentMethodId })
      });

      if (response.ok) {
        toast.success('Default payment method updated');
        fetchPaymentMethods();
      } else {
        throw new Error('Failed to update default payment method');
      }
    } catch (error) {
      console.error('Error setting default payment method:', error);
      toast.error('Failed to update default payment method');
    }
  };

  const handleDelete = async (paymentMethodId: string) => {
    if (!window.confirm('Are you sure you want to remove this payment method?')) {
      return;
    }

    setDeletingId(paymentMethodId);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/payment/methods', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ paymentMethodId })
      });

      if (response.ok) {
        toast.success('Payment method removed');
        fetchPaymentMethods();
      } else {
        throw new Error('Failed to remove payment method');
      }
    } catch (error) {
      console.error('Error deleting payment method:', error);
      toast.error('Failed to remove payment method');
    } finally {
      setDeletingId(null);
    }
  };

  const handlePaymentMethodAdded = () => {
    setShowAddForm(false);
    fetchPaymentMethods();
    if (onPaymentMethodAdded) {
      onPaymentMethodAdded();
    }
  };

  if (loading) {
    return (
      <div className="payment-methods-loading">
        <div className="spinner" />
        <p>Loading payment methods...</p>
      </div>
    );
  }

  return (
    <div className="payment-method-manager">
      {/* Trial ending warning */}
      {trialEnding && paymentMethods.length === 0 && (
        <div className="trial-warning">
          <h3>⏰ Your trial is ending soon!</h3>
          <p>Add a payment method to continue using OrderNimbus after your trial ends.</p>
        </div>
      )}

      {/* Require payment method notice */}
      {requirePaymentMethod && paymentMethods.length === 0 && !trialEnding && (
        <div className="payment-required">
          <h3>Payment Method Required</h3>
          <p>Please add a payment method to continue using OrderNimbus.</p>
        </div>
      )}

      {/* Payment methods list */}
      {!showAddForm && (
        <>
          <div className="payment-methods-header">
            <h2>Payment Methods</h2>
            <button
              className="add-payment-btn"
              onClick={() => setShowAddForm(true)}
            >
              {React.createElement(FaPlus as any, { size: 16 })}
              Add Payment Method
            </button>
          </div>

          {paymentMethods.length === 0 ? (
            <div className="no-payment-methods">
              {React.createElement(FaCreditCard as any, { size: 48 })}
              <h3>No payment methods</h3>
              <p>Add a payment method to ensure uninterrupted service.</p>
              <button
                className="add-first-payment-btn"
                onClick={() => setShowAddForm(true)}
              >
                Add Your First Card
              </button>
            </div>
          ) : (
            <div className="payment-methods-list">
              {paymentMethods.map((method) => (
                <div key={method.id} className={`payment-method-card ${method.isDefault ? 'default' : ''}`}>
                  <div className="card-info">
                    {React.createElement(FaCreditCard as any, { size: 24 })}
                    <div className="card-details">
                      <span className="card-brand">{method.brand.toUpperCase()}</span>
                      <span className="card-number">•••• {method.last4}</span>
                      <span className="card-expiry">
                        Expires {String(method.expMonth).padStart(2, '0')}/{method.expYear}
                      </span>
                    </div>
                  </div>

                  <div className="card-actions">
                    {method.isDefault ? (
                      <span className="default-badge">
                        {React.createElement(FaStar as any, { size: 16 })}
                        Default
                      </span>
                    ) : (
                      <button
                        className="set-default-btn"
                        onClick={() => handleSetDefault(method.id)}
                      >
                        Set as Default
                      </button>
                    )}
                    <button
                      className="delete-btn"
                      onClick={() => handleDelete(method.id)}
                      disabled={deletingId === method.id}
                    >
                      {deletingId === method.id ? (
                        'Removing...'
                      ) : (
                        React.createElement(FaTrash as any, { size: 16 })
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Add payment method form */}
      {showAddForm && (
        <Elements stripe={stripePromise}>
          <AddPaymentMethodForm
            onSuccess={handlePaymentMethodAdded}
            onCancel={() => setShowAddForm(false)}
          />
        </Elements>
      )}
    </div>
  );
};

export default PaymentMethodManager;