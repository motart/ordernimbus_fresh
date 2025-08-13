/**
 * JWT Authorizer Lambda Function
 * Validates Cognito JWT tokens for API Gateway authorization
 */

const jwksClient = require('jwks-rsa');
const jwt = require('jsonwebtoken');
const util = require('util');

// Initialize JWKS client for Cognito
const getSigningKey = (jwksUri) => {
  const client = jwksClient({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: jwksUri
  });
  
  return util.promisify(client.getSigningKey);
};

// Generate IAM policy for API Gateway
const generatePolicy = (principalId, effect, resource, context = {}) => {
  const authResponse = {
    principalId: principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resource || '*'
        }
      ]
    }
  };
  
  // Add user context that will be available in Lambda functions
  if (effect === 'Allow' && context) {
    authResponse.context = {
      userId: context.userId || principalId,
      email: context.email || '',
      companyId: context.companyId || '',
      companyName: context.companyName || '',
      role: context.role || 'user'
    };
  }
  
  return authResponse;
};

// Verify JWT token
const verifyToken = async (token, jwksUri, issuer, audience) => {
  try {
    // Decode token without verification first to get the kid
    const decoded = jwt.decode(token, { complete: true });
    
    if (!decoded || !decoded.header || !decoded.header.kid) {
      throw new Error('Invalid token structure');
    }
    
    // Get the signing key from Cognito
    const getKey = getSigningKey(jwksUri);
    const key = await getKey(decoded.header.kid);
    const signingKey = key.getPublicKey();
    
    // Verify the token
    const verified = jwt.verify(token, signingKey, {
      algorithms: ['RS256'],
      issuer: issuer,
      ...(audience && { audience: audience })
    });
    
    return verified;
  } catch (error) {
    console.error('Token verification failed:', error.message);
    throw error;
  }
};

exports.handler = async (event) => {
  console.log('JWT Authorizer Event:', JSON.stringify(event));
  
  try {
    // Extract token from event
    let token;
    
    if (event.type === 'REQUEST') {
      // HTTP API format (API Gateway v2)
      const authHeader = event.headers?.authorization || event.headers?.Authorization;
      if (!authHeader) {
        console.log('No authorization header found');
        return generatePolicy('user', 'Deny', event.routeArn || event.methodArn);
      }
      
      // Remove 'Bearer ' prefix if present
      token = authHeader.replace(/^Bearer\s+/i, '');
    } else {
      // REST API format (API Gateway v1) or direct token
      token = event.authorizationToken || event.token;
      if (!token) {
        console.log('No token found in event');
        return generatePolicy('user', 'Deny', event.methodArn);
      }
      
      // Remove 'Bearer ' prefix if present
      token = token.replace(/^Bearer\s+/i, '');
    }
    
    // Get Cognito configuration from environment
    const region = process.env.AWS_REGION || 'us-west-1';
    const userPoolId = process.env.USER_POOL_ID;
    
    if (!userPoolId) {
      console.error('USER_POOL_ID not configured');
      return generatePolicy('user', 'Deny', event.routeArn || event.methodArn);
    }
    
    // Construct Cognito JWKS URI and issuer
    const jwksUri = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;
    const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
    
    // Verify the token
    const claims = await verifyToken(token, jwksUri, issuer);
    
    console.log('Token verified successfully for user:', claims.sub);
    
    // Extract user information from claims
    const context = {
      userId: claims.sub,
      email: claims.email || claims['cognito:username'],
      companyId: claims['custom:company_id'] || '',
      companyName: claims['custom:company_name'] || '',
      role: claims['custom:role'] || 'user'
    };
    
    // Generate Allow policy with user context
    return generatePolicy(
      claims.sub,
      'Allow',
      event.routeArn || event.methodArn || '*',
      context
    );
    
  } catch (error) {
    console.error('Authorization failed:', error);
    
    // Return Deny policy for any error
    return generatePolicy(
      'user',
      'Deny',
      event.routeArn || event.methodArn || '*'
    );
  }
};

// Export for testing
module.exports.verifyToken = verifyToken;
module.exports.generatePolicy = generatePolicy;