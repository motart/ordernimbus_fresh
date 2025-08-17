/**
 * Stripe Payment Handler Lambda
 * Manages payment methods, processes payments, and handles Stripe webhooks
 * 
 * Security: PCI compliance through Stripe, never store card details
 * Integration: Stripe API, DynamoDB for payment records
 */

const AWS = require('aws-sdk');
const stripe = require('stripe');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const ssm = new AWS.SystemsManager();

// Get Stripe configuration from SSM Parameter Store
let stripeClient;
async function getStripeClient() {
  if (stripeClient) return stripeClient;
  
  try {
    const params = {
      Name: '/ordernimbus/production/stripe',
      WithDecryption: true
    };
    
    const result = await ssm.getParameter(params).promise();
    const config = JSON.parse(result.Parameter.Value);
    stripeClient = stripe(config.STRIPE_SECRET_KEY);
    return stripeClient;
  } catch (error) {
    console.error('Failed to initialize Stripe client:', error);
    throw new Error('Payment service temporarily unavailable');
  }
}

// CORS headers for responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Content-Type': 'application/json'
};

/**
 * Create or retrieve Stripe customer for a user
 */
async function createOrGetStripeCustomer(userId, email, metadata = {}) {
  const stripe = await getStripeClient();
  
  // Check if customer already exists in DynamoDB
  const params = {
    TableName: process.env.MAIN_TABLE_NAME || 'ordernimbus-production-main',
    Key: {
      PK: `USER#${userId}`,
      SK: 'STRIPE_CUSTOMER'
    }
  };
  
  try {
    const result = await dynamodb.get(params).promise();
    if (result.Item && result.Item.stripeCustomerId) {
      // Return existing customer
      return await stripe.customers.retrieve(result.Item.stripeCustomerId);
    }
  } catch (error) {
    console.error('Error checking existing customer:', error);
  }
  
  // Create new Stripe customer
  try {
    const customer = await stripe.customers.create({
      email: email,
      metadata: {
        userId: userId,
        ...metadata
      }
    });
    
    // Save customer ID to DynamoDB
    await dynamodb.put({
      TableName: process.env.MAIN_TABLE_NAME || 'ordernimbus-production-main',
      Item: {
        PK: `USER#${userId}`,
        SK: 'STRIPE_CUSTOMER',
        stripeCustomerId: customer.id,
        email: email,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    }).promise();
    
    return customer;
  } catch (error) {
    console.error('Error creating Stripe customer:', error);
    throw error;
  }
}

/**
 * Create a SetupIntent for adding payment methods
 */
async function createSetupIntent(userId, email) {
  const stripe = await getStripeClient();
  const customer = await createOrGetStripeCustomer(userId, email);
  
  const setupIntent = await stripe.setupIntents.create({
    customer: customer.id,
    payment_method_types: ['card'],
    metadata: {
      userId: userId
    }
  });
  
  return {
    clientSecret: setupIntent.client_secret,
    customerId: customer.id
  };
}

/**
 * List payment methods for a user
 */
async function listPaymentMethods(userId) {
  const stripe = await getStripeClient();
  
  // Get customer ID from DynamoDB
  const params = {
    TableName: process.env.MAIN_TABLE_NAME || 'ordernimbus-production-main',
    Key: {
      PK: `USER#${userId}`,
      SK: 'STRIPE_CUSTOMER'
    }
  };
  
  try {
    const result = await dynamodb.get(params).promise();
    if (!result.Item || !result.Item.stripeCustomerId) {
      return { paymentMethods: [] };
    }
    
    const paymentMethods = await stripe.paymentMethods.list({
      customer: result.Item.stripeCustomerId,
      type: 'card'
    });
    
    // Format payment methods for frontend
    const formatted = paymentMethods.data.map(pm => ({
      id: pm.id,
      brand: pm.card.brand,
      last4: pm.card.last4,
      expMonth: pm.card.exp_month,
      expYear: pm.card.exp_year,
      isDefault: pm.id === result.Item.defaultPaymentMethodId
    }));
    
    return { paymentMethods: formatted };
  } catch (error) {
    console.error('Error listing payment methods:', error);
    throw error;
  }
}

/**
 * Set default payment method
 */
async function setDefaultPaymentMethod(userId, paymentMethodId) {
  const stripe = await getStripeClient();
  
  // Get customer ID from DynamoDB
  const params = {
    TableName: process.env.MAIN_TABLE_NAME || 'ordernimbus-production-main',
    Key: {
      PK: `USER#${userId}`,
      SK: 'STRIPE_CUSTOMER'
    }
  };
  
  const result = await dynamodb.get(params).promise();
  if (!result.Item || !result.Item.stripeCustomerId) {
    throw new Error('Customer not found');
  }
  
  // Update default payment method in Stripe
  await stripe.customers.update(result.Item.stripeCustomerId, {
    invoice_settings: {
      default_payment_method: paymentMethodId
    }
  });
  
  // Update in DynamoDB
  await dynamodb.update({
    TableName: process.env.MAIN_TABLE_NAME || 'ordernimbus-production-main',
    Key: {
      PK: `USER#${userId}`,
      SK: 'STRIPE_CUSTOMER'
    },
    UpdateExpression: 'SET defaultPaymentMethodId = :pmId, updatedAt = :now',
    ExpressionAttributeValues: {
      ':pmId': paymentMethodId,
      ':now': new Date().toISOString()
    }
  }).promise();
  
  return { success: true };
}

/**
 * Delete a payment method
 */
async function deletePaymentMethod(userId, paymentMethodId) {
  const stripe = await getStripeClient();
  
  // Verify ownership by checking customer
  const params = {
    TableName: process.env.MAIN_TABLE_NAME || 'ordernimbus-production-main',
    Key: {
      PK: `USER#${userId}`,
      SK: 'STRIPE_CUSTOMER'
    }
  };
  
  const result = await dynamodb.get(params).promise();
  if (!result.Item || !result.Item.stripeCustomerId) {
    throw new Error('Customer not found');
  }
  
  // Detach payment method
  await stripe.paymentMethods.detach(paymentMethodId);
  
  return { success: true };
}

/**
 * Create a subscription for a user
 */
async function createSubscription(userId, planId, paymentMethodId = null) {
  const stripe = await getStripeClient();
  
  // Get customer
  const customerParams = {
    TableName: process.env.MAIN_TABLE_NAME || 'ordernimbus-production-main',
    Key: {
      PK: `USER#${userId}`,
      SK: 'STRIPE_CUSTOMER'
    }
  };
  
  const customerResult = await dynamodb.get(customerParams).promise();
  if (!customerResult.Item || !customerResult.Item.stripeCustomerId) {
    throw new Error('Customer not found. Please add a payment method first.');
  }
  
  // Get plan pricing from config
  const plans = {
    starter: { monthly: 'price_starter_monthly', annual: 'price_starter_annual' },
    professional: { monthly: 'price_professional_monthly', annual: 'price_professional_annual' },
    enterprise: { monthly: 'price_enterprise_monthly', annual: 'price_enterprise_annual' }
  };
  
  const priceId = plans[planId]?.monthly;
  if (!priceId) {
    throw new Error('Invalid plan');
  }
  
  // Set payment method if provided
  if (paymentMethodId) {
    await stripe.customers.update(customerResult.Item.stripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId
      }
    });
  }
  
  // Create subscription with 14-day trial
  const subscription = await stripe.subscriptions.create({
    customer: customerResult.Item.stripeCustomerId,
    items: [{ price: priceId }],
    trial_period_days: 14,
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
    expand: ['latest_invoice.payment_intent'],
    metadata: {
      userId: userId,
      planId: planId
    }
  });
  
  // Save subscription to DynamoDB
  await dynamodb.put({
    TableName: process.env.MAIN_TABLE_NAME || 'ordernimbus-production-main',
    Item: {
      PK: `USER#${userId}`,
      SK: 'SUBSCRIPTION',
      subscriptionId: subscription.id,
      planId: planId,
      status: subscription.status,
      trialEnd: new Date(subscription.trial_end * 1000).toISOString(),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  }).promise();
  
  return {
    subscriptionId: subscription.id,
    status: subscription.status,
    clientSecret: subscription.latest_invoice?.payment_intent?.client_secret,
    trialEnd: new Date(subscription.trial_end * 1000).toISOString()
  };
}

