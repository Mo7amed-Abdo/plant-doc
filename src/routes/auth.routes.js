'use strict';

const router = require('express').Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { uploadOptional } = require('../middleware/upload.middleware');

/**
 * POST /api/auth/register
 * Public. Accepts multipart/form-data (for optional avatar) or JSON.
 */
router.post('/register', uploadOptional('avatar'), authController.register);

/**
 * POST /api/auth/login
 * Public.
 */
router.post('/login', authController.login);

// Password reset (dev: returns code in response)
router.post('/password-reset/request', authController.passwordResetRequest);
router.post('/password-reset/confirm', authController.passwordResetConfirm);

// Google Sign-In
router.post('/google', authController.google);
router.get('/google/client-id', authController.googleClientId);

/**
 * POST /api/auth/change-password
 * Authenticated — all roles.
 */
router.post('/change-password', authenticate, authController.changePassword);

/**
 * GET /api/auth/me
 * Authenticated — returns current user info.
 */
router.get('/me', authenticate, authController.me);

module.exports = router;
