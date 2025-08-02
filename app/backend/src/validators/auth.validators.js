const { body, param, query } = require('express-validator');

const loginValidator = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number')
];

const registerValidator = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  body('confirmPassword')
    .custom((value, { req }) => value === req.body.password)
    .withMessage('Passwords must match'),
  body('name')
    .optional()
    .isLength({ min: 2, max: 100 })
    .trim()
    .escape()
    .withMessage('Name must be between 2 and 100 characters'),
  body('organizationName')
    .optional()
    .isLength({ min: 2, max: 200 })
    .trim()
    .escape()
    .withMessage('Organization name must be between 2 and 200 characters')
];

const resetPasswordValidator = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required')
];

const changePasswordValidator = [
  body('token')
    .isLength({ min: 32 })
    .withMessage('Valid reset token is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number')
];

const refreshTokenValidator = [
  body('refreshToken')
    .notEmpty()
    .withMessage('Refresh token is required')
];

module.exports = {
  loginValidator,
  registerValidator,
  resetPasswordValidator,
  changePasswordValidator,
  refreshTokenValidator
};