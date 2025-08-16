/**
 * Unit tests for CloudFront CORS configuration
 * Ensures Lambda functions properly handle CORS for CloudFront distributions
 */

const { expect } = require('chai');

describe('CloudFront CORS Configuration', () => {
  let handler;
  
  before(() => {
    // Load the Lambda handler
    handler = require('../../lambda/production/index.js').handler;
  });
  
  describe('CORS Headers', () => {
    it('should allow CloudFront distribution origins', async () => {
      const event = {
        headers: {
          origin: 'https://d39qw5rr9tjqlc.cloudfront.net'
        },
        requestContext: {
          http: {
            method: 'OPTIONS'
          }
        },
        httpMethod: 'OPTIONS'
      };
      
      const response = await handler(event);
      
      expect(response.statusCode).to.equal(200);
      expect(response.headers['Access-Control-Allow-Origin']).to.equal('https://d39qw5rr9tjqlc.cloudfront.net');
      expect(response.headers['Access-Control-Allow-Methods']).to.include('GET');
      expect(response.headers['Access-Control-Allow-Methods']).to.include('POST');
      expect(response.headers['Access-Control-Allow-Headers']).to.include('Authorization');
    });
    
    it('should allow any CloudFront distribution via regex', async () => {
      const event = {
        headers: {
          origin: 'https://d1234567890abc.cloudfront.net'
        },
        requestContext: {
          http: {
            method: 'OPTIONS'
          }
        },
        httpMethod: 'OPTIONS'
      };
      
      const response = await handler(event);
      
      expect(response.statusCode).to.equal(200);
      expect(response.headers['Access-Control-Allow-Origin']).to.equal('https://d1234567890abc.cloudfront.net');
    });
    
    it('should allow S3 website origins', async () => {
      const event = {
        headers: {
          origin: 'http://app.ordernimbus.com.s3-website-us-west-1.amazonaws.com'
        },
        requestContext: {
          http: {
            method: 'OPTIONS'
          }
        },
        httpMethod: 'OPTIONS'
      };
      
      const response = await handler(event);
      
      expect(response.statusCode).to.equal(200);
      expect(response.headers['Access-Control-Allow-Origin']).to.equal('http://app.ordernimbus.com.s3-website-us-west-1.amazonaws.com');
    });
    
    it('should include CORS headers in API responses', async () => {
      const event = {
        headers: {
          origin: 'https://d39qw5rr9tjqlc.cloudfront.net',
          userId: 'test-user'
        },
        path: '/api/stores',
        httpMethod: 'GET',
        queryStringParameters: {}
      };
      
      // Set up environment for test
      process.env.TABLE_NAME = 'test-table';
      
      const response = await handler(event);
      
      expect(response.headers['Access-Control-Allow-Origin']).to.equal('https://d39qw5rr9tjqlc.cloudfront.net');
      expect(response.headers['Access-Control-Allow-Credentials']).to.equal('true');
    });
    
    it('should reject invalid origins', async () => {
      const event = {
        headers: {
          origin: 'https://malicious-site.com'
        },
        requestContext: {
          http: {
            method: 'OPTIONS'
          }
        },
        httpMethod: 'OPTIONS'
      };
      
      const response = await handler(event);
      
      expect(response.statusCode).to.equal(200);
      // Should default to first allowed origin, not the malicious one
      expect(response.headers['Access-Control-Allow-Origin']).to.not.equal('https://malicious-site.com');
      expect(response.headers['Access-Control-Allow-Origin']).to.equal('http://app.ordernimbus.com');
    });
  });
});