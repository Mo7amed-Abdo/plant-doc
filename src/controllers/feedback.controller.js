'use strict';

const feedbackService = require('../services/feedback.service');
const { success } = require('../utils/apiResponse');

/**
 * POST /api/feedback/plantdoc
 * Farmer-only.
 */
async function createPlantDocFeedback(req, res, next) {
  try {
    const result = await feedbackService.createPlantDocFeedback(req.user, req.body);
    return success(res, 201, 'Feedback submitted', result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/feedback/plantdoc/recent?limit=3
 * Public (for landing page).
 */
async function listRecentPlantDocFeedback(req, res, next) {
  try {
    const limit = req.query.limit;
    const items = await feedbackService.listRecentPlantDocFeedback(limit);
    return success(res, 200, 'Recent feedback', items);
  } catch (err) {
    next(err);
  }
}

module.exports = { createPlantDocFeedback, listRecentPlantDocFeedback };
