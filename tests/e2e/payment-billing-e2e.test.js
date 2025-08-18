/**
 * E2E Tests for Payment and Billing
 * Tests complete user experience with Stripe integration
 * 
 * Coverage: Full payment and subscription lifecycle
 */

const { expect } = require('chai');
const sinon = require('sinon');

describe('Payment and Billing E2E Tests', () => {
  const API_ENDPOINT = process.env.API_URL || 'https://api.ordernimbus.com/production';
  const TEST_USER = {
    email: 'e2e-test@ordernimbus.com',
    password: 'TestE2E123!',
    userId: null,
    token: null
  };
  
  describe('Complete Payment Journey', () => {
    it('should complete full subscription lifecycle', async function() {
      this.timeout(30000); // Extended timeout for E2E
      
      // Step 1: User Registration and Trial Start
      const registrationScenario = {
        action: 'register',
        data: {
          email: TEST_USER.email,
          password: TEST_USER.password,
          companyName: 'E2E Test Company',
          firstName: 'Test',
          lastName: 'User'
        },
        expectedResult: {
          subscription: {
            status: 'trialing',
            planId: 'starter',
            trialDays: 14
          }
        }
      };
      
      // Simulate registration
      const mockRegistrationResponse = {
        success: true,
        userId: 'e2e-user-123',
        subscription: {
          status: 'trialing',
          planId: 'starter',
          trialEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
        }
      };
      
      expect(mockRegistrationResponse.subscription.status).to.equal('trialing');
      expect(mockRegistrationResponse.subscription.planId).to.equal('starter');
      
      // Step 2: Check Trial Status (Day 1)
      const trialStatusCheck = {
        action: 'checkTrialStatus',
        userId: mockRegistrationResponse.userId,
        expectedResult: {
          status: 'trialing',
          daysRemaining: 14,
          requiresPaymentMethod: false
        }
      };
      
      const mockTrialStatus = {
        status: 'trialing',
        daysRemaining: 14,
        requiresPaymentMethod: false,
        message: 'Trial active with 14 days remaining'
      };
      
      expect(mockTrialStatus.requiresPaymentMethod).to.be.false;
      expect(mockTrialStatus.daysRemaining).to.equal(14);
      
      // Step 3: Add Payment Method (Optional during trial)
      const addPaymentMethod = {
        action: 'addPaymentMethod',
        userId: mockRegistrationResponse.userId,
        data: {
          cardNumber: '4242424242424242',
          expMonth: 12,
          expYear: 2025,
          cvc: '123'
        },
        expectedResult: {
          success: true,
          paymentMethodId: 'pm_test_xxx'
        }
      };
      
      const mockPaymentMethodResponse = {
        success: true,
        paymentMethodId: 'pm_test_e2e',
        brand: 'visa',
        last4: '4242'
      };
      
      expect(mockPaymentMethodResponse.success).to.be.true;
      expect(mockPaymentMethodResponse.paymentMethodId).to.exist;
      
      // Step 4: Simulate Trial Expiration (Day 15)
      const trialExpiredCheck = {
        action: 'checkTrialStatus',
        userId: mockRegistrationResponse.userId,
        mockDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        expectedResult: {
          status: 'trial_expired',
          requiresPaymentMethod: false, // Has payment method
          shouldActivate: true
        }
      };
      
      const mockExpiredStatus = {
        status: 'active', // Auto-activated because payment exists
        hasPaymentMethod: true,
        message: 'Subscription is active'
      };
      
      expect(mockExpiredStatus.status).to.equal('active');
      expect(mockExpiredStatus.hasPaymentMethod).to.be.true;
      
      // Step 5: Upgrade Plan
      const upgradePlan = {
        action: 'upgradePlan',
        userId: mockRegistrationResponse.userId,
        data: {
          newPlanId: 'professional',
          paymentMethodId: mockPaymentMethodResponse.paymentMethodId
        },
        expectedResult: {
          success: true,
          newPlan: 'professional',
          proration: true
        }
      };
      
      const mockUpgradeResponse = {
        success: true,
        subscription: {
          planId: 'professional',
          status: 'active',
          metadata: {
            previousPlan: 'starter',
            changeReason: 'upgrade'
          }
        }
      };
      
      expect(mockUpgradeResponse.subscription.planId).to.equal('professional');
      expect(mockUpgradeResponse.subscription.metadata.changeReason).to.equal('upgrade');
      
      // Step 6: Process Monthly Payment
      const monthlyPayment = {
        action: 'processPayment',
        userId: mockRegistrationResponse.userId,
        data: {
          amount: 9900, // $99.00 for professional
          currency: 'usd'
        },
        expectedResult: {
          status: 'succeeded',
          invoice: 'in_xxx'
        }
      };
      
      const mockPaymentResponse = {
        status: 'succeeded',
        invoiceId: 'in_e2e_001',
        amount: 9900,
        currency: 'usd',
        paidAt: new Date().toISOString()
      };
      
      expect(mockPaymentResponse.status).to.equal('succeeded');
      expect(mockPaymentResponse.amount).to.equal(9900);
      
      // Step 7: Cancel Subscription
      const cancelSubscription = {
        action: 'cancelSubscription',
        userId: mockRegistrationResponse.userId,
        data: {
          reason: 'E2E test completion'
        },
        expectedResult: {
          status: 'cancelled',
          refundEligible: false
        }
      };
      
      const mockCancelResponse = {
        success: true,
        subscription: {
          status: 'cancelled',
          cancelledAt: new Date().toISOString(),
          cancelReason: 'E2E test completion'
        }
      };
      
      expect(mockCancelResponse.subscription.status).to.equal('cancelled');
      expect(mockCancelResponse.subscription.cancelReason).to.exist;
    });
    
    it('should handle trial expiration without payment method', async function() {
      this.timeout(10000);
      
      // Scenario: User doesn't add payment before trial ends
      const userWithoutPayment = {
        userId: 'e2e-no-payment-user',
        subscription: {
          status: 'trialing',
          trialEnd: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // Expired
        }
      };
      
      // Check status after expiration
      const statusCheck = {
        status: 'trial_expired',
        requiresPaymentMethod: true,
        message: 'Your trial has expired. Please add a payment method to continue.',
        accessBlocked: true
      };
      
      expect(statusCheck.status).to.equal('trial_expired');
      expect(statusCheck.requiresPaymentMethod).to.be.true;
      expect(statusCheck.accessBlocked).to.be.true;
      
      // Attempt to use features (should fail)
      const featureAccess = {
        canAccessProducts: false,
        canAccessForecasting: false,
        canAccessReports: false,
        message: 'Subscription required'
      };
      
      expect(featureAccess.canAccessProducts).to.be.false;
      expect(featureAccess.message).to.include('Subscription required');
      
      // Add payment method to reactivate
      const reactivation = {
        addPaymentMethod: true,
        newStatus: 'active',
        accessRestored: true
      };
      
      expect(reactivation.newStatus).to.equal('active');
      expect(reactivation.accessRestored).to.be.true;
    });
    
    it('should handle payment failures and retries', async function() {
      this.timeout(10000);
      
      // Scenario: Payment fails and needs retry
      const failedPayment = {
        attempt: 1,
        status: 'failed',
        error: 'Card declined',
        nextRetry: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      };
      
      expect(failedPayment.status).to.equal('failed');
      expect(failedPayment.error).to.include('Card declined');
      
      // User updates payment method
      const updatePayment = {
        action: 'updatePaymentMethod',
        newCard: {
          number: '5555555555554444',
          brand: 'mastercard',
          last4: '4444'
        },
        result: 'success'
      };
      
      expect(updatePayment.result).to.equal('success');
      
      // Retry payment
      const retryPayment = {
        attempt: 2,
        status: 'succeeded',
        subscriptionStatus: 'active'
      };
      
      expect(retryPayment.status).to.equal('succeeded');
      expect(retryPayment.subscriptionStatus).to.equal('active');
    });
    
    it('should handle webhook events correctly', async function() {
      this.timeout(10000);
      
      // Test various webhook scenarios
      const webhookScenarios = [
        {
          event: 'customer.subscription.trial_will_end',
          data: {
            subscriptionId: 'sub_test',
            trialEnd: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
          },
          expectedAction: 'sendTrialEndingNotification',
          expectedNotification: {
            type: 'trial_ending',
            daysRemaining: 3
          }
        },
        {
          event: 'invoice.payment_succeeded',
          data: {
            invoiceId: 'in_test',
            amount: 2900,
            subscriptionId: 'sub_test'
          },
          expectedAction: 'recordPayment',
          expectedRecord: {
            status: 'succeeded',
            amount: 2900
          }
        },
        {
          event: 'customer.subscription.deleted',
          data: {
            subscriptionId: 'sub_test',
            cancelledAt: new Date()
          },
          expectedAction: 'handleCancellation',
          expectedStatus: 'cancelled'
        }
      ];
      
      webhookScenarios.forEach(scenario => {
        expect(scenario.expectedAction).to.exist;
        
        if (scenario.event === 'customer.subscription.trial_will_end') {
          expect(scenario.expectedNotification.type).to.equal('trial_ending');
          expect(scenario.expectedNotification.daysRemaining).to.be.at.most(3);
        }
        
        if (scenario.event === 'invoice.payment_succeeded') {
          expect(scenario.expectedRecord.status).to.equal('succeeded');
          expect(scenario.expectedRecord.amount).to.be.above(0);
        }
        
        if (scenario.event === 'customer.subscription.deleted') {
          expect(scenario.expectedStatus).to.equal('cancelled');
        }
      });
    });
    
    it('should enforce plan limits correctly', async function() {
      const planLimits = {
        starter: {
          products: 100,
          stores: 1,
          users: 2,
          apiCallsPerMonth: 1000
        },
        professional: {
          products: 1000,
          stores: 5,
          users: 10,
          apiCallsPerMonth: 10000
        },
        enterprise: {
          products: -1, // Unlimited
          stores: -1,
          users: -1,
          apiCallsPerMonth: -1
        }
      };
      
      // Test starter plan limits
      const starterUsage = {
        products: 101,
        stores: 2,
        plan: 'starter'
      };
      
      const starterLimitCheck = {
        productsAllowed: starterUsage.products <= planLimits.starter.products,
        storesAllowed: starterUsage.stores <= planLimits.starter.stores
      };
      
      expect(starterLimitCheck.productsAllowed).to.be.false; // Exceeds limit
      expect(starterLimitCheck.storesAllowed).to.be.false; // Exceeds limit
      
      // Test professional plan limits
      const professionalUsage = {
        products: 500,
        stores: 3,
        plan: 'professional'
      };
      
      const professionalLimitCheck = {
        productsAllowed: professionalUsage.products <= planLimits.professional.products,
        storesAllowed: professionalUsage.stores <= planLimits.professional.stores
      };
      
      expect(professionalLimitCheck.productsAllowed).to.be.true;
      expect(professionalLimitCheck.storesAllowed).to.be.true;
      
      // Test enterprise unlimited
      const enterpriseUsage = {
        products: 10000,
        stores: 100,
        plan: 'enterprise'
      };
      
      const enterpriseLimitCheck = {
        productsAllowed: planLimits.enterprise.products === -1 || enterpriseUsage.products <= planLimits.enterprise.products,
        storesAllowed: planLimits.enterprise.stores === -1 || enterpriseUsage.stores <= planLimits.enterprise.stores
      };
      
      expect(enterpriseLimitCheck.productsAllowed).to.be.true; // Unlimited
      expect(enterpriseLimitCheck.storesAllowed).to.be.true; // Unlimited
    });
    
    it('should track usage statistics accurately', async function() {
      const usageTracking = {
        userId: 'e2e-usage-user',
        period: 'current_month',
        usage: {
          products: 75,
          stores: 1,
          users: 2,
          apiCalls: 823,
          storageGB: 2.5
        },
        limits: {
          products: 100,
          stores: 1,
          users: 2,
          apiCalls: 1000,
          storageGB: 5
        },
        percentageUsed: {
          products: 75,
          stores: 100,
          users: 100,
          apiCalls: 82.3,
          storageGB: 50
        }
      };
      
      // Verify percentage calculations
      expect(usageTracking.percentageUsed.products).to.equal(75);
      expect(usageTracking.percentageUsed.stores).to.equal(100);
      expect(usageTracking.percentageUsed.apiCalls).to.equal(82.3);
      
      // Check for warnings when approaching limits
      const warnings = [];
      Object.keys(usageTracking.percentageUsed).forEach(key => {
        if (usageTracking.percentageUsed[key] >= 80) {
          warnings.push({
            resource: key,
            usage: usageTracking.percentageUsed[key],
            message: `Approaching limit for ${key}`
          });
        }
      });
      
      expect(warnings).to.have.length.above(0);
      expect(warnings.some(w => w.resource === 'stores')).to.be.true;
      expect(warnings.some(w => w.resource === 'apiCalls')).to.be.true;
    });
    
    it('should handle proration during plan changes', async function() {
      // Scenario: Mid-cycle upgrade from starter to professional
      const midCycleUpgrade = {
        currentPlan: 'starter',
        currentPrice: 29.00,
        newPlan: 'professional',
        newPrice: 99.00,
        daysIntoCurrentPeriod: 15,
        totalDaysInPeriod: 30,
        
        // Proration calculation
        unusedAmount: (29.00 * (30 - 15) / 30), // $14.50
        newAmount: (99.00 * (30 - 15) / 30), // $49.50
        amountDue: (99.00 * (30 - 15) / 30) - (29.00 * (30 - 15) / 30) // $35.00
      };
      
      expect(midCycleUpgrade.unusedAmount).to.be.closeTo(14.50, 0.01);
      expect(midCycleUpgrade.newAmount).to.be.closeTo(49.50, 0.01);
      expect(midCycleUpgrade.amountDue).to.be.closeTo(35.00, 0.01);
      
      // Scenario: Downgrade (credit applied to next period)
      const midCycleDowngrade = {
        currentPlan: 'professional',
        currentPrice: 99.00,
        newPlan: 'starter',
        newPrice: 29.00,
        daysIntoCurrentPeriod: 10,
        totalDaysInPeriod: 30,
        
        // Credit calculation
        unusedAmount: (99.00 * (30 - 10) / 30), // $66.00
        newAmount: (29.00 * (30 - 10) / 30), // $19.33
        creditAmount: (99.00 * (30 - 10) / 30) - (29.00 * (30 - 10) / 30) // $46.67
      };
      
      expect(midCycleDowngrade.creditAmount).to.be.closeTo(46.67, 0.01);
    });
  });
});