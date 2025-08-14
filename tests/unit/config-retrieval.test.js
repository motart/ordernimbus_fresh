/**
 * Unit Tests for Configuration Retrieval
 * 
 * Tests that configuration is properly fetched from AWS SSM Parameter Store
 * and that no hardcoded values are used in production.
 */

const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

describe('Configuration Retrieval Tests', () => {
  
  let handler, clearCache, mockSSM;
  
  beforeEach(() => {
    // Create fresh mock for SSM
    mockSSM = {
      getParameters: sinon.stub()
    };
    
    // Create AWS mock
    const awsMock = {
      config: {
        update: sinon.stub()
      },
      SSM: sinon.stub().returns(mockSSM)
    };
    
    // Load handler with mocked AWS
    const configModule = proxyquire('../../lambda/config-handler', {
      'aws-sdk': awsMock
    });
    
    handler = configModule.handler;
    clearCache = configModule.clearCache;
    
    // Clear the cache
    if (clearCache) {
      clearCache();
    }
  });
  
  afterEach(() => {
    // Clean up
    sinon.restore();
  });
  
  describe('Environment Detection', () => {
    it('should detect production environment from request context', async () => {
      const event = {
        httpMethod: 'GET',
        requestContext: {
          stage: 'production'
        }
      };
      
      mockSSM.getParameters.returns({
        promise: () => Promise.resolve({
          Parameters: [
            { Name: '/ordernimbus/production/cognito/user-pool-id', Value: 'us-west-1_ABC123' },
            { Name: '/ordernimbus/production/cognito/client-id', Value: 'client123' },
            { Name: '/ordernimbus/production/api/endpoint', Value: 'https://api.ordernimbus.com' },
            { Name: '/ordernimbus/production/frontend/cloudfront-domain', Value: 'd123.cloudfront.net' }
          ]
        })
      });
      
      const response = await handler(event);
      const config = JSON.parse(response.body);
      
      expect(response.statusCode).to.equal(200);
      expect(config.environment).to.equal('production');
      expect(config.features.enableDebug).to.be.false;
      expect(config.features.enableAnalytics).to.be.true;
    });
    
    it('should detect development environment from request context', async () => {
      const event = {
        httpMethod: 'GET',
        requestContext: {
          stage: 'development'
        }
      };
      
      mockSSM.getParameters.returns({
        promise: () => Promise.resolve({
          Parameters: [
            { Name: '/ordernimbus/development/cognito/user-pool-id', Value: 'us-west-1_DEV123' },
            { Name: '/ordernimbus/development/cognito/client-id', Value: 'dev-client123' },
            { Name: '/ordernimbus/development/api/endpoint', Value: 'http://localhost:3001' },
            { Name: '/ordernimbus/development/frontend/cloudfront-domain', Value: '' }
          ]
        })
      });
      
      const response = await handler(event);
      const config = JSON.parse(response.body);
      
      expect(response.statusCode).to.equal(200);
      expect(config.environment).to.equal('development');
      expect(config.features.enableDebug).to.be.true;
      expect(config.features.enableAnalytics).to.be.false;
    });
  });
  
  describe('SSM Parameter Store Integration', () => {
    it('should fetch all required parameters from SSM', async () => {
      const event = {
        httpMethod: 'GET',
        requestContext: {
          stage: 'production'
        }
      };
      
      mockSSM.getParameters.returns({
        promise: () => Promise.resolve({
          Parameters: [
            { Name: '/ordernimbus/production/cognito/user-pool-id', Value: 'us-west-1_PROD123' },
            { Name: '/ordernimbus/production/cognito/client-id', Value: 'prod-client123' },
            { Name: '/ordernimbus/production/api/endpoint', Value: 'https://api.ordernimbus.com' },
            { Name: '/ordernimbus/production/frontend/cloudfront-domain', Value: 'd123.cloudfront.net' }
          ]
        })
      });
      
      const response = await handler(event);
      const config = JSON.parse(response.body);
      
      expect(response.statusCode).to.equal(200);
      expect(config.userPoolId).to.equal('us-west-1_PROD123');
      expect(config.clientId).to.equal('prod-client123');
      expect(config.apiUrl).to.equal('https://api.ordernimbus.com');
      expect(config.cloudfrontDomain).to.equal('d123.cloudfront.net');
      
      // Verify SSM was called with correct parameters
      expect(mockSSM.getParameters.calledOnce).to.be.true;
      const ssmCall = mockSSM.getParameters.getCall(0).args[0];
      expect(ssmCall.Names).to.include('/ordernimbus/production/cognito/user-pool-id');
      expect(ssmCall.Names).to.include('/ordernimbus/production/cognito/client-id');
      expect(ssmCall.Names).to.include('/ordernimbus/production/api/endpoint');
      expect(ssmCall.Names).to.include('/ordernimbus/production/frontend/cloudfront-domain');
    });
    
    it('should return error when SSM parameters are not available', async () => {
      const event = {
        httpMethod: 'GET',
        requestContext: {
          stage: 'production'
        }
      };
      
      mockSSM.getParameters.returns({
        promise: () => Promise.reject(new Error('ParameterNotFound'))
      });
      
      const response = await handler(event);
      const errorResponse = JSON.parse(response.body);
      
      expect(response.statusCode).to.equal(500);
      expect(errorResponse.error).to.equal('Failed to retrieve configuration');
      expect(errorResponse.message).to.include('Configuration not available');
    });
    
    it('should NOT fall back to hardcoded values when SSM fails', async () => {
      const event = {
        httpMethod: 'GET',
        requestContext: {
          stage: 'production'
        }
      };
      
      mockSSM.getParameters.returns({
        promise: () => Promise.reject(new Error('AccessDenied'))
      });
      
      const response = await handler(event);
      const errorResponse = JSON.parse(response.body);
      
      expect(response.statusCode).to.equal(500);
      expect(errorResponse.error).to.equal('Failed to retrieve configuration');
      // Should not contain any hardcoded API URLs
      expect(response.body).to.not.include('bggexzhlwb');
      expect(response.body).to.not.include('localhost:3001');
      expect(response.body).to.not.include('us-west-1_A59siBuVM');
    });
  });
  
  describe('Configuration Values', () => {
    it('should generate derived configuration values', async () => {
      const event = {
        httpMethod: 'GET',
        requestContext: {
          stage: 'production'
        }
      };
      
      mockSSM.getParameters.returns({
        promise: () => Promise.resolve({
          Parameters: [
            { Name: '/ordernimbus/production/cognito/user-pool-id', Value: 'us-west-1_TEST' },
            { Name: '/ordernimbus/production/cognito/client-id', Value: 'test-client' },
            { Name: '/ordernimbus/production/api/endpoint', Value: 'https://api.example.com' },
            { Name: '/ordernimbus/production/frontend/cloudfront-domain', Value: 'd123.cloudfront.net' }
          ]
        })
      });
      
      const response = await handler(event);
      const config = JSON.parse(response.body);
      
      expect(response.statusCode).to.equal(200);
      // Derived values
      expect(config.graphqlUrl).to.equal('https://api.example.com/graphql');
      expect(config.wsUrl).to.equal('wss://api.example.com/ws');
      
      // Feature flags
      expect(config.features).to.deep.include({
        enableDebug: false,
        enableAnalytics: true,
        enableMockData: false,
        useWebCrypto: true,
        shopifyIntegration: true,
        csvUpload: true,
        multiTenant: true
      });
      
      // Other settings
      expect(config.maxFileUploadSize).to.equal(52428800);
      expect(config.supportedFileTypes).to.deep.equal(['.csv', '.xlsx', '.xls']);
      expect(config.sessionTimeout).to.equal(3600000);
    });
  });
  
  describe('CORS Support', () => {
    it('should handle OPTIONS requests for CORS', async () => {
      const event = {
        httpMethod: 'OPTIONS',
        headers: {
          Origin: 'https://app.ordernimbus.com'
        }
      };
      
      const response = await handler(event);
      
      expect(response.statusCode).to.equal(200);
      expect(response.headers['Access-Control-Allow-Origin']).to.equal('*');
      expect(response.headers['Access-Control-Allow-Methods']).to.include('GET');
      expect(response.headers['Access-Control-Allow-Methods']).to.include('OPTIONS');
      expect(response.body).to.equal('');
    });
  });
  
  describe('No Hardcoded Values', () => {
    it('should not contain any hardcoded production URLs', async () => {
      const configHandlerCode = require('fs').readFileSync(
        require.resolve('../../lambda/config-handler.js'), 
        'utf8'
      );
      
      // Check that no hardcoded production URLs exist in the code
      expect(configHandlerCode).to.not.include('bggexzhlwb.execute-api');
      expect(configHandlerCode).to.not.include('ay8k50buyd.execute-api');
      expect(configHandlerCode).to.not.include('us-west-1_A59siBuVM');
      expect(configHandlerCode).to.not.include('1fan0b8etrqi40gb7hgmvvea58');
      
      // Only localhost should be allowed for local development
      const localhostMatches = configHandlerCode.match(/localhost:3001/g) || [];
      expect(localhostMatches.length).to.equal(0, 'No hardcoded localhost URLs should exist');
    });
  });
});