'use strict';

const { createError } = require('./error.middleware');

/**
 * Role guard factory.
 * Usage: router.get('/something', authenticate, requireRole('farmer'), handler)
 *
 * Accepts one or more roles:
 *   requireRole('farmer')
 *   requireRole('company', 'expert')
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(createError(401, 'Not authenticated'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        createError(403, `Access denied. Required role(s): ${allowedRoles.join(', ')}`)
      );
    }

    next();
  };
}

module.exports = { requireRole };
