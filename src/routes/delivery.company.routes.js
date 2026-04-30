'use strict';
// delivery.company.routes.js — Add to plantdoc-backend/src/routes/
// Mount in app.js: app.use('/api/delivery', require('./routes/delivery.company.routes'));

const router  = require('express').Router();
const svc     = require('../services/delivery.company.service');
const delSvc  = require('../services/delivery.service');
const { authenticate }  = require('../middleware/auth.middleware');
const { requireRole }   = require('../middleware/role.middleware');
const { uploadOptional, uploadSingle } = require('../middleware/upload.middleware');
const { success, paginated } = require('../utils/apiResponse');

const isDelivery = [authenticate, requireRole('delivery')];

// Profile
router.get('/profile',  ...isDelivery, async (req, res, next) => {
  try { return success(res, 200, 'Profile fetched', await svc.getProfile(req.user.userId)); }
  catch (e) { next(e); }
});
router.put('/profile',  ...isDelivery, uploadOptional('logo'), async (req, res, next) => {
  try { return success(res, 200, 'Profile updated', await svc.updateProfile(req.user.userId, req.body, req.file)); }
  catch (e) { next(e); }
});

// Dashboard stats
router.get('/stats', ...isDelivery, async (req, res, next) => {
  try { return success(res, 200, 'Stats fetched', await svc.getDashboardStats(req.user.profileId)); }
  catch (e) { next(e); }
});

// Orders
router.get('/orders/active',    ...isDelivery, async (req, res, next) => {
  try {
    const { items, total, page, limit } = await svc.getActiveOrders(req.user.profileId, req.query);
    return paginated(res, items, total, page, limit, 'Active orders fetched');
  } catch (e) { next(e); }
});
router.get('/orders/completed', ...isDelivery, async (req, res, next) => {
  try {
    const { items, total, page, limit } = await svc.getCompletedOrders(req.user.profileId, req.query);
    return paginated(res, items, total, page, limit, 'Completed orders fetched');
  } catch (e) { next(e); }
});
router.get('/orders',           ...isDelivery, async (req, res, next) => {
  try {
    const { items, total, page, limit } = await svc.getAssignedOrders(req.user.profileId, req.query);
    return paginated(res, items, total, page, limit, 'Orders fetched');
  } catch (e) { next(e); }
});

// Delivery status management (reuse existing delivery service)
router.get('/deliveries',         ...isDelivery, async (req, res, next) => {
  try {
    const { items, total, page, limit } = await svc.getAssignedOrders(req.user.profileId, req.query);
    return paginated(res, items, total, page, limit);
  } catch (e) { next(e); }
});
router.get('/deliveries/:id',     ...isDelivery, async (req, res, next) => {
  try { return success(res, 200, 'Delivery fetched', await delSvc.getDeliveryCompanyDeliveryById(req.user.profileId, req.params.id)); }
  catch (e) { next(e); }
});
router.put('/deliveries/:id/status', ...isDelivery, async (req, res, next) => {
  try { return success(res, 200, 'Status updated', await delSvc.updateDeliveryCompanyStatus(req.user.profileId, req.params.id, req.body, req.app.get('io'))); }
  catch (e) { next(e); }
});
router.put('/deliveries/:id/proof',  ...isDelivery, uploadSingle('proof'), async (req, res, next) => {
  try { return success(res, 200, 'Proof uploaded', await delSvc.uploadDeliveryCompanyProof(req.user.profileId, req.params.id, req.file)); }
  catch (e) { next(e); }
});

// Notifications
router.get('/notifications', ...isDelivery, async (req, res, next) => {
  try {
    // Reuse company notification model but scoped to delivery company
    const FarmerNotification = require('../models/notifications/FarmerNotification');
    // For delivery we use CompanyNotification since delivery co is a company variant
    const CompanyNotification = require('../models/notifications/CompanyNotification');
    const { page = 1, limit = 20, is_read } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const filter = { company_id: req.user.profileId };
    if (is_read !== undefined) filter.is_read = is_read === 'true';
    const [items, total] = await Promise.all([
      CompanyNotification.find(filter).sort({ created_at: -1 }).skip(skip).limit(Number(limit)),
      CompanyNotification.countDocuments(filter),
    ]);
    const { paginated: pg } = require('../utils/apiResponse');
    return paginated(res, items, total, Number(page), Number(limit));
  } catch (e) { next(e); }
});
router.put('/notifications/read-all', ...isDelivery, async (req, res, next) => {
  try {
    const CompanyNotification = require('../models/notifications/CompanyNotification');
    await CompanyNotification.updateMany({ company_id: req.user.profileId, is_read: false }, { is_read: true });
    return success(res, 200, 'All read');
  } catch (e) { next(e); }
});
router.put('/notifications/:id/read', ...isDelivery, async (req, res, next) => {
  try {
    const CompanyNotification = require('../models/notifications/CompanyNotification');
    const n = await CompanyNotification.findOneAndUpdate({ _id: req.params.id, company_id: req.user.profileId }, { is_read: true }, { new: true });
    if (!n) return next(require('../middleware/error.middleware').createError(404, 'Not found'));
    return success(res, 200, 'Marked read', n);
  } catch (e) { next(e); }
});

module.exports = router;
