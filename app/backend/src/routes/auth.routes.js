const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { validate } = require('../middleware/validation');
const { authLimiter } = require('../middleware/rateLimiter');
const { authenticateToken } = require('../middleware/auth');
const {
  loginValidator,
  registerValidator,
  resetPasswordValidator,
  changePasswordValidator,
  refreshTokenValidator
} = require('../validators/auth.validators');

// Public routes (with rate limiting)
router.post('/login', authLimiter, validate(loginValidator), authController.login);
router.post('/register', authLimiter, validate(registerValidator), authController.register);
router.post('/reset-password', authLimiter, validate(resetPasswordValidator), authController.resetPassword);
router.post('/change-password', authLimiter, validate(changePasswordValidator), authController.changePassword);
router.post('/refresh-token', authLimiter, validate(refreshTokenValidator), authController.refreshToken);

// Protected routes
router.post('/logout', authenticateToken, authController.logout);

module.exports = router;