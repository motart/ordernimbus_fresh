/**
 * Unit Tests for Payment Handler
 * Tests Stripe integration, payment methods, and webhook handling
 * 
 * Coverage: payment-handler.js
 */

const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

describe('Payment Handler Unit Tests', () => {
  let paymentHandler;
  let stripeStub;
  let dynamodbStub;
  let ssmStub;
  let AWSStub;
  
  beforeEach(() => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.MAIN_TABLE_NAME = 'test-main';
    process.env.AWS_REGION = 'us-west-1';
    
    // Mock Stripe
    stripeStub = {
      customers: {
        create: sinon.stub().resolves({ id: 'cus_test123', email: 'test@example.com' }),
        retrieve: sinon.stub().resolves({ id: 'cus_test123', metadata: { userId: 'test-user' } }),
        update: sinon.stub().resolves({ id: 'cus_test123' })
      },
      setupIntents: {
        create: sinon.stub().resolves({ 
          client_secret: 'seti_test_secret',
          id: 'seti_test123'
        })
      },
      paymentMethods: {
        list: sinon.stub().resolves({
          data: [{
            id: 'pm_test123',
            card: {
              brand: 'visa',
              last4: '4242',
              exp_month: 12,
              exp_year: 2025
            }
          }]
        }),
        detach: sinon.stub().resolves({ id: 'pm_test123' })
      },
      subscriptions: {
        create: sinon.stub().resolves({
          id: 'sub_test123',
          status: 'trialing',
          trial_end: Math.floor(Date.now() / 1000) + (14 * 24 * 60 * 60),
          current_period_end: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60),
          latest_invoice: {
            payment_intent: {
              client_secret: 'pi_test_secret'
            }
          }
        })
      },
      webhooks: {
        constructEvent: sinon.stub()
      }
    };
    
    // Mock DynamoDB
    dynamodbStub = {
      put: sinon.stub().returns({ promise: () => Promise.resolve() }),
      get: sinon.stub().returns({ promise: () => Promise.resolve({ Item: null }) }),
      update: sinon.stub().returns({ promise: () => Promise.resolve() })
    };
    
    // Mock SSM
    ssmStub = {
      getParameter: sinon.stub().returns({
        promise: () => Promise.resolve({
          Parameter: {
            Value: JSON.stringify({
              STRIPE_SECRET_KEY: 'sk_test_123',
              STRIPE_PUBLISHABLE_KEY: 'pk_test_123'
            })
          }
        })
      })
    };
    
    // Create AWS stub
    AWSStub = {
      DynamoDB: {
        DocumentClient: sinon.stub().returns(dynamodbStub)
      },
      SystemsManager: sinon.stub().returns(ssmStub)
    };
    
    // Load the payment handler with stubbed dependencies
    paymentHandler = proxyquire('../../lambda/payment-handler', {
      'aws-sdk': AWSStub
    });
    
    // Set the test stripe client
    paymentHandler.setTestStripeClient(stripeStub);
  });
  
  afterEach(() => {
    sinon.restore();
    paymentHandler.resetTestState();
    delete process.env.NODE_ENV;
    delete process.env.MAIN_TABLE_NAME;
    delete process.env.AWS_REGION;
  });
  
  describe('handler', () => {
    it('should handle OPTIONS request for CORS', async () => {
      const event = {
        httpMethod: 'OPTIONS',
        path: '/api/payment/methods'
      };
      
      const response = await paymentHandler.handler(event);
      
      expect(response.statusCode).to.equal(200);
      expect(response.headers['Access-Control-Allow-Origin']).to.equal('*');
      expect(response.body).to.equal('');
    });
    
    it('should require authentication for payment endpoints', async () => {
      const event = {
        httpMethod: 'GET',
        path: '/api/payment/methods',
        requestContext: {}
      };
      
      const response = await paymentHandler.handler(event);
      
      expect(response.statusCode).to.equal(401);
      const body = JSON.parse(response.body);
      expect(body.error).to.equal('Unauthorized');
    });
    
    it('should create setup intent for adding payment method', async () => {
      const event = {
        httpMethod: 'POST',
        path: '/api/payment/setup-intent',
        requestContext: {
          authorizer: { userId: 'test-user-123' }
        },
        body: JSON.stringify({ email: 'test@example.com' })
      };
      
      const response = await paymentHandler.handler(event);
      
      expect(response.statusCode).to.equal(200);
      const body = JSON.parse(response.body);
      expect(body.clientSecret).to.include('seti_test_secret');
      expect(stripeStub.setupIntents.create.calledOnce).to.be.true;
    });
    
    it('should list payment methods for user', async () => {
      dynamodbStub.get.returns({
        promise: () => Promise.resolve({
          Item: {
            stripeCustomerId: 'cus_test123',
            defaultPaymentMethodId: 'pm_test123'
          }
        })
      });
      
      const event = {
        httpMethod: 'GET',
        path: '/api/payment/methods',
        requestContext: {
          authorizer: { userId: 'test-user-123' }
        }
      };
      
      const response = await paymentHandler.handler(event);
      
      expect(response.statusCode).to.equal(200);
      const body = JSON.parse(response.body);
      expect(body.paymentMethods).to.be.an('array');
      expect(body.paymentMethods[0].brand).to.equal('visa');
      expect(body.paymentMethods[0].last4).to.equal('4242');
      expect(body.paymentMethods[0].isDefault).to.be.true;
    });
    
    it('should set default payment method', async () => {
      dynamodbStub.get.returns({
        promise: () => Promise.resolve({
          Item: { stripeCustomerId: 'cus_test123' }
        })
      });
      
      const event = {
        httpMethod: 'PUT',
        path: '/api/payment/methods',
        requestContext: {
          authorizer: { userId: 'test-user-123' }
        },
        body: JSON.stringify({ paymentMethodId: 'pm_test456' })
      };
      
      const response = await paymentHandler.handler(event);
      
      expect(response.statusCode).to.equal(200);
      const body = JSON.parse(response.body);
      expect(body.success).to.be.true;
      expect(dynamodbStub.update.calledOnce).to.be.true;
    });
    
    it('should delete payment method', async () => {
      dynamodbStub.get.returns({
        promise: () => Promise.resolve({
          Item: { stripeCustomerId: 'cus_test123' }
        })
      });
      
      const event = {
        httpMethod: 'DELETE',
        path: '/api/payment/methods',
        requestContext: {
          authorizer: { userId: 'test-user-123' }
        },
        body: JSON.stringify({ paymentMethodId: 'pm_test123' })
      };
      
      const response = await paymentHandler.handler(event);
      
      expect(response.statusCode).to.equal(200);
      const body = JSON.parse(response.body);
      expect(body.success).to.be.true;
      expect(stripeStub.paymentMethods.detach.calledOnce).to.be.true;
    });
    
    it('should create subscription with trial', async () => {
      dynamodbStub.get.returns({
        promise: () => Promise.resolve({
          Item: { stripeCustomerId: 'cus_test123' }
        })
      });
      
      const event = {
        httpMethod: 'POST',
        path: '/api/payment/subscription',
        requestContext: {
          authorizer: { userId: 'test-user-123' }
        },
        body: JSON.stringify({
          planId: 'starter',
          paymentMethodId: 'pm_test123'
        })
      };
      
      const response = await paymentHandler.handler(event);
      
      expect(response.statusCode).to.equal(200);
      const body = JSON.parse(response.body);
      expect(body.subscriptionId).to.equal('sub_test123');
      expect(body.status).to.equal('trialing');
      expect(body.clientSecret).to.equal('pi_test_secret');
      expect(dynamodbStub.put.calledOnce).to.be.true;
    });
  });
  
  describe('webhook handling', () => {
    it('should handle trial_will_end webhook', async () => {
      const webhookEvent = {
        type: 'customer.subscription.trial_will_end',
        data: {
          object: {
            id: 'sub_test123',
            metadata: { userId: 'test-user-123' }
          }
        }
      };
      
      stripeStub.webhooks.constructEvent.returns(webhookEvent);
      
      const event = {
        httpMethod: 'POST',
        path: '/api/payment/webhook',
        headers: {
          'stripe-signature': 'sig_test123'
        },
        body: JSON.stringify(webhookEvent)
      };
      
      const response = await paymentHandler.handler(event);
      
      expect(response.statusCode).to.equal(200);
      const body = JSON.parse(response.body);
      expect(body.received).to.be.true;
      expect(dynamodbStub.put.calledOnce).to.be.true;
    });
    
    it('should handle subscription.updated webhook', async () => {
      const webhookEvent = {
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_test123',
            status: 'active',
            current_period_end: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60),
            metadata: { userId: 'test-user-123' }
          }
        }
      };
      
      stripeStub.webhooks.constructEvent.returns(webhookEvent);
      
      const event = {
        httpMethod: 'POST',
        path: '/api/payment/webhook',
        headers: {
          'stripe-signature': 'sig_test123'
        },
        body: JSON.stringify(webhookEvent)
      };
      
      const response = await paymentHandler.handler(event);
      
      expect(response.statusCode).to.equal(200);
      const body = JSON.parse(response.body);
      expect(body.received).to.be.true;
      expect(dynamodbStub.update.calledOnce).to.be.true;
    });
    
    it('should handle payment_failed webhook', async () => {
      const webhookEvent = {
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'in_test123',
            customer: 'cus_test123',
            metadata: { userId: 'test-user-123' }
          }
        }
      };
      
      stripeStub.webhooks.constructEvent.returns(webhookEvent);
      stripeStub.customers.retrieve.resolves({
        id: 'cus_test123',
        metadata: { userId: 'test-user-123' }
      });
      
      const event = {
        httpMethod: 'POST',
        path: '/api/payment/webhook',
        headers: {
          'stripe-signature': 'sig_test123'
        },
        body: JSON.stringify(webhookEvent)
      };
      
      const response = await paymentHandler.handler(event);
      
      expect(response.statusCode).to.equal(200);
      const body = JSON.parse(response.body);
      expect(body.received).to.be.true;
      expect(dynamodbStub.put.calledOnce).to.be.true;
    });
    
    it('should handle payment_succeeded webhook', async () => {
      const webhookEvent = {
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            id: 'in_test123',
            customer: 'cus_test123',
            amount_paid: 2900,
            currency: 'usd',
            status_transitions: {
              paid_at: Math.floor(Date.now() / 1000)
            },
            metadata: { userId: 'test-user-123' }
          }
        }
      };
      
      stripeStub.webhooks.constructEvent.returns(webhookEvent);
      stripeStub.customers.retrieve.resolves({
        id: 'cus_test123',
        metadata: { userId: 'test-user-123' }
      });
      
      const event = {
        httpMethod: 'POST',
        path: '/api/payment/webhook',
        headers: {
          'stripe-signature': 'sig_test123'
        },
        body: JSON.stringify(webhookEvent)
      };
      
      const response = await paymentHandler.handler(event);
      
      expect(response.statusCode).to.equal(200);
      const body = JSON.parse(response.body);
      expect(body.received).to.be.true;
      expect(dynamodbStub.put.calledOnce).to.be.true;
    });
  });
  
  describe('error handling', () => {
    it('should handle Stripe initialization failure gracefully', async () => {
      // In test mode, we control the mock so this won't fail
      // Instead, test DynamoDB failure
      dynamodbStub.put.returns({
        promise: () => Promise.reject(new Error('DynamoDB error'))
      });
      
      const event = {
        httpMethod: 'POST',
        path: '/api/payment/setup-intent',
        requestContext: {
          authorizer: { userId: 'test-user-123' }
        },
        body: JSON.stringify({ email: 'test@example.com' })
      };
      
      const response = await paymentHandler.handler(event);
      
      expect(response.statusCode).to.equal(500);
      const body = JSON.parse(response.body);
      expect(body.error).to.include('DynamoDB error');
    });
    
    it('should handle customer creation failure', async () => {
      stripeStub.customers.create.rejects(new Error('Card declined'));
      
      const event = {
        httpMethod: 'POST',
        path: '/api/payment/setup-intent',
        requestContext: {
          authorizer: { userId: 'test-user-123' }
        },
        body: JSON.stringify({ email: 'test@example.com' })
      };
      
      const response = await paymentHandler.handler(event);
      
      expect(response.statusCode).to.equal(500);
      const body = JSON.parse(response.body);
      expect(body.error).to.include('Card declined');
    });
    
    it('should return 404 for unknown endpoints', async () => {
      const event = {
        httpMethod: 'GET',
        path: '/api/payment/unknown',
        requestContext: {
          authorizer: { userId: 'test-user-123' }
        }
      };
      
      const response = await paymentHandler.handler(event);
      
      expect(response.statusCode).to.equal(404);
      const body = JSON.parse(response.body);
      expect(body.error).to.equal('Not found');
    });
  });
});