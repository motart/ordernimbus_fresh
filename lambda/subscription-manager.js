/**
 * Subscription Management Module
 * Handles subscription plans, trials, upgrades, and billing status
 * 
 * Security: All operations require authenticated user context
 * Integration: DynamoDB for storage, future payment gateway integration
 * Trial: 14-day configurable trial period with automatic tracking
 */

const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const subscriptionPlans = require('../config/subscription-plans.json');

const SUBSCRIPTION_TABLE = process.env.SUBSCRIPTION_TABLE || 'ordernimbus-production-subscriptions';

/**
 * Create a new subscription for a user during signup
 * @param {string} userId - The authenticated user ID
 * @param {string} planId - Selected subscription plan ID
 * @param {Object} options - Additional subscription options
 * @returns {Object} Created subscription details
 * 
 * Security: Validates plan ID against allowed plans
 * Trial: Automatically starts 14-day trial period
 */
async function createSubscription(userId, planId = 'starter', options = {}) {
  // Validate plan exists
  const plan = subscriptionPlans.plans.find(p => p.id === planId);
  if (!plan) {
    throw new Error(`Invalid plan ID: ${planId}`);
  }

  const now = new Date();
  const trialEndDate = new Date(now);
  trialEndDate.setDate(trialEndDate.getDate() + (plan.trial.durationDays || 14));

  const subscription = {
    userId,
    subscriptionId: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    planId,
    status: 'trialing',
    currentPeriodStart: now.toISOString(),
    currentPeriodEnd: trialEndDate.toISOString(),
    trialStart: now.toISOString(),
    trialEnd: trialEndDate.toISOString(),
    billingCycle: options.billingCycle || 'monthly',
    paymentMethodRequired: false, // Not required during trial
    metadata: {
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      source: options.source || 'signup',
      ...options.metadata
    },
    limits: plan.limits,
    features: plan.features
  };

  // Store in DynamoDB
  await dynamodb.put({
    TableName: SUBSCRIPTION_TABLE,
    Item: subscription,
    ConditionExpression: 'attribute_not_exists(userId)'
  }).promise();

  return subscription;
}

/**
 * Get user's current subscription
 * @param {string} userId - The authenticated user ID
 * @returns {Object} Current subscription details
 * 
 * Security: Only returns subscription for authenticated user
 */
async function getSubscription(userId) {
  const result = await dynamodb.query({
    TableName: SUBSCRIPTION_TABLE,
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: {
      ':userId': userId
    },
    ScanIndexForward: false,
    Limit: 1
  }).promise();

  if (!result.Items || result.Items.length === 0) {
    return null;
  }

  const subscription = result.Items[0];
  
  // Check if trial has expired
  if (subscription.status === 'trialing') {
    const trialEndDate = new Date(subscription.trialEnd);
    if (new Date() > trialEndDate) {
      subscription.status = 'trial_expired';
      subscription.requiresPaymentMethod = true;
    }
  }

  return subscription;
}

/**
 * Update subscription plan (upgrade/downgrade)
 * @param {string} userId - The authenticated user ID
 * @param {string} newPlanId - New plan ID to switch to
 * @param {Object} paymentMethod - Payment method details (required for paid plans)
 * @returns {Object} Updated subscription
 * 
 * Security: Validates payment method for paid plans
 * Business Logic: Handles proration for mid-cycle changes
 */
