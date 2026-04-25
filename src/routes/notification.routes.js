'use strict';

const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const { success, paginated } = require('../utils/apiResponse');
const { createError } = require('../middleware/error.middleware');

const FarmerNotification = require('../models/notifications/FarmerNotification');
const ExpertNotification = require('../models/notifications/ExpertNotification');
const CompanyNotification = require('../models/notifications/CompanyNotification');

/**
 * Resolves the correct notification model + filter field based on JWT role.
 */
function resolveModel(role, profileId) {
  switch (role) {
    case 'farmer':
      return { Model: FarmerNotification, field: 'farmer_id', id: profileId };
    case 'expert':
      return { Model: ExpertNotification, field: 'expert_id', id: profileId };
    case 'company':
      return { Model: CompanyNotification, field: 'company_id', id: profileId };
    default:
      return null;
  }
}

// GET /api/notifications
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, is_read } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const resolved = resolveModel(req.user.role, req.user.profileId);
    if (!resolved) throw createError(403, 'Notifications not available for this role');

    const { Model, field, id } = resolved;
    const filter = { [field]: id };
    if (is_read !== undefined) filter.is_read = is_read === 'true';

    const [items, total] = await Promise.all([
      Model.find(filter).sort({ created_at: -1 }).skip(skip).limit(Number(limit)),
      Model.countDocuments(filter),
    ]);

    return paginated(res, items, total, Number(page), Number(limit), 'Notifications fetched');
  } catch (err) { next(err); }
});

// PUT /api/notifications/read-all  (must come BEFORE /:id to avoid route conflict)
router.put('/read-all', authenticate, async (req, res, next) => {
  try {
    const resolved = resolveModel(req.user.role, req.user.profileId);
    if (!resolved) throw createError(403, 'Notifications not available for this role');

    const { Model, field, id } = resolved;
    await Model.updateMany({ [field]: id, is_read: false }, { is_read: true });

    return success(res, 200, 'All notifications marked as read');
  } catch (err) { next(err); }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', authenticate, async (req, res, next) => {
  try {
    const resolved = resolveModel(req.user.role, req.user.profileId);
    if (!resolved) throw createError(403, 'Notifications not available for this role');

    const { Model, field, id } = resolved;
    const notification = await Model.findOneAndUpdate(
      { _id: req.params.id, [field]: id },
      { is_read: true },
      { new: true }
    );
    if (!notification) throw createError(404, 'Notification not found');

    return success(res, 200, 'Notification marked as read', notification);
  } catch (err) { next(err); }
});

module.exports = router;
