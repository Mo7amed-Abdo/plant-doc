'use strict';

/**
 * Standard success response.
 * All successful API responses go through this.
 *
 * @param {Response} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Human-readable message
 * @param {*} data - Response payload
 * @param {Object} [meta] - Optional pagination or extra metadata
 */
function success(res, statusCode = 200, message = 'Success', data = null, meta = null) {
  const response = {
    success: true,
    message,
    ...(data !== null && { data }),
    ...(meta !== null && { meta }),
  };
  return res.status(statusCode).json(response);
}

/**
 * Paginated list response helper.
 *
 * @param {Response} res
 * @param {Array} items
 * @param {number} total - Total count in DB (before pagination)
 * @param {number} page - Current page (1-indexed)
 * @param {number} limit - Items per page
 * @param {string} [message]
 */
function paginated(res, items, total, page, limit, message = 'Data fetched') {
  return success(res, 200, message, items, {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page * limit < total,
    hasPrevPage: page > 1,
  });
}

module.exports = { success, paginated };
