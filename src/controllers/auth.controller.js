'use strict';

const authService = require('../services/auth.service');
const { success } = require('../utils/apiResponse');

/**
 * POST /api/auth/register
 * Body (multipart/form-data or JSON):
 *   full_name, email, phone?, password, role
 *   + role-specific fields (see auth.service.js)
 * File (optional): avatar
 */
async function register(req, res, next) {
  try {
    const result = await authService.register(req.body, req.file);
    return success(res, 201, 'Registration successful', result);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    return success(res, 200, 'Login successful', result);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/change-password
 * Body: { current_password, new_password }
 * Auth: Bearer token required
 */
async function changePassword(req, res, next) {
  try {
    const { current_password, new_password } = req.body;
    await authService.changePassword(req.user.userId, current_password, new_password);
    return success(res, 200, 'Password changed successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/me
 * Returns the current user's basic info from the JWT payload.
 * Auth: Bearer token required
 */
async function me(req, res, next) {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.user.userId);
    if (!user) {
      const { createError } = require('../middleware/error.middleware');
      return next(createError(404, 'User not found'));
    }
    return success(res, 200, 'Current user', {
      id: user._id,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      is_active: user.is_active,
      last_login_at: user.last_login_at,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, changePassword, me };
