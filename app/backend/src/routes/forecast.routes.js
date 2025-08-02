const express = require('express');
const router = express.Router();
const forecastController = require('../controllers/forecast.controller');
const { validate } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');
const {
  createForecastValidator,
  getForecastValidator,
  listForecastsValidator,
  updateForecastValidator,
  deleteForecastValidator
} = require('../validators/forecast.validators');

// All forecast routes require authentication
router.use(authenticateToken);
router.use(apiLimiter);

// Forecast CRUD operations
router.post('/tenants/:tenantId/forecasts', 
  validate(createForecastValidator), 
  forecastController.createForecast
);

router.get('/tenants/:tenantId/forecasts', 
  validate(listForecastsValidator), 
  forecastController.listForecasts
);

router.get('/tenants/:tenantId/forecasts/:forecastId', 
  validate(getForecastValidator), 
  forecastController.getForecast
);

router.patch('/tenants/:tenantId/forecasts/:forecastId', 
  validate(updateForecastValidator), 
  forecastController.updateForecast
);

router.delete('/tenants/:tenantId/forecasts/:forecastId', 
  validate(deleteForecastValidator), 
  forecastController.deleteForecast
);

module.exports = router;