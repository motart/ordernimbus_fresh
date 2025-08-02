const { body, param, query } = require('express-validator');

const uploadDataValidator = [
  param('tenantId')
    .isUUID()
    .withMessage('Valid tenant ID is required'),
  body('dataType')
    .isIn(['sales', 'inventory', 'products', 'customers'])
    .withMessage('Invalid data type'),
  body('format')
    .optional()
    .isIn(['csv', 'json', 'xlsx'])
    .withMessage('Invalid format specified'),
  body('data')
    .optional()
    .custom((value) => {
      if (typeof value === 'object' || Array.isArray(value)) {
        return true;
      }
      throw new Error('Data must be an object or array');
    })
];

const validateBulkUpload = [
  param('tenantId')
    .isUUID()
    .withMessage('Valid tenant ID is required'),
  body('records')
    .isArray({ min: 1, max: 10000 })
    .withMessage('Records must be an array with 1 to 10000 items'),
  body('records.*.date')
    .isISO8601()
    .toDate()
    .withMessage('Each record must have a valid date'),
  body('records.*.productId')
    .notEmpty()
    .isString()
    .withMessage('Each record must have a product ID'),
  body('records.*.quantity')
    .isInt({ min: 0 })
    .withMessage('Quantity must be a positive integer'),
  body('records.*.price')
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number')
];

const getDataValidator = [
  param('tenantId')
    .isUUID()
    .withMessage('Valid tenant ID is required'),
  query('dataType')
    .optional()
    .isIn(['sales', 'inventory', 'products', 'customers'])
    .withMessage('Invalid data type'),
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
  query('limit')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .toInt()
    .withMessage('Limit must be between 1 and 1000'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .toInt()
    .withMessage('Offset must be a positive integer')
];

const deleteDataValidator = [
  param('tenantId')
    .isUUID()
    .withMessage('Valid tenant ID is required'),
  body('dataType')
    .isIn(['sales', 'inventory', 'products', 'customers'])
    .withMessage('Invalid data type'),
  body('ids')
    .optional()
    .isArray()
    .withMessage('IDs must be an array'),
  body('dateRange')
    .optional()
    .custom((value) => {
      if (value && (!value.start || !value.end)) {
        throw new Error('Date range must include both start and end dates');
      }
      return true;
    })
];

module.exports = {
  uploadDataValidator,
  validateBulkUpload,
  getDataValidator,
  deleteDataValidator
};