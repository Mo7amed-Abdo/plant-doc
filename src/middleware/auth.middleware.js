'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { createError } = require('./error.middleware');

/**
 * Verifies the JWT from the Authorization header.
 * Attaches decoded payload to req.user.
 *
 * Expected header: Authorization: Bearer <token>
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(createError(401, 'No token provided'));
    }

    const token = authHeader.split(' ')[1];

    const decoded = jwt.verify(token, env.JWT_SECRET);

    // decoded shape: { userId, role, profileId, iat, exp }
    req.user = decoded;

    next();
  } catch (err) {
    next(err); // JsonWebTokenError / TokenExpiredError caught by error handler
  }
}

module.exports = { authenticate };
