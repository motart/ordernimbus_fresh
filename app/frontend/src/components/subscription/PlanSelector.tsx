/**
 * Plan Selector Component
 * Displays available subscription plans for user selection
 * 
 * Security: Plan details are read-only from server
 * UX: Visual feedback with animations and clear pricing
 */

import React, { useState, useEffect } from 'react';
import { Check, X } from 'lucide-react';
import './PlanSelector.css';

interface Plan {
  id: string;
  name: string;
  description: string;
  price: {
    monthly: number;
    annual: number;
    currency: string;
  };
  features: string[];
  popular?: boolean;
  trial: {
    enabled: boolean;
    durationDays: number;
  };
}

interface PlanSelectorProps {
  selectedPlan?: string;
  onSelectPlan: (planId: string) => void;
  showTrial?: boolean;
  billingCycle?: 'monthly' | 'annual';
  onBillingCycleChange?: (cycle: 'monthly' | 'annual') => void;
}

const PlanSelector: React.FC<PlanSelectorProps> = ({
  selectedPlan = 'starter',
  onSelectPlan,
  showTrial = true,
  billingCycle = 'monthly',
  onBillingCycleChange
}) => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredPlan, setHoveredPlan] = useState<string | null>(null);

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const response = await fetch('/api/subscription/plans', {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setPlans(data.plans);
      }
    } catch (error) {
      console.error('Failed to fetch plans:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0
    }).format(price);
  };

  const calculateSavings = (plan: Plan) => {
    if (billingCycle === 'annual') {
      const monthlyCost = plan.price.monthly * 12;
      const annualCost = plan.price.annual;
      const savings = monthlyCost - annualCost;
      return savings > 0 ? Math.round((savings / monthlyCost) * 100) : 0;
    }
    return 0;
  };

  if (loading) {
    return (
      <div className="plan-selector-loading">
        <div className="spinner" />
        <p>Loading subscription plans...</p>
      </div>
    );
  }

  return (
    <div className="plan-selector">
      {/* Billing Cycle Toggle */}
      {onBillingCycleChange && (
        <div className="billing-cycle-toggle">
          <button
            className={billingCycle === 'monthly' ? 'active' : ''}
            onClick={() => onBillingCycleChange('monthly')}
          >
            Monthly
          </button>
          <button
            className={billingCycle === 'annual' ? 'active' : ''}
            onClick={() => onBillingCycleChange('annual')}
          >
            Annual
            <span className="save-badge">Save up to 20%</span>
          </button>
        </div>
      )}

      {/* Trial Banner */}
      {showTrial && (
        <div className="trial-banner">
          <span className="trial-icon">🎉</span>
          <span>All plans include a <strong>14-day free trial</strong>. No credit card required!</span>
        </div>
      )}

      {/* Plans Grid */}
      <div className="plans-grid">
        {plans.map((plan) => {
          const isSelected = selectedPlan === plan.id;
          const isHovered = hoveredPlan === plan.id;
          const savings = calculateSavings(plan);

          return (
            <div
              key={plan.id}
              className={`plan-card ${isSelected ? 'selected' : ''} ${plan.popular ? 'popular' : ''} ${isHovered ? 'hovered' : ''}`}
              onMouseEnter={() => setHoveredPlan(plan.id)}
              onMouseLeave={() => setHoveredPlan(null)}
              onClick={() => onSelectPlan(plan.id)}
            >
              {/* Popular Badge */}
              {plan.popular && (
                <div className="popular-badge">Most Popular</div>
              )}

              {/* Plan Header */}
              <div className="plan-header">
                <h3>{plan.name}</h3>
                <p className="plan-description">{plan.description}</p>
              </div>

              {/* Pricing */}
              <div className="plan-pricing">
                <div className="price-amount">
                  {formatPrice(billingCycle === 'monthly' ? plan.price.monthly : plan.price.annual / 12)}
                </div>
                <div className="price-period">
                  per month
                  {billingCycle === 'annual' && (
                    <span className="billed-annually">
                      Billed {formatPrice(plan.price.annual)} annually
                    </span>
                  )}
                </div>
                {savings > 0 && (
                  <div className="savings-badge">
                    Save {savings}%
                  </div>
                )}
              </div>

              {/* Features List */}
              <div className="plan-features">
                <ul>
                  {plan.features.map((feature, index) => (
                    <li key={index} className="feature-item">
                      <Check className="feature-icon" size={16} />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Select Button */}
              <button
                className={`select-plan-btn ${isSelected ? 'selected' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectPlan(plan.id);
                }}
              >
                {isSelected ? (
                  <>
                    <Check size={18} />
                    Selected
                  </>
                ) : (
                  'Select Plan'
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Feature Comparison Link */}
      <div className="comparison-link">
        <a href="#" onClick={(e) => {
          e.preventDefault();
          // TODO: Show detailed comparison modal
        }}>
          Compare all features →
        </a>
      </div>
    </div>
  );
};

export default PlanSelector;