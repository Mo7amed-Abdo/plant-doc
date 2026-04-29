'use strict';

const deliveryService = require('../services/delivery.service');
const { success, paginated } = require('../utils/apiResponse');

// ─── Farmer ───────────────────────────────────────────────────────────────────

async function getFarmerOrders(req, res, next) {
  try {
    const { items, total, page, limit } = await deliveryService.getFarmerOrders(
      req.user.profileId, req.query
    );
    return paginated(res, items, total, page, limit, 'Orders fetched');
  } catch (err) { next(err); }
}

async function getFarmerOrderById(req, res, next) {
  try {
    const data = await deliveryService.getFarmerOrderById(req.user.profileId, req.params.id);
    return success(res, 200, 'Order fetched', data);
  } catch (err) { next(err); }
}

async function getFarmerDelivery(req, res, next) {
  try {
    const delivery = await deliveryService.getFarmerDelivery(req.user.profileId, req.params.id);
    return success(res, 200, 'Delivery fetched', delivery);
  } catch (err) { next(err); }
}

// ─── Company: treatment requests ──────────────────────────────────────────────

async function getTreatmentRequests(req, res, next) {
  try {
    const { items, total, page, limit } = await deliveryService.getTreatmentRequests(
      req.user.profileId, req.query
    );
    return paginated(res, items, total, page, limit, 'Treatment requests fetched');
  } catch (err) { next(err); }
}

async function rejectOrder(req, res, next) {
  try {
    const order = await deliveryService.rejectOrder(
      req.user.profileId, req.params.id, req.body, req.app.get('io')
    );
    return success(res, 200, 'Order rejected', order);
  } catch (err) { next(err); }
}

// ─── Company: orders ──────────────────────────────────────────────────────────

async function getCompanyOrders(req, res, next) {
  try {
    const { items, total, page, limit } = await deliveryService.getCompanyOrders(
      req.user.profileId, req.query
    );
    return paginated(res, items, total, page, limit, 'Orders fetched');
  } catch (err) { next(err); }
}

async function getCompanyOrderById(req, res, next) {
  try {
    const data = await deliveryService.getCompanyOrderById(req.user.profileId, req.params.id);
    return success(res, 200, 'Order fetched', data);
  } catch (err) { next(err); }
}

async function updateOrderStatus(req, res, next) {
  try {
    const order = await deliveryService.updateOrderStatus(
      req.user.profileId, req.params.id, req.body, req.app.get('io')
    );
    return success(res, 200, 'Order status updated', order);
  } catch (err) { next(err); }
}

// ─── Company: deliveries ──────────────────────────────────────────────────────

async function createDelivery(req, res, next) {
  try {
    const delivery = await deliveryService.createDelivery(
      req.user.profileId, req.params.id, req.body
    );
    return success(res, 201, 'Delivery record created', delivery);
  } catch (err) { next(err); }
}

async function getCompanyDeliveries(req, res, next) {
  try {
    const { items, total, page, limit } = await deliveryService.getCompanyDeliveries(
      req.user.profileId, req.query
    );
    return paginated(res, items, total, page, limit, 'Deliveries fetched');
  } catch (err) { next(err); }
}

async function getCompanyDeliveryById(req, res, next) {
  try {
    const delivery = await deliveryService.getCompanyDeliveryById(
      req.user.profileId, req.params.id
    );
    return success(res, 200, 'Delivery fetched', delivery);
  } catch (err) { next(err); }
}

async function updateDeliveryStatus(req, res, next) {
  try {
    const delivery = await deliveryService.updateDeliveryStatus(
      req.user.profileId, req.params.id, req.body, req.app.get('io')
    );
    return success(res, 200, 'Delivery status updated', delivery);
  } catch (err) { next(err); }
}

async function uploadProofOfDelivery(req, res, next) {
  try {
    const delivery = await deliveryService.uploadProofOfDelivery(
      req.user.profileId, req.params.id, req.file
    );
    return success(res, 200, 'Proof of delivery uploaded', delivery);
  } catch (err) { next(err); }
}

module.exports = {
  // Farmer
  getFarmerOrders, getFarmerOrderById, getFarmerDelivery,
  // Company — treatment requests
  getTreatmentRequests, rejectOrder,
  // Company — orders
  getCompanyOrders, getCompanyOrderById, updateOrderStatus,
  // Company — deliveries
  createDelivery, getCompanyDeliveries, getCompanyDeliveryById,
  updateDeliveryStatus, uploadProofOfDelivery,
};