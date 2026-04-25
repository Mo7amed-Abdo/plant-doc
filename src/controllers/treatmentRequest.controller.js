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

module.exports = { createRequest, getFarmerRequests, getPool, assignToExpert, getRequestById, submitReview };