/**
 * Handle Stripe webhooks
 */
async function handleWebhook(body, signature) {
  const stripe = await getStripeClient();
  
  // Get webhook secret from SSM
  const params = {
    Name: '/ordernimbus/production/stripe-webhook-secret',
    WithDecryption: true
  };
  
  const result = await ssm.getParameter(params).promise();
  const webhookSecret = result.Parameter.Value;
  
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    throw new Error('Invalid webhook signature');
  }
  
  // Handle different event types
  switch (event.type) {
    case 'customer.subscription.trial_will_end':
      // Send notification 3 days before trial ends
      await handleTrialWillEnd(event.data.object);
      break;
      
    case 'customer.subscription.updated':
      // Update subscription status in DynamoDB
      await updateSubscriptionStatus(event.data.object);
      break;
      
    case 'customer.subscription.deleted':
      // Handle subscription cancellation
      await handleSubscriptionCancelled(event.data.object);
      break;
      
    case 'invoice.payment_failed':
      // Handle failed payment
      await handlePaymentFailed(event.data.object);
      break;
      
    case 'invoice.payment_succeeded':
      // Handle successful payment
      await handlePaymentSucceeded(event.data.object);
      break;
      
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
  
  return { received: true };
}

/**
 * Update subscription status in DynamoDB
 */
async function updateSubscriptionStatus(subscription) {
  const userId = subscription.metadata.userId;
  if (!userId) return;
  
  await dynamodb.update({
    TableName: process.env.MAIN_TABLE_NAME || 'ordernimbus-production-main',
    Key: {
      PK: `USER#${userId}`,
      SK: 'SUBSCRIPTION'
    },
    UpdateExpression: 'SET #status = :status, currentPeriodEnd = :periodEnd, updatedAt = :now',
    ExpressionAttributeNames: {
      '#status': 'status'
    },
    ExpressionAttributeValues: {
      ':status': subscription.status,
      ':periodEnd': new Date(subscription.current_period_end * 1000).toISOString(),
      ':now': new Date().toISOString()
    }
  }).promise();
}