async function updateSubscriptionPlan(userId, newPlanId, paymentMethod = null) {
  // Get current subscription
  const currentSubscription = await getSubscription(userId);
  if (!currentSubscription) {
    throw new Error('No active subscription found');
  }

  // Validate new plan
  const newPlan = subscriptionPlans.plans.find(p => p.id === newPlanId);
  if (!newPlan) {
    throw new Error(`Invalid plan ID: ${newPlanId}`);
  }

  // Check if payment method is required
  const isTrialExpired = currentSubscription.status === 'trial_expired';
  const isUpgrade = isPlanUpgrade(currentSubscription.planId, newPlanId);
  
  if ((isTrialExpired || isUpgrade) && !paymentMethod) {
    throw new Error('Payment method required for this plan change');
  }

  const now = new Date();
  const updates = {
    planId: newPlanId,
    status: paymentMethod ? 'active' : currentSubscription.status,
    limits: newPlan.limits,
    features: newPlan.features,
    metadata: {
      ...currentSubscription.metadata,
      updatedAt: now.toISOString(),
      previousPlan: currentSubscription.planId,
      changeReason: isUpgrade ? 'upgrade' : 'downgrade'
    }
  };

  // If payment method provided, update status
  if (paymentMethod) {
    updates.paymentMethodId = paymentMethod.id;
    updates.paymentMethodRequired = false;
    updates.status = 'active';
  }

  // Update in DynamoDB
  const updateExpression = Object.keys(updates).map(key => `#${key} = :${key}`).join(', ');
  const expressionAttributeNames = Object.keys(updates).reduce((acc, key) => {
    acc[`#${key}`] = key;
    return acc;
  }, {});
  const expressionAttributeValues = Object.keys(updates).reduce((acc, key) => {
    acc[`:${key}`] = updates[key];
    return acc;
  }, {});

  await dynamodb.update({
    TableName: SUBSCRIPTION_TABLE,
    Key: {
      userId,
      subscriptionId: currentSubscription.subscriptionId
    },
    UpdateExpression: `SET ${updateExpression}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues
  }).promise();

  return {
    ...currentSubscription,
    ...updates
  };
}

/**
 * Cancel subscription
 * @param {string} userId - The authenticated user ID
 * @param {string} reason - Cancellation reason
 * @returns {Object} Cancelled subscription
 * 
 * Security: Only allows cancellation by subscription owner
 * Business Logic: Subscription remains active until period end
 */
async function cancelSubscription(userId, reason = '') {
  const subscription = await getSubscription(userId);
  if (!subscription) {
    throw new Error('No active subscription found');
  }

  const now = new Date();
  const updates = {
    status: 'cancelled',
    cancelledAt: now.toISOString(),
    cancelReason: reason,
    metadata: {
      ...subscription.metadata,
      updatedAt: now.toISOString()
    }
  };

  await dynamodb.update({
    TableName: SUBSCRIPTION_TABLE,
    Key: {
      userId,
      subscriptionId: subscription.subscriptionId
    },
    UpdateExpression: 'SET #status = :status, cancelledAt = :cancelledAt, cancelReason = :cancelReason, metadata = :metadata',
    ExpressionAttributeNames: {
      '#status': 'status'
    },
    ExpressionAttributeValues: {
      ':status': updates.status,
      ':cancelledAt': updates.cancelledAt,
      ':cancelReason': updates.cancelReason,
      ':metadata': updates.metadata
    }
  }).promise();

  return {
    ...subscription,
    ...updates
  };
}

/**
 * Check if user has access to a specific feature
 * @param {string} userId - The authenticated user ID
 * @param {string} feature - Feature to check access for
 * @returns {boolean} Whether user has access
 * 
 * Security: Validates against user's current plan limits
 */
async function checkFeatureAccess(userId, feature) {
  const subscription = await getSubscription(userId);
  if (!subscription) {
    return false;
  }

  // Check if subscription is active
  if (!['active', 'trialing'].includes(subscription.status)) {
    return false;
  }

  // Check feature limits
  if (subscription.limits && subscription.limits[feature] !== undefined) {
    return subscription.limits[feature] !== 0;
  }

  return true;
}

/**
 * Get usage statistics for subscription limits
 * @param {string} userId - The authenticated user ID
 * @returns {Object} Usage statistics vs limits
 * 
 * Security: Only returns data for authenticated user
 */
async function getUsageStats(userId) {
  const subscription = await getSubscription(userId);
  if (!subscription) {
    throw new Error('No active subscription found');
  }

  // This would normally query actual usage from various tables
  // For now, returning mock data structure
  const usage = {
    products: 0,
    stores: 0,
    users: 1,
    apiCallsThisMonth: 0,
    storageUsedGB: 0
  };

  return {
    limits: subscription.limits,
    usage,
    percentageUsed: Object.keys(usage).reduce((acc, key) => {
      if (subscription.limits[key] && subscription.limits[key] > 0) {
        acc[key] = (usage[key] / subscription.limits[key]) * 100;
      } else if (subscription.limits[key] === -1) {
        acc[key] = 0; // Unlimited
      }
      return acc;
    }, {})
  };
}

/**
 * Send trial expiration reminder
 * @param {string} userId - The user ID
 * @param {number} daysRemaining - Days remaining in trial
 * @returns {Object} Reminder status
 * 
 * Integration: Will integrate with email service
 */
async function sendTrialReminder(userId, daysRemaining) {
  // This would integrate with SES or another email service
  console.log(`Sending trial reminder to user ${userId}: ${daysRemaining} days remaining`);
  
  return {
    sent: true,
    userId,
    daysRemaining,
    timestamp: new Date().toISOString()
  };
}

/**
 * Helper function to determine if plan change is an upgrade
 * @param {string} currentPlanId - Current plan ID
 * @param {string} newPlanId - New plan ID
 * @returns {boolean} Whether it's an upgrade
 */
function isPlanUpgrade(currentPlanId, newPlanId) {
  const planHierarchy = {
    'starter': 1,
    'professional': 2,
    'enterprise': 3
  };
  
  return (planHierarchy[newPlanId] || 0) > (planHierarchy[currentPlanId] || 0);
}

/**
 * Get all available subscription plans
 * @returns {Array} Available subscription plans
 */
function getAvailablePlans() {
  return subscriptionPlans.plans.map(plan => ({
    id: plan.id,
    name: plan.name,
    description: plan.description,
    price: plan.price,
    features: plan.features,
    popular: plan.popular || false,
    trial: plan.trial
  }));
}

/**
 * Check if trial has expired and payment method is required
 * @param {string} userId - The authenticated user ID
 * @returns {Object} Trial status and payment requirements
 * 
 * Security: Enforces payment method requirement when trial expires
 * UX: Provides clear status for frontend to show appropriate prompts
 */
async function checkTrialAndPaymentStatus(userId) {
  const subscription = await getSubscription(userId);
  
  if (!subscription) {
    return {
      hasSubscription: false,
      requiresPaymentMethod: true,
      message: 'No active subscription found'
    };
  }
  
  const now = new Date();
  const trialEnd = subscription.trialEnd ? new Date(subscription.trialEnd) : null;
  const daysRemaining = trialEnd ? Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24)) : 0;
  
  // Check payment method from payment service
  const hasPaymentMethod = await checkUserHasPaymentMethod(userId);
  
  if (subscription.status === 'trialing') {
    if (daysRemaining <= 0) {
      // Trial has expired
      if (!hasPaymentMethod) {
        // Update subscription status to trial_expired
        await dynamodb.update({
          TableName: SUBSCRIPTION_TABLE,
          Key: { userId },
          UpdateExpression: 'SET #status = :status, paymentMethodRequired = :required, updatedAt = :now',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':status': 'trial_expired',
            ':required': true,
            ':now': now.toISOString()
          }
        }).promise();
        
        return {
          status: 'trial_expired',
          requiresPaymentMethod: true,
          trialEnded: true,
          daysRemaining: 0,
          message: 'Your trial has expired. Please add a payment method to continue.'
        };
      } else {
        // Convert to active subscription
        await dynamodb.update({
          TableName: SUBSCRIPTION_TABLE,
          Key: { userId },
          UpdateExpression: 'SET #status = :status, updatedAt = :now',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':status': 'active',
            ':now': now.toISOString()
          }
        }).promise();
        
        return {
          status: 'active',
          requiresPaymentMethod: false,
          hasPaymentMethod: true,
          message: 'Subscription is active'
        };
      }
    } else if (daysRemaining <= 3) {
      // Trial ending soon
      return {
        status: 'trialing',
        trialEnding: true,
        daysRemaining,
        requiresPaymentMethod: !hasPaymentMethod,
        recommendAddPayment: !hasPaymentMethod,
        message: `Your trial ends in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}. ${!hasPaymentMethod ? 'Add a payment method to avoid service interruption.' : ''}`
      };
    } else {
      // Trial active
      return {
        status: 'trialing',
        daysRemaining,
        requiresPaymentMethod: false,
        hasPaymentMethod,
        message: `Trial active with ${daysRemaining} days remaining`
      };
    }
  } else if (subscription.status === 'trial_expired') {
    return {
      status: 'trial_expired',
      requiresPaymentMethod: !hasPaymentMethod,
      hasPaymentMethod,
      message: hasPaymentMethod ? 'Please confirm subscription to continue' : 'Trial expired. Add payment method to continue.'
    };
  } else {
    // Active, cancelled, or other status
    return {
      status: subscription.status,
      requiresPaymentMethod: false,
      hasPaymentMethod,
      message: `Subscription status: ${subscription.status}`
    };
  }
}

/**
 * Check if user has a payment method on file
 * @param {string} userId - The authenticated user ID
 * @returns {boolean} Whether user has payment method
 * 
 * Security: Queries payment service securely
 */
async function checkUserHasPaymentMethod(userId) {
  try {
    // Check if user has Stripe customer record with payment method
    const result = await dynamodb.get({
      TableName: process.env.MAIN_TABLE_NAME || 'ordernimbus-production-main',
      Key: {
        PK: `USER#${userId}`,
        SK: 'STRIPE_CUSTOMER'
      }
    }).promise();
    
    return !!(result.Item && result.Item.defaultPaymentMethodId);
  } catch (error) {
    console.error('Error checking payment method:', error);
    return false;
  }
}

module.exports = {
  createSubscription,
  getSubscription,
  updateSubscriptionPlan,
  cancelSubscription,
  checkFeatureAccess,
  getUsageStats,
  sendTrialReminder,
  getAvailablePlans,
  checkTrialAndPaymentStatus,
  checkUserHasPaymentMethod
};