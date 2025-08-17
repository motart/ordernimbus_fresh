/**
 * Subscription Manager Component
 * Displays current subscription status and allows plan management
 * 
 * Security: All plan changes require authentication
 * UX: Clear trial status, usage limits, and upgrade prompts
 */

import React, { useState, useEffect } from 'react';
import { 
  FaCreditCard, 
  FaCalendar, 
  FaExclamationCircle, 
  FaCheckCircle, 
  FaArrowUp,
  FaBox,
  FaUsers,
  FaDatabase,
  FaChartLine
} from 'react-icons/fa';
import PlanSelector from './PlanSelector';
import './SubscriptionManager.css';
import toast from 'react-hot-toast';

interface Subscription {
  subscriptionId: string;
  planId: string;
  status: 'trialing' | 'active' | 'cancelled' | 'trial_expired';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialStart?: string;
  trialEnd?: string;
  billingCycle: 'monthly' | 'annual';
  paymentMethodRequired: boolean;
  limits: {
    products: number;
    stores: number;
    users: number;
    apiCallsPerMonth: number;
  };
  features: string[];
}

interface UsageStats {
  limits: Record<string, number>;
  usage: Record<string, number>;
  percentageUsed: Record<string, number>;
}

const SubscriptionManager: React.FC = () => {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPlanSelector, setShowPlanSelector] = useState(false);
  const [selectedNewPlan, setSelectedNewPlan] = useState<string>('');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

  useEffect(() => {
    fetchSubscription();
    fetchUsageStats();
  }, []);

  const fetchSubscription = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/subscription/current', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setSubscription(data.subscription);
        setBillingCycle(data.subscription?.billingCycle || 'monthly');
      }
    } catch (error) {
      console.error('Failed to fetch subscription:', error);
      toast.error('Failed to load subscription details');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsageStats = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/subscription/usage', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setUsage(data.usage);
      }
    } catch (error) {
      console.error('Failed to fetch usage stats:', error);
    }
  };

  const handleUpgradePlan = async () => {
    if (!selectedNewPlan) {
      toast.error('Please select a plan');
      return;
    }

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/subscription/update', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          planId: selectedNewPlan,
          billingCycle
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setSubscription(data.subscription);
        setShowPlanSelector(false);
        toast.success('Subscription updated successfully!');
        fetchUsageStats();
      } else {
        const error = await response.json();
        if (error.error?.includes('Payment method required')) {
          toast.error('Please add a payment method to upgrade your plan');
          // TODO: Open payment method modal
        } else {
          toast.error(error.error || 'Failed to update subscription');
        }
      }
    } catch (error) {
      console.error('Failed to update subscription:', error);
      toast.error('Failed to update subscription');
    }
  };

  const handleCancelSubscription = async () => {
    if (!window.confirm('Are you sure you want to cancel your subscription? You will retain access until the end of your current billing period.')) {
      return;
    }

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/subscription/cancel', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reason: 'User requested cancellation'
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setSubscription(data.subscription);
        toast.success('Subscription cancelled. You retain access until the end of your billing period.');
      } else {
        toast.error('Failed to cancel subscription');
      }
    } catch (error) {
      console.error('Failed to cancel subscription:', error);
      toast.error('Failed to cancel subscription');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getDaysRemaining = (endDate: string) => {
    const now = new Date();
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - now.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      trialing: { icon: <FaExclamationCircle size={16} />, text: 'Trial', class: 'trial' },
      active: { icon: <FaCheckCircle size={16} />, text: 'Active', class: 'active' },
      cancelled: { icon: <FaExclamationCircle size={16} />, text: 'Cancelled', class: 'cancelled' },
      trial_expired: { icon: <FaExclamationCircle size={16} />, text: 'Trial Expired', class: 'expired' }
    };
    
    const badge = badges[status as keyof typeof badges] || badges.active;
    
    return (
      <span className={`status-badge ${badge.class}`}>
        {badge.icon}
        {badge.text}
      </span>
    );
  };

  const getUsageIcon = (key: string) => {
    const icons: Record<string, JSX.Element> = {
      products: <FaBox size={16} />,
      stores: <FaDatabase size={16} />,
      users: <FaUsers size={16} />,
      apiCallsPerMonth: <FaChartLine size={16} />
    };
    return icons[key] || <FaDatabase size={16} />;
  };

  const getUsageLabel = (key: string) => {
    const labels: Record<string, string> = {
      products: 'Products',
      stores: 'Stores',
      users: 'Team Members',
      apiCallsPerMonth: 'API Calls'
    };
    return labels[key] || key;
  };

  if (loading) {
    return (
      <div className="subscription-loading">
        <div className="spinner" />
        <p>Loading subscription details...</p>
      </div>
    );
  }

  if (showPlanSelector) {
    return (
      <div className="subscription-manager">
        <div className="plan-selector-header">
          <button 
            className="back-button"
            onClick={() => setShowPlanSelector(false)}
          >
            ← Back to Subscription
          </button>
          <h2>Choose Your Plan</h2>
        </div>
        
        <PlanSelector
          selectedPlan={selectedNewPlan || subscription?.planId}
          onSelectPlan={setSelectedNewPlan}
          showTrial={false}
          billingCycle={billingCycle}
          onBillingCycleChange={setBillingCycle}
        />
        
        <div className="plan-selector-actions">
          <button 
            className="cancel-button"
            onClick={() => setShowPlanSelector(false)}
          >
            Cancel
          </button>
          <button 
            className="confirm-button"
            onClick={handleUpgradePlan}
            disabled={!selectedNewPlan || selectedNewPlan === subscription?.planId}
          >
            Confirm Plan Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="subscription-manager">
      <div className="subscription-header">
        <h2>Subscription & Billing</h2>
        {subscription?.paymentMethodRequired && (
          <div className="payment-alert">
            <FaExclamationCircle size={20} />
            <span>Payment method required to continue after trial</span>
            <button className="add-payment-btn">Add Payment Method</button>
          </div>
        )}
      </div>

      {subscription ? (
        <>
          {/* Current Plan Card */}
          <div className="current-plan-card">
            <div className="plan-info">
              <div className="plan-title">
                <h3>Current Plan: {subscription.planId.charAt(0).toUpperCase() + subscription.planId.slice(1)}</h3>
                {getStatusBadge(subscription.status)}
              </div>
              
              {/* Trial Information */}
              {subscription.status === 'trialing' && subscription.trialEnd && (
                <div className="trial-info">
                  <FaCalendar size={16} />
                  <span>Trial ends on {formatDate(subscription.trialEnd)}</span>
                  <span className="days-remaining">
                    ({getDaysRemaining(subscription.trialEnd)} days remaining)
                  </span>
                </div>
              )}
              
              {/* Billing Information */}
              {subscription.status === 'active' && (
                <div className="billing-info">
                  <FaCreditCard size={16} />
                  <span>Next billing date: {formatDate(subscription.currentPeriodEnd)}</span>
                  <span className="billing-cycle">
                    ({subscription.billingCycle})
                  </span>
                </div>
              )}
            </div>
            
            <div className="plan-actions">
              {subscription.status !== 'cancelled' && (
                <>
                  <button 
                    className="change-plan-btn"
                    onClick={() => setShowPlanSelector(true)}
                  >
                    <FaArrowUp size={16} />
                    Change Plan
                  </button>
                  <button 
                    className="cancel-subscription-btn"
                    onClick={handleCancelSubscription}
                  >
                    Cancel Subscription
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Usage Statistics */}
          {usage && (
            <div className="usage-stats">
              <h3>Usage & Limits</h3>
              <div className="usage-grid">
                {Object.keys(usage.usage).map((key) => {
                  const limit = usage.limits[key];
                  const current = usage.usage[key];
                  const percentage = usage.percentageUsed[key];
                  const isUnlimited = limit === -1;
                  
                  return (
                    <div key={key} className="usage-item">
                      <div className="usage-header">
                        {getUsageIcon(key)}
                        <span className="usage-label">{getUsageLabel(key)}</span>
                      </div>
                      <div className="usage-value">
                        <span className="current">{current.toLocaleString()}</span>
                        <span className="separator">/</span>
                        <span className="limit">
                          {isUnlimited ? '∞' : limit.toLocaleString()}
                        </span>
                      </div>
                      {!isUnlimited && (
                        <div className="usage-bar">
                          <div 
                            className={`usage-fill ${percentage > 80 ? 'warning' : ''}`}
                            style={{ width: `${Math.min(percentage, 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Plan Features */}
          <div className="plan-features-section">
            <h3>Included Features</h3>
            <div className="features-list">
              {subscription.features.map((feature, index) => (
                <div key={index} className="feature-item">
                  <FaCheckCircle size={16} className="feature-check" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="no-subscription">
          <FaExclamationCircle size={48} />
          <h3>No Active Subscription</h3>
          <p>Choose a plan to get started with OrderNimbus</p>
          <button 
            className="select-plan-btn"
            onClick={() => setShowPlanSelector(true)}
          >
            Select a Plan
          </button>
        </div>
      )}
    </div>
  );
};

export default SubscriptionManager;