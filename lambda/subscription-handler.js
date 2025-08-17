/**
 * Subscription API Handler
 * Manages subscription operations through API endpoints
 * 
 * Security: All endpoints require JWT authentication
 * Integration: Uses subscription-manager module for business logic
 */

const {
  createSubscription,
  getSubscription,
  updateSubscriptionPlan,
  cancelSubscription,
  checkFeatureAccess,
  getUsageStats,
  getAvailablePlans
} = require('./subscription-manager');

exports.handler = async (event) => {
  console.log('Subscription Event:', JSON.stringify(event));
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,userId',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Content-Type': 'application/json'
  };
  
  // Handle OPTIONS for CORS
  if (event.httpMethod === 'OPTIONS' || event.requestContext?.http?.method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }
  
  const path = event.path || event.rawPath || '/';
  const method = event.httpMethod || event.requestContext?.http?.method || 'GET';
  const body = event.body ? JSON.parse(event.body) : {};
  
  // Extract userId from authorizer context or headers
  const userId = event.requestContext?.authorizer?.userId || 
                 event.headers?.userId || 
                 event.headers?.['x-user-id'];
  
  // Extract action from path
  const pathParts = path.split('/').filter(p => p);
  const action = pathParts[pathParts.length - 1];
  
  try {
    let response;
    
    switch (action) {
      case 'plans':
        // GET /api/subscription/plans - Get available plans
        response = await handleGetPlans();
        break;
        
      case 'current':
        // GET /api/subscription/current - Get current subscription
        if (!userId) {
          return {
            statusCode: 401,
            headers: corsHeaders,
            body: JSON.stringify({
              success: false,
              error: 'Unauthorized: User ID required'
            })
          };
        }
        response = await handleGetSubscription(userId);
        break;
        
      case 'create':
        // POST /api/subscription/create - Create new subscription
        if (!userId) {
          return {
            statusCode: 401,
            headers: corsHeaders,
            body: JSON.stringify({
              success: false,
              error: 'Unauthorized: User ID required'
            })
          };
        }
        response = await handleCreateSubscription(userId, body);
        break;
        
      case 'update':
        // PUT /api/subscription/update - Update subscription plan
        if (!userId) {
          return {
            statusCode: 401,
            headers: corsHeaders,
            body: JSON.stringify({
              success: false,
              error: 'Unauthorized: User ID required'
            })
          };
        }
        response = await handleUpdateSubscription(userId, body);
        break;
        
      case 'cancel':
        // DELETE /api/subscription/cancel - Cancel subscription
        if (!userId) {
          return {
            statusCode: 401,
            headers: corsHeaders,
            body: JSON.stringify({
              success: false,
              error: 'Unauthorized: User ID required'
            })
          };
        }
        response = await handleCancelSubscription(userId, body);
        break;
        
      case 'usage':
        // GET /api/subscription/usage - Get usage stats
        if (!userId) {
          return {
            statusCode: 401,
            headers: corsHeaders,
            body: JSON.stringify({
              success: false,
              error: 'Unauthorized: User ID required'
            })
          };
        }
        response = await handleGetUsageStats(userId);
        break;
        
      case 'check-feature':
        // POST /api/subscription/check-feature - Check feature access
        if (!userId) {
          return {
            statusCode: 401,
            headers: corsHeaders,
            body: JSON.stringify({
              success: false,
              error: 'Unauthorized: User ID required'
            })
          };
        }
        response = await handleCheckFeatureAccess(userId, body);
        break;
        
      default:
        response = {
          statusCode: 200,
          body: {
            message: 'OrderNimbus Subscription API',
            endpoints: [
              'GET /api/subscription/plans',
              'GET /api/subscription/current',
              'POST /api/subscription/create',
              'PUT /api/subscription/update',
              'DELETE /api/subscription/cancel',
              'GET /api/subscription/usage',
              'POST /api/subscription/check-feature'
            ]
          }
        };
    }
    
    return {
      statusCode: response.statusCode || 200,
      headers: corsHeaders,
      body: JSON.stringify(response.body)
    };
    
  } catch (error) {
    console.error('Subscription handler error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};

async function handleGetPlans() {
  try {
    const plans = getAvailablePlans();
    return {
      statusCode: 200,
      body: {
        success: true,
        plans
      }
    };
  } catch (error) {
    console.error('Get plans error:', error);
    return {
      statusCode: 500,
      body: {
        success: false,
        error: 'Failed to retrieve plans'
      }
    };
  }
}

async function handleGetSubscription(userId) {
  try {
    const subscription = await getSubscription(userId);
    
    if (!subscription) {
      return {
        statusCode: 404,
        body: {
          success: false,
          error: 'No subscription found'
        }
      };
    }
    
    return {
      statusCode: 200,
      body: {
        success: true,
        subscription
      }
    };
  } catch (error) {
    console.error('Get subscription error:', error);
    return {
      statusCode: 500,
      body: {
        success: false,
        error: 'Failed to retrieve subscription'
      }
    };
  }
}

async function handleCreateSubscription(userId, body) {
  const { planId = 'starter', billingCycle = 'monthly', metadata = {} } = body;
  
  try {
    const subscription = await createSubscription(userId, planId, {
      billingCycle,
      metadata,
      source: 'api'
    });
    
    return {
      statusCode: 200,
      body: {
        success: true,
        subscription
      }
    };
  } catch (error) {
    console.error('Create subscription error:', error);
    return {
      statusCode: 400,
      body: {
        success: false,
        error: error.message || 'Failed to create subscription'
      }
    };
  }
}

async function handleUpdateSubscription(userId, body) {
  const { planId, paymentMethod } = body;
  
  if (!planId) {
    return {
      statusCode: 400,
      body: {
        success: false,
        error: 'Plan ID is required'
      }
    };
  }
  
  try {
    const subscription = await updateSubscriptionPlan(userId, planId, paymentMethod);
    
    return {
      statusCode: 200,
      body: {
        success: true,
        subscription
      }
    };
  } catch (error) {
    console.error('Update subscription error:', error);
    return {
      statusCode: 400,
      body: {
        success: false,
        error: error.message || 'Failed to update subscription'
      }
    };
  }
}

async function handleCancelSubscription(userId, body) {
  const { reason = '' } = body;
  
  try {
    const subscription = await cancelSubscription(userId, reason);
    
    return {
      statusCode: 200,
      body: {
        success: true,
        subscription,
        message: 'Subscription cancelled successfully'
      }
    };
  } catch (error) {
    console.error('Cancel subscription error:', error);
    return {
      statusCode: 400,
      body: {
        success: false,
        error: error.message || 'Failed to cancel subscription'
      }
    };
  }
}

async function handleGetUsageStats(userId) {
  try {
    const stats = await getUsageStats(userId);
    
    return {
      statusCode: 200,
      body: {
        success: true,
        usage: stats
      }
    };
  } catch (error) {
    console.error('Get usage stats error:', error);
    return {
      statusCode: 500,
      body: {
        success: false,
        error: 'Failed to retrieve usage statistics'
      }
    };
  }
}

async function handleCheckFeatureAccess(userId, body) {
  const { feature } = body;
  
  if (!feature) {
    return {
      statusCode: 400,
      body: {
        success: false,
        error: 'Feature name is required'
      }
    };
  }
  
  try {
    const hasAccess = await checkFeatureAccess(userId, feature);
    
    return {
      statusCode: 200,
      body: {
        success: true,
        hasAccess,
        feature
      }
    };
  } catch (error) {
    console.error('Check feature access error:', error);
    return {
      statusCode: 500,
      body: {
        success: false,
        error: 'Failed to check feature access'
      }
    };
  }
}