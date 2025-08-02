const { body, param, query } = require('express-validator');

const createForecastValidator = [
  param('tenantId')
    .isUUID()
    .withMessage('Valid tenant ID is required'),
  body('productId')
    .optional()
    .isString()
    .trim()
    .withMessage('Product ID must be a string'),
  body('storeId')
    .optional()
    .isString()
    .trim()
    .withMessage('Store ID must be a string'),
  body('forecastPeriod')
    .isInt({ min: 1, max: 365 })
    .withMessage('Forecast period must be between 1 and 365 days'),
  body('algorithm')
    .optional()
    .isIn(['arima', 'lstm', 'prophet', 'ensemble'])
    .withMessage('Invalid algorithm specified'),
  body('granularity')
    .optional()
    .isIn(['hourly', 'daily', 'weekly', 'monthly'])
    .withMessage('Invalid granularity specified')
];

const getForecastValidator = [
  param('tenantId')
    .isUUID()
    .withMessage('Valid tenant ID is required'),
  param('forecastId')
    .isUUID()
    .withMessage('Valid forecast ID is required')
];

const listForecastsValidator = [
  param('tenantId')
    .isUUID()
    .withMessage('Valid tenant ID is required'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .toInt()
    .withMessage('Limit must be between 1 and 100'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .toInt()
    .withMessage('Offset must be a positive integer'),
  query('startDate')
    .optional()
    .isISO8601()
    .toDate()
    .withMessage('Start date must be a valid ISO 8601 date'),
  query('endDate')
    .optional()
    .isISO8601()
    .toDate()
    .withMessage('End date must be a valid ISO 8601 date'),
  query('status')
    .optional()
    .isIn(['pending', 'processing', 'completed', 'failed'])
    .withMessage('Invalid status filter'),
  query('sortBy')
    .optional()
    .isIn(['createdAt', 'updatedAt', 'accuracy'])
    .withMessage('Invalid sort field'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc')
];

const updateForecastValidator = [
  param('tenantId')
    .isUUID()
    .withMessage('Valid tenant ID is required'),
  param('forecastId')
    .isUUID()
    .withMessage('Valid forecast ID is required'),
  body('status')
    .optional()
    .isIn(['pending', 'processing', 'completed', 'failed'])
    .withMessage('Invalid status'),
  body('notes')
    .optional()
    .isString()
    .isLength({ max: 1000 })
    .trim()
    .escape()
    .withMessage('Notes must be less than 1000 characters')
];

const deleteForecastValidator = [
  param('tenantId')
    .isUUID()
    .withMessage('Valid tenant ID is required'),
  param('forecastId')
    .isUUID()
    .withMessage('Valid forecast ID is required')
];

module.exports = {
  createForecastValidator,
  getForecastValidator,
  listForecastsValidator,
  updateForecastValidator,
  deleteForecastValidator
};