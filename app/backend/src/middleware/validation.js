const { validationResult } = require('express-validator');
const { ApiError } = require('./errorHandler');

const validate = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(ApiError.badRequest('Validation failed', errors.array()));
    }

    next();
  };
};

const sanitizeInput = (req, res, next) => {
  // Recursively sanitize object
  const sanitize = (obj) => {
    if (typeof obj !== 'object' || obj === null) {
      if (typeof obj === 'string') {
        // Remove potential XSS attempts
        return obj
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '')
          .trim();
      }
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(sanitize);
    }

    const sanitized = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        sanitized[key] = sanitize(obj[key]);
      }
    }
    return sanitized;
  };

  if (req.body) {
    req.body = sanitize(req.body);
  }
  if (req.query) {
    req.query = sanitize(req.query);
  }
  if (req.params) {
    req.params = sanitize(req.params);
  }

  next();
};

module.exports = {
  validate,
  sanitizeInput
};