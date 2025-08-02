const express = require('express');
const router = express.Router();
const dataController = require('../controllers/data.controller');
const { validate } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');
const { apiLimiter, uploadLimiter } = require('../middleware/rateLimiter');
const {
  uploadDataValidator,
  validateBulkUpload,
  getDataValidator,
  deleteDataValidator
} = require('../validators/data.validators');

// All data routes require authentication
router.use(authenticateToken);

// Data upload routes (with upload rate limiting)
router.post('/tenants/:tenantId/data/upload', 
  uploadLimiter,
  validate(uploadDataValidator), 
  dataController.uploadData
);

router.post('/tenants/:tenantId/data/bulk', 
  uploadLimiter,
  validate(validateBulkUpload), 
  dataController.bulkUpload
);

// Data retrieval and management (with API rate limiting)
router.get('/tenants/:tenantId/data', 
  apiLimiter,
  validate(getDataValidator), 
  dataController.getData
);

router.delete('/tenants/:tenantId/data', 
  apiLimiter,
  validate(deleteDataValidator), 
  dataController.deleteData
);

module.exports = router;