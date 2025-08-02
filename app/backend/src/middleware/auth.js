const jwt = require('jsonwebtoken');
const { ApiError } = require('./errorHandler');
const { cognitoClient } = require('../config/cognito');
const { GetUserCommand } = require('@aws-sdk/client-cognito-identity-provider');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      throw ApiError.unauthorized('Access token required');
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    // Optionally verify with Cognito if using Cognito tokens
    if (process.env.USE_COGNITO === 'true') {
      try {
        const getUserCommand = new GetUserCommand({
          AccessToken: token
        });
        const cognitoUser = await cognitoClient.send(getUserCommand);
        req.user = {
          id: cognitoUser.Username,
          email: cognitoUser.UserAttributes.find(attr => attr.Name === 'email')?.Value,
          ...decoded
        };
      } catch (cognitoError) {
        console.error('Cognito verification failed:', cognitoError);
        throw ApiError.unauthorized('Invalid or expired token');
      }
    } else {
      req.user = decoded;
    }

    // Verify tenant ID if present
    const tenantId = req.headers['x-tenant-id'] || req.params.tenantId;
    if (tenantId) {
      // Verify user has access to this tenant
      if (req.user.tenantId && req.user.tenantId !== tenantId) {
        throw ApiError.forbidden('Access denied to this tenant');
      }
      req.tenantId = tenantId;
    }

    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
    } else if (error.name === 'JsonWebTokenError') {
      next(ApiError.unauthorized('Invalid token'));
    } else if (error.name === 'TokenExpiredError') {
      next(ApiError.unauthorized('Token expired'));
    } else {
      next(ApiError.internal('Authentication failed'));
    }
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'));
    }

    if (roles.length && !roles.includes(req.user.role)) {
      return next(ApiError.forbidden('Insufficient permissions'));
    }

    next();
  };
};

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      req.user = decoded;
    }
  } catch (error) {
    // Ignore auth errors for optional auth
    console.log('Optional auth failed, continuing without user context');
  }
  
  next();
};

module.exports = {
  authenticateToken,
  authorize,
  optionalAuth
};