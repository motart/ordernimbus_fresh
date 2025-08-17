/**
 * Unit Tests for Subscription Management
 * Tests subscription plans, trials, upgrades, and billing status
 * 
 * Coverage: subscription-manager.js
 */

const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

describe('Subscription Management Unit Tests', () => {
  let subscriptionManager;
  let dynamodbStub;
  let putStub, queryStub, updateStub, getStub;
  let AWSStub;
  
  beforeEach(() => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.SUBSCRIPTION_TABLE = 'test-subscriptions';
    process.env.MAIN_TABLE_NAME = 'test-main';
    process.env.AWS_REGION = 'us-west-1';
    
    // Setup default stubs with promise returns
    putStub = sinon.stub().returns({ promise: () => Promise.resolve({}) });
    queryStub = sinon.stub().returns({ promise: () => Promise.resolve({ Items: [] }) });
    updateStub = sinon.stub().returns({ promise: () => Promise.resolve({}) });
    getStub = sinon.stub().returns({ promise: () => Promise.resolve({ Item: null }) });
    
    // Create dynamodbStub for compatibility
    dynamodbStub = {
      put: putStub,
      query: queryStub,
      update: updateStub,
      get: getStub
    };
    
    // Create AWS stub with DynamoDB.DocumentClient
    AWSStub = {
      DynamoDB: {
        DocumentClient: sinon.stub().returns(dynamodbStub)
      }
    };
    
    // Use proxyquire to load the module with stubbed AWS SDK
    subscriptionManager = proxyquire('../../lambda/subscription-manager', {
      'aws-sdk': AWSStub
    });
  });
  
  afterEach(() => {
    sinon.restore();
    delete process.env.NODE_ENV;
    delete process.env.SUBSCRIPTION_TABLE;
    delete process.env.MAIN_TABLE_NAME;
    delete process.env.AWS_REGION;
  });
  
  describe('createSubscription', () => {
    it('should create a new subscription with 14-day trial', async () => {
      const userId = 'test-user-123';
      const planId = 'starter';
      
      const result = await subscriptionManager.createSubscription(userId, planId);
      
      expect(result).to.have.property('userId', userId);
      expect(result).to.have.property('planId', planId);
      expect(result).to.have.property('status', 'trialing');
      expect(result).to.have.property('trialStart');
      expect(result).to.have.property('trialEnd');
      expect(result).to.have.property('paymentMethodRequired', false);
      
      // Verify trial is 14 days
      const trialStart = new Date(result.trialStart);
      const trialEnd = new Date(result.trialEnd);
      const daysDiff = Math.ceil((trialEnd - trialStart) / (1000 * 60 * 60 * 24));
      expect(daysDiff).to.equal(14);
      
      // Verify DynamoDB put was called
      expect(putStub.calledOnce).to.be.true;
    });
    
    it('should reject invalid plan ID', async () => {
      const userId = 'test-user-123';
      const invalidPlanId = 'invalid-plan';
      
      try {
        await subscriptionManager.createSubscription(userId, invalidPlanId);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Invalid plan ID');
      }
    });
    
    it('should include metadata in subscription', async () => {
      const userId = 'test-user-123';
      const planId = 'professional';
      const options = {
        billingCycle: 'annual',
        source: 'upgrade',
        metadata: { referralCode: 'PROMO2024' }
      };
      
      const result = await subscriptionManager.createSubscription(userId, planId, options);
      
      expect(result.billingCycle).to.equal('annual');
      expect(result.metadata.source).to.equal('upgrade');
      expect(result.metadata.referralCode).to.equal('PROMO2024');
    });
  });
  
  describe('getSubscription', () => {
    it('should return subscription for user', async () => {
      const mockSubscription = {
        userId: 'test-user-123',
        planId: 'starter',
        status: 'trialing',
        trialEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      };
      
      queryStub.returns({ promise: () => Promise.resolve({ Items: [mockSubscription] }) });
      
      const result = await subscriptionManager.getSubscription('test-user-123');
      
      expect(result).to.deep.include(mockSubscription);
      expect(queryStub.calledOnce).to.be.true;
    });
    
    it('should mark expired trial as trial_expired', async () => {
      const mockSubscription = {
        userId: 'test-user-123',
        planId: 'starter',
        status: 'trialing',
        trialEnd: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // Expired yesterday
      };
      
      queryStub.returns({ promise: () => Promise.resolve({ Items: [mockSubscription] }) });
      
      const result = await subscriptionManager.getSubscription('test-user-123');
      
      expect(result.status).to.equal('trial_expired');
      expect(result.requiresPaymentMethod).to.be.true;
    });
    
    it('should return null if no subscription found', async () => {
      queryStub.returns({ promise: () => Promise.resolve({ Items: [] }) });
      
      const result = await subscriptionManager.getSubscription('test-user-123');
      
      expect(result).to.be.null;
    });
  });
  
  describe('updateSubscriptionPlan', () => {
    it('should update subscription plan', async () => {
      const mockSubscription = {
        userId: 'test-user-123',
        subscriptionId: 'sub_123',
        planId: 'starter',
        status: 'active'
      };
      
      queryStub.returns({ promise: () => Promise.resolve({ Items: [mockSubscription] }) });
      
      const result = await subscriptionManager.updateSubscriptionPlan(
        'test-user-123',
        'professional',
        { id: 'pm_123' }
      );
      
      expect(result.planId).to.equal('professional');
      expect(result.metadata.previousPlan).to.equal('starter');
      expect(result.metadata.changeReason).to.equal('upgrade');
      expect(updateStub.calledOnce).to.be.true;
    });
    
    it('should require payment for upgrade from trial', async () => {
      const mockSubscription = {
        userId: 'test-user-123',
        subscriptionId: 'sub_123',
        planId: 'starter',
        status: 'trial_expired'
      };
      
      queryStub.returns({ promise: () => Promise.resolve({ Items: [mockSubscription] }) });
      
      try {
        await subscriptionManager.updateSubscriptionPlan('test-user-123', 'professional');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Payment method required');
      }
    });
    
    it('should handle downgrade without payment', async () => {
      const mockSubscription = {
        userId: 'test-user-123',
        subscriptionId: 'sub_123',
        planId: 'professional',
        status: 'active'
      };
      
      queryStub.returns({ promise: () => Promise.resolve({ Items: [mockSubscription] }) });
      
      const result = await subscriptionManager.updateSubscriptionPlan(
        'test-user-123',
        'starter'
      );
      
      expect(result.metadata.changeReason).to.equal('downgrade');
    });
  });
  
  describe('cancelSubscription', () => {
    it('should cancel subscription with reason', async () => {
      const mockSubscription = {
        userId: 'test-user-123',
        subscriptionId: 'sub_123',
        planId: 'professional',
        status: 'active'
      };
      
      queryStub.returns({ promise: () => Promise.resolve({ Items: [mockSubscription] }) });
      
      const result = await subscriptionManager.cancelSubscription(
        'test-user-123',
        'Too expensive'
      );
      
      expect(result.status).to.equal('cancelled');
      expect(result.cancelReason).to.equal('Too expensive');
      expect(result).to.have.property('cancelledAt');
      expect(updateStub.calledOnce).to.be.true;
    });
    
    it('should throw error if no subscription found', async () => {
      queryStub.returns({ promise: () => Promise.resolve({ Items: [] }) });
      
      try {
        await subscriptionManager.cancelSubscription('test-user-123');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('No active subscription found');
      }
    });
  });
  
  describe('checkFeatureAccess', () => {
    it('should allow access for active subscription', async () => {
      const mockSubscription = {
        status: 'active',
        limits: {
          products: 1000,
          stores: 5,
          apiCalls: 10000
        }
      };
      
      queryStub.returns({ promise: () => Promise.resolve({ Items: [mockSubscription] }) });
      
      const hasAccess = await subscriptionManager.checkFeatureAccess(
        'test-user-123',
        'products'
      );
      
      expect(hasAccess).to.be.true;
    });
    
    it('should deny access for exceeded limits', async () => {
      const mockSubscription = {
        status: 'active',
        limits: {
          products: 0,
          stores: 5
        }
      };
      
      queryStub.returns({ promise: () => Promise.resolve({ Items: [mockSubscription] }) });
      
      const hasAccess = await subscriptionManager.checkFeatureAccess(
        'test-user-123',
        'products'
      );
      
      expect(hasAccess).to.be.false;
    });
    
    it('should deny access for cancelled subscription', async () => {
      const mockSubscription = {
        status: 'cancelled',
        limits: {
          products: 1000
        }
      };
      
      queryStub.returns({ promise: () => Promise.resolve({ Items: [mockSubscription] }) });
      
      const hasAccess = await subscriptionManager.checkFeatureAccess(
        'test-user-123',
        'products'
      );
      
      expect(hasAccess).to.be.false;
    });
  });
  
  describe('checkTrialAndPaymentStatus', () => {
    it('should identify trial ending soon (3 days)', async () => {
      const mockSubscription = {
        status: 'trialing',
        trialEnd: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString() // 2 days left
      };
      
      queryStub.returns({ promise: () => Promise.resolve({ Items: [mockSubscription] }) });
      
      getStub.returns({ promise: () => Promise.resolve({ Item: null }) }); // No payment method
      
      const status = await subscriptionManager.checkTrialAndPaymentStatus('test-user-123');
      
      expect(status.status).to.equal('trialing');
      expect(status.trialEnding).to.be.true;
      expect(status.daysRemaining).to.equal(2);
      expect(status.recommendAddPayment).to.be.true;
      expect(status.message).to.include('Add a payment method');
    });
    
    it('should mark expired trial without payment method', async () => {
      const mockSubscription = {
        status: 'trialing',
        trialEnd: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // Expired
      };
      
      queryStub.returns({ promise: () => Promise.resolve({ Items: [mockSubscription] }) });
      
      getStub.returns({ promise: () => Promise.resolve({ Item: null }) }); // No payment method
      
      const status = await subscriptionManager.checkTrialAndPaymentStatus('test-user-123');
      
      // Since getSubscription converts 'trialing' to 'trial_expired' when expired,
      // checkTrialAndPaymentStatus sees status as 'trial_expired' and returns that
      expect(status.status).to.equal('trial_expired');
      expect(status.requiresPaymentMethod).to.be.true;
      expect(status.message.toLowerCase()).to.include('trial');
      // Update is NOT called because the status is already 'trial_expired' (changed by getSubscription)
      expect(updateStub.called).to.be.false;
    });
    
    it('should handle expired trial with payment method', async () => {
      const mockSubscription = {
        status: 'trialing',
        trialEnd: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // Expired
      };
      
      queryStub.returns({ promise: () => Promise.resolve({ Items: [mockSubscription] }) });
      
      getStub.returns({ promise: () => Promise.resolve({ 
        Item: { defaultPaymentMethodId: 'pm_123' } // Has payment method
      }) });
      
      const status = await subscriptionManager.checkTrialAndPaymentStatus('test-user-123');
      
      // When trial expires, getSubscription converts it to trial_expired status
      // The checkTrialAndPaymentStatus returns trial_expired with payment method info
      expect(status.status).to.equal('trial_expired');
      expect(status.requiresPaymentMethod).to.be.false;
      expect(status.hasPaymentMethod).to.be.true;
      expect(status.message).to.include('Please confirm subscription to continue');
    });
  });
  
  describe('getUsageStats', () => {
    it('should return usage statistics with percentages', async () => {
      const mockSubscription = {
        limits: {
          products: 1000,
          stores: 5,
          apiCallsThisMonth: 10000,
          storageGB: 100
        }
      };
      
      queryStub.returns({ promise: () => Promise.resolve({ Items: [mockSubscription] }) });
      
      const stats = await subscriptionManager.getUsageStats('test-user-123');
      
      expect(stats).to.have.property('limits');
      expect(stats).to.have.property('usage');
      expect(stats).to.have.property('percentageUsed');
      expect(stats.limits.products).to.equal(1000);
    });
    
    it('should handle unlimited limits', async () => {
      const mockSubscription = {
        limits: {
          products: -1, // Unlimited
          stores: 5
        }
      };
      
      queryStub.returns({ promise: () => Promise.resolve({ Items: [mockSubscription] }) });
      
      const stats = await subscriptionManager.getUsageStats('test-user-123');
      
      expect(stats.percentageUsed.products).to.equal(0); // 0% for unlimited
    });
  });
  
  describe('getAvailablePlans', () => {
    it('should return all available plans', () => {
      const plans = subscriptionManager.getAvailablePlans();
      
      expect(plans).to.be.an('array');
      expect(plans.length).to.be.at.least(3); // starter, professional, enterprise
      
      const starterPlan = plans.find(p => p.id === 'starter');
      expect(starterPlan).to.exist;
      expect(starterPlan).to.have.property('name');
      expect(starterPlan).to.have.property('price');
      expect(starterPlan).to.have.property('features');
      expect(starterPlan).to.have.property('trial');
    });
  });
});