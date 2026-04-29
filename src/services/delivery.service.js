'use strict';

const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const Delivery = require('../models/Delivery');
const Farmer = require('../models/Farmer');
const { createError } = require('../middleware/error.middleware');
const { toMongoImage } = require('../utils/image');
const notificationService = require('./notification.service');

// ─── Shared populate helper ───────────────────────────────────────────────────

/**
 * Deep-populates farmer_id so the frontend can read:
 *   o.farmer_id.user_id.full_name   — farmer's real name
 *   o.farmer_id.location            — farmer's city / region
 *   o.farmer_id.user_id.phone       — farmer's phone number
 */
const FARMER_POPULATE = {
  path: 'farmer_id',
  select: 'user_id location',
  populate: { path: 'user_id', select: 'full_name phone' },
};

// ─── Farmer: own orders ───────────────────────────────────────────────────────

async function getFarmerOrders(farmerId, query) {
  const { page = 1, limit = 10, status } = query;
  const skip = (Number(page) - 1) * Number(limit);
  const filter = { farmer_id: farmerId };
  if (status) filter.status = status;

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('company_id', 'name logo')
      .sort({ placed_at: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Order.countDocuments(filter),
  ]);

  // Batch-fetch all OrderItems for these orders in one query
  if (orders.length) {
    const orderIds = orders.map(o => o._id);
    const allItems = await OrderItem.find({ order_id: { $in: orderIds } })
      .populate('product_id', 'name category unit')
      .lean();

    const byOrder = {};
    allItems.forEach(item => {
      const key = item.order_id.toString();
      if (!byOrder[key]) byOrder[key] = [];
      byOrder[key].push(item);
    });
    orders.forEach(order => {
      order.items = byOrder[order._id.toString()] || [];
    });
  }

  return { items: orders, total, page: Number(page), limit: Number(limit) };
}

async function getFarmerOrderById(farmerId, orderId) {
  const order = await Order.findOne({ _id: orderId, farmer_id: farmerId })
    .populate('company_id', 'name phone email');
  if (!order) throw createError(404, 'Order not found');

  const items = await OrderItem.find({ order_id: orderId })
    .populate('product_id', 'name category unit');
  return { order, items };
}

async function getFarmerDelivery(farmerId, orderId) {
  const order = await Order.findOne({ _id: orderId, farmer_id: farmerId });
  if (!order) throw createError(404, 'Order not found');

  const delivery = await Delivery.findOne({ order_id: orderId });
  if (!delivery) throw createError(404, 'Delivery not yet created for this order');
  return delivery;
}

// ─── Company: treatment requests (pending orders awaiting acceptance) ─────────

/**
 * Returns only pending orders for this company, with full farmer info + items.
 * These are "treatment requests" the company must accept or reject before
 * they become real orders.
 */
async function getTreatmentRequests(companyId, query) {
  const { page = 1, limit = 20 } = query;
  const skip = (Number(page) - 1) * Number(limit);
  const filter = { company_id: companyId, status: 'pending' };

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate(FARMER_POPULATE)
      .sort({ placed_at: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Order.countDocuments(filter),
  ]);

  // Batch-fetch items so cards can preview requested products
  if (orders.length) {
    const orderIds = orders.map(o => o._id);
    const allItems = await OrderItem.find({ order_id: { $in: orderIds } })
      .populate('product_id', 'name category unit')
      .lean();

    const byOrder = {};
    allItems.forEach(item => {
      const key = item.order_id.toString();
      if (!byOrder[key]) byOrder[key] = [];
      byOrder[key].push(item);
    });
    orders.forEach(order => {
      order.items = byOrder[order._id.toString()] || [];
    });
  }

  return { items: orders, total, page: Number(page), limit: Number(limit) };
}

/**
 * Rejects a pending order:
 *   - Sets status → 'cancelled'
 *   - Stores rejection_reason in order.notes
 *   - Notifies the farmer via socket/push
 */
async function rejectOrder(companyId, orderId, body, io) {
  const { rejection_reason } = body;

  const order = await Order.findOne({ _id: orderId, company_id: companyId, status: 'pending' });
  if (!order) throw createError(404, 'Pending order not found or already processed');

  order.status = 'cancelled';
  order.notes  = rejection_reason
    ? `Rejected: ${rejection_reason}`
    : 'Rejected by company';
  await order.save();

  // Notify farmer — failure here must NOT break the rejection response
  try {
    const farmer = await Farmer.findById(order.farmer_id).populate('user_id', '_id');
    if (farmer?.user_id) {
      await notificationService.notifyFarmer(
        farmer._id,
        farmer.user_id._id,
        {
          type: 'order_status',
          title: 'Order Request Rejected',
          body: `Your order ${order.order_code} was not accepted.${
            rejection_reason ? ` Reason: ${rejection_reason}` : ''
          }`,
          related_id: order._id,
          related_type: 'order',
        },
        io
      );
    }
  } catch (_) { /* non-critical */ }

  return order;
}

// ─── Company: orders ──────────────────────────────────────────────────────────

/**
 * Returns company orders with full farmer info.
 *
 * Query params:
 *   status          — filter by exact status value
 *   exclude_pending — when 'true', excludes pending (treatment-request) orders
 *   page, limit
 */
async function getCompanyOrders(companyId, query) {
  const { page = 1, limit = 10, status, exclude_pending } = query;
  const skip = (Number(page) - 1) * Number(limit);
  const filter = { company_id: companyId };

  if (status) {
    filter.status = status;
  } else if (exclude_pending === 'true') {
    filter.status = { $ne: 'pending' };
  }

  const [items, total] = await Promise.all([
    Order.find(filter)
      .populate(FARMER_POPULATE)
      .sort({ placed_at: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Order.countDocuments(filter),
  ]);
  return { items, total, page: Number(page), limit: Number(limit) };
}

async function getCompanyOrderById(companyId, orderId) {
  const order = await Order.findOne({ _id: orderId, company_id: companyId })
    .populate(FARMER_POPULATE);
  if (!order) throw createError(404, 'Order not found');

  const items = await OrderItem.find({ order_id: orderId })
    .populate('product_id', 'name category unit');
  return { order, items };
}

async function updateOrderStatus(companyId, orderId, body, io) {
  const { status } = body;
  if (!status) throw createError(400, 'status is required');

  const validStatuses = [
    'pending', 'processing', 'shipped', 'on_the_way', 'arriving', 'delivered', 'cancelled',
  ];
  if (!validStatuses.includes(status)) {
    throw createError(400, `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  const order = await Order.findOne({ _id: orderId, company_id: companyId });
  if (!order) throw createError(404, 'Order not found');

  order.status = status;
  if (status === 'delivered') order.delivered_at = new Date();
  await order.save();

  // Notify farmer of status change
  try {
    const farmer = await Farmer.findById(order.farmer_id).populate('user_id', '_id');
    if (farmer?.user_id) {
      await notificationService.notifyFarmer(
        farmer._id,
        farmer.user_id._id,
        {
          type: 'order_status',
          title: 'Order status updated',
          body: `Your order ${order.order_code} is now: ${status.replace(/_/g, ' ')}.`,
          related_id: order._id,
          related_type: 'order',
        },
        io
      );
    }
  } catch (_) { /* non-critical */ }

  return order;
}

// ─── Company: delivery management ────────────────────────────────────────────

async function createDelivery(companyId, orderId, body) {
  const order = await Order.findOne({ _id: orderId, company_id: companyId });
  if (!order) throw createError(404, 'Order not found');

  const existing = await Delivery.findOne({ order_id: orderId });
  if (existing) throw createError(409, 'Delivery record already exists for this order');

  const { eta, delivery_notes } = body;

  const delivery = await Delivery.create({
    order_id: orderId,
    company_id: companyId,
    eta: eta || null,
    delivery_notes: delivery_notes || null,
    status_timeline: [{ step: 'order_received', occurred_at: new Date() }],
  });

  return delivery;
}

async function getCompanyDeliveries(companyId, query) {
  const { page = 1, limit = 10, status } = query;
  const skip = (Number(page) - 1) * Number(limit);
  const filter = { company_id: companyId };
  if (status) filter.status = status;

  const [items, total] = await Promise.all([
    Delivery.find(filter)
      .populate('order_id', 'order_code farmer_id total status')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Delivery.countDocuments(filter),
  ]);
  return { items, total, page: Number(page), limit: Number(limit) };
}

async function getCompanyDeliveryById(companyId, deliveryId) {
  const delivery = await Delivery.findOne({ _id: deliveryId, company_id: companyId })
    .populate('order_id');
  if (!delivery) throw createError(404, 'Delivery not found');
  return delivery;
}

async function updateDeliveryStatus(companyId, deliveryId, body, io) {
  const { status, note, eta } = body;
  if (!status) throw createError(400, 'status is required');

  const validStatuses = ['pending', 'picked_up', 'on_the_way', 'arriving', 'delivered', 'failed'];
  if (!validStatuses.includes(status)) {
    throw createError(400, `Invalid delivery status. Must be one of: ${validStatuses.join(', ')}`);
  }

  const delivery = await Delivery.findOne({ _id: deliveryId, company_id: companyId });
  if (!delivery) throw createError(404, 'Delivery not found');

  const stepMap = {
    picked_up:  'picked_up',
    on_the_way: 'in_transit',
    arriving:   'arrived',
    delivered:  'delivered',
    failed:     'failed',
  };

  delivery.status = status;
  if (stepMap[status]) {
    delivery.status_timeline.push({
      step: stepMap[status],
      occurred_at: new Date(),
      note: note || null,
    });
  }
  if (eta)                    delivery.eta          = new Date(eta);
  if (status === 'picked_up') delivery.picked_up_at = new Date();
  if (status === 'delivered') delivery.delivered_at = new Date();

  await delivery.save();

  // Sync order status with delivery progression
  const orderStatusMap = {
    picked_up:  'shipped',
    on_the_way: 'on_the_way',
    arriving:   'arriving',
    delivered:  'delivered',
  };
  if (orderStatusMap[status]) {
    await updateOrderStatus(companyId, delivery.order_id, { status: orderStatusMap[status] }, io);
  }

  return delivery;
}

async function uploadProofOfDelivery(companyId, deliveryId, file) {
  if (!file) throw createError(400, 'Proof of delivery image is required');

  const delivery = await Delivery.findOne({ _id: deliveryId, company_id: companyId });
  if (!delivery) throw createError(404, 'Delivery not found');

  delivery.proof_of_delivery = toMongoImage(file);
  await delivery.save();
  return delivery;
}

module.exports = {
  getFarmerOrders,
  getFarmerOrderById,
  getFarmerDelivery,
  getTreatmentRequests,
  rejectOrder,
  getCompanyOrders,
  getCompanyOrderById,
  updateOrderStatus,
  createDelivery,
  getCompanyDeliveries,
  getCompanyDeliveryById,
  updateDeliveryStatus,
  uploadProofOfDelivery,
};