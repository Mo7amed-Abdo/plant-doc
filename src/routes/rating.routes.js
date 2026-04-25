'use strict';

const router = require('express').Router({ mergeParams: true }); // gets :id from parent
const ratingService = require('../services/rating.service');
const { success } = require('../utils/apiResponse');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');

const isFarmer = [authenticate, requireRole('farmer')];

// POST /api/orders/:id/ratings
router.post('/', ...isFarmer, async (req, res, next) => {
  try {
    const rating = await ratingService.createRating(req.user.profileId, req.params.id, req.body);
    return success(res, 201, 'Rating submitted', rating);
  } catch (err) { next(err); }
});

// GET /api/orders/:id/ratings
router.get('/', ...isFarmer, async (req, res, next) => {
  try {
    const ratings = await ratingService.getOrderRatings(req.user.profileId, req.params.id);
    return success(res, 200, 'Ratings fetched', ratings);
  } catch (err) { next(err); }
});

module.exports = router;
