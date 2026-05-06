'use strict';

const Rating = require('../models/Rating');
const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const Delivery = require('../models/Delivery');
const { createError } = require('../middleware/error.middleware');

/**
 * Farmer submits up to 3 ratings per order: product, company, and delivery company.
 * The unique compound index (order_id, target_type, target_id) is the hard guard.
 */
async function createRating(farmerId, orderId, body) {
  const { target_type, target_id, stars, review } = body;

  if (!target_type || !target_id || !stars) {
    throw createError(400, 'target_type, target_id, and stars are required');
  }
  if (!['product', 'company', 'delivery_company'].includes(target_type)) {
    throw createError(400, 'target_type must be "product", "company", or "delivery_company"');
  }

  // Confirm this order belongs to the farmer
  const order = await Order.findOne({ _id: orderId, farmer_id: farmerId });
  if (!order) throw createError(404, 'Order not found');
  if (order.status !== 'delivered') {
    throw createError(400, 'You can only rate a delivered order');
  }

  // If rating a product, verify the product was in this order
  if (target_type === 'product') {
    const item = await OrderItem.findOne({ order_id: orderId, product_id: target_id });
    if (!item) throw createError(400, 'This product was not part of the order');
  }

  // If rating a company, verify this order is from that company
  if (target_type === 'company') {
    if (order.company_id.toString() !== target_id.toString()) {
      throw createError(400, 'This company did not fulfil this order');
    }
  }

  // If rating a delivery company, verify this order's delivery record matches
  if (target_type === 'delivery_company') {
    const delivery = await Delivery.findOne({ order_id: orderId }).lean();
    if (!delivery) throw createError(400, 'Delivery record not found for this order yet');
    if (delivery.delivery_company_id.toString() !== target_id.toString()) {
      throw createError(400, 'This delivery company did not deliver this order');
    }
  }

  const rating = await Rating.create({
    order_id: orderId,
    farmer_id: farmerId,
    target_type,
    target_id,
    stars: Number(stars),
    review: review || null,
  });

  return rating;
}

async function getOrderRatings(farmerId, orderId) {
  const order = await Order.findOne({ _id: orderId, farmer_id: farmerId });
  if (!order) throw createError(404, 'Order not found');

  return Rating.find({ order_id: orderId, farmer_id: farmerId });
}

module.exports = { createRating, getOrderRatings };