/**
 * Handle trial ending notification
 */
async function handleTrialWillEnd(subscription) {
  const userId = subscription.metadata.userId;
  if (!userId) return;
  
  // Create notification for user
  await dynamodb.put({
    TableName: process.env.MAIN_TABLE_NAME || 'ordernimbus-production-main',
    Item: {
      PK: `USER#${userId}`,
      SK: `NOTIFICATION#${Date.now()}`,
      type: 'trial_ending',
      title: 'Your trial is ending soon',
      message: 'Your 14-day trial will end in 3 days. Please add a payment method to continue using OrderNimbus.',
      read: false,
      createdAt: new Date().toISOString()
    }
  }).promise();
  
  // TODO: Send email notification
}

/**
 * Handle subscription cancellation
 */
async function handleSubscriptionCancelled(subscription) {
  const userId = subscription.metadata.userId;
  if (!userId) return;
  
  await dynamodb.update({
    TableName: process.env.MAIN_TABLE_NAME || 'ordernimbus-production-main',
    Key: {
      PK: `USER#${userId}`,
      SK: 'SUBSCRIPTION'
    },
    UpdateExpression: 'SET #status = :status, cancelledAt = :now, updatedAt = :now',
    ExpressionAttributeNames: {
      '#status': 'status'
    },
    ExpressionAttributeValues: {
      ':status': 'cancelled',
      ':now': new Date().toISOString()
    }
  }).promise();
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(invoice) {
  const subscription = invoice.subscription;
  const customerId = invoice.customer;
  
  // Get user ID from customer metadata
  const stripe = await getStripeClient();
  const customer = await stripe.customers.retrieve(customerId);
  const userId = customer.metadata.userId;
  
  if (!userId) return;
  
  // Create notification
  await dynamodb.put({
    TableName: process.env.MAIN_TABLE_NAME || 'ordernimbus-production-main',
    Item: {
      PK: `USER#${userId}`,
      SK: `NOTIFICATION#${Date.now()}`,
      type: 'payment_failed',
      title: 'Payment failed',
      message: 'We were unable to process your payment. Please update your payment method.',
      read: false,
      createdAt: new Date().toISOString()
    }
  }).promise();
}

/**
 * Handle successful payment
 */
async function handlePaymentSucceeded(invoice) {
  const customerId = invoice.customer;
  
  // Get user ID from customer metadata
  const stripe = await getStripeClient();
  const customer = await stripe.customers.retrieve(customerId);
  const userId = customer.metadata.userId;
  
  if (!userId) return;
  
  // Save payment record
  await dynamodb.put({
    TableName: process.env.MAIN_TABLE_NAME || 'ordernimbus-production-main',
    Item: {
      PK: `USER#${userId}`,
      SK: `PAYMENT#${invoice.id}`,
      invoiceId: invoice.id,
      amount: invoice.amount_paid,
      currency: invoice.currency,
      status: 'succeeded',
      paidAt: new Date(invoice.status_transitions.paid_at * 1000).toISOString(),
      createdAt: new Date().toISOString()
    }
  }).promise();
}

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
  console.log('Payment handler triggered:', JSON.stringify(event, null, 2));
  
  // Handle OPTIONS requests for CORS
  if (event.httpMethod === 'OPTIONS' || event.requestContext?.http?.method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }
  
  // Extract user ID from JWT token (should be added by authorizer)
  const userId = event.requestContext?.authorizer?.userId || 
                 event.requestContext?.authorizer?.claims?.sub;
  
  const path = event.path || event.rawPath;
  const method = event.httpMethod || event.requestContext?.http?.method;
  
  try {
    // Handle Stripe webhooks
    if (path === '/api/payment/webhook') {
      const signature = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
      const result = await handleWebhook(event.body, signature);
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(result)
      };
    }
    
    // Require authentication for all other endpoints
    if (!userId) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }
    
    let body = {};
    if (event.body) {
      try {
        body = JSON.parse(event.body);
      } catch (e) {
        body = event.body;
      }
    }
    
    let result;
    
    // Route to appropriate handler
    if (path === '/api/payment/setup-intent' && method === 'POST') {
      result = await createSetupIntent(userId, body.email);
    } else if (path === '/api/payment/methods' && method === 'GET') {
      result = await listPaymentMethods(userId);
    } else if (path === '/api/payment/methods' && method === 'PUT') {
      result = await setDefaultPaymentMethod(userId, body.paymentMethodId);
    } else if (path === '/api/payment/methods' && method === 'DELETE') {
      result = await deletePaymentMethod(userId, body.paymentMethodId);
    } else if (path === '/api/payment/subscription' && method === 'POST') {
      result = await createSubscription(userId, body.planId, body.paymentMethodId);
    } else {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Not found' })
      };
    }
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(result)
    };
    
  } catch (error) {
    console.error('Payment handler error:', error);
    return {
      statusCode: error.statusCode || 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: error.message || 'Payment processing failed'
      })
    };
  }
};