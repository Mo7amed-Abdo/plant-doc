'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');

/**
 * Signs a JWT token.
 *
 * @param {Object} payload - Data to encode. Should include: userId, role, profileId
 * @returns {string} Signed JWT token
 */
function signToken(payload) {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
}

/**
 * Verifies a JWT token.
 *
 * @param {string} token
 * @returns {Object} Decoded payload
 * @throws JsonWebTokenError | TokenExpiredError
 */
function verifyToken(token) {
  return jwt.verify(token, env.JWT_SECRET);
}

/**
 * Builds the standard auth response payload.
 *
 * @param {Object} user - Mongoose User document
 * @param {string} profileId - ObjectId of the role-specific profile document
 * @returns {{ token: string, user: Object }}
 */
function buildAuthResponse(user, profileId) {
  const payload = {
    userId: user._id.toString(),
    role: user.role,
    profileId: profileId ? profileId.toString() : null,
  };

  const token = signToken(payload);

  return {
    token,
    user: {
      id: user._id,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      avatar: user.avatar || null,
      is_active: user.is_active,
    },
  };
}

module.exports = { signToken, verifyToken, buildAuthResponse };
