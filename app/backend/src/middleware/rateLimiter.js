const rateLimit = require('express-rate-limit');
const { ApiError } = require('./errorHandler');

// General rate limiter
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  handler: (req, res, next) => {
    next(ApiError.tooManyRequests('Too many requests, please try again later.'));
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
  handler: (req, res, next) => {
    next(ApiError.tooManyRequests('Too many authentication attempts, please try again later.'));
  },
  skipSuccessfulRequests: true,
});

// API rate limiter
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // Limit each IP to 60 requests per minute
  message: 'API rate limit exceeded.',
  handler: (req, res, next) => {
    next(ApiError.tooManyRequests('API rate limit exceeded.'));
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise use IP
    return req.user?.id || req.ip;
  },
});

// Upload rate limiter
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 uploads per hour
  message: 'Upload limit exceeded.',
  handler: (req, res, next) => {
    next(ApiError.tooManyRequests('Upload limit exceeded, please try again later.'));
  },
});

module.exports = {
  generalLimiter,
  authLimiter,
  apiLimiter,
  uploadLimiter
};