'use strict';

const service = require('../services/treatmentRequest.service');
const { success, paginated } = require('../utils/apiResponse');

async function createRequest(req, res, next) {
  try {
    const request = await service.createRequest(req.user.profileId, req.body, req.app.get('io'));
    return success(res, 201, 'Treatment request created', request);
  } catch (err) { next(err); }
}

async function getFarmerRequests(req, res, next) {
  try {
    const { items, total, page, limit } = await service.getFarmerRequests(req.user.profileId, req.query);
    return paginated(res, items, total, page, limit, 'Requests fetched');
  } catch (err) { next(err); }
}

async function getPool(req, res, next) {
  try {
    const { items, total, page, limit } = await service.getPool(req.query);
    return paginated(res, items, total, page, limit, 'Expert pool fetched');
  } catch (err) { next(err); }
}

async function getPendingCases(req, res, next) {
  try {
    const result = await service.getPendingCases(req.query);
    return success(res, 200, 'Pending cases fetched', result.cases, {
      currentPage: result.currentPage,
      totalPages: result.totalPages,
      totalCases: result.totalCases,
      hasNextPage: result.hasNextPage,
      hasPrevPage: result.hasPrevPage,
    });
  } catch (err) { next(err); }
}

async function assignToExpert(req, res, next) {
  try {
    const result = await service.assignToExpert(
      req.user.profileId,
      req.user.userId,
      req.params.id,
      req.app.get('io')
    );
    return success(res, 200, 'Case assigned', result);
  } catch (err) { next(err); }
}

async function getRequestById(req, res, next) {
  try {
    const request = await service.getRequestById(
      req.params.id,
      req.user.userId,
      req.user.role,
      req.user.profileId
    );
    return success(res, 200, 'Request fetched', request);
  } catch (err) { next(err); }
}

async function submitReview(req, res, next) {
  try {
    const result = await service.submitReview(
      req.user.profileId,
      req.user.userId,
      req.params.id,
      req.body,
      req.app.get('io')
    );
    return success(res, 200, 'Review submitted', result);
  } catch (err) { next(err); }
}

function resolveExpertId(req) {
  if (req.query.expertId && req.query.expertId !== String(req.user.profileId)) {
    throw Object.assign(new Error('You can only access your own cases'), { statusCode: 403 });
  }

  return req.user.profileId;
}

async function getReviewedToday(req, res, next) {
  try {
    const expertId = resolveExpertId(req);
    const result = await service.getReviewedToday(expertId);
    return success(res, 200, 'Reviewed today fetched', result.items, {
      total: result.total,
      startOfDay: result.startOfDay,
      endOfDay: result.endOfDay,
    });
  } catch (err) { next(err); }
}

async function getRecentValidatedCases(req, res, next) {
  try {
    const expertId = resolveExpertId(req);
    const { items, total, page, limit } = await service.getRecentValidatedCases(expertId, req.query);
    return paginated(res, items, total, page, limit, 'Validated cases fetched');
  } catch (err) { next(err); }
}

async function getExpertCases(req, res, next) {
  try {
    const expertId = resolveExpertId(req);
    const { items, total, page, limit } = await service.getExpertCases(expertId, req.query);
    return paginated(res, items, total, page, limit, 'Expert cases fetched');
  } catch (err) { next(err); }
}

module.exports = {
  createRequest,
  getFarmerRequests,
  getPool,
  getPendingCases,
  assignToExpert,
  getRequestById,
  submitReview,
  getReviewedToday,
  getRecentValidatedCases,
  getExpertCases,
};
