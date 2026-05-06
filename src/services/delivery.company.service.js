'use strict';

const DeliveryCompany = require('../models/DeliveryCompany');
const Delivery = require('../models/Delivery');
const Rating = require('../models/Rating');
const User = require('../models/User');
const mongoose = require('mongoose');
const { createError } = require('../middleware/error.middleware');
const { toMongoImage, toDataUri } = require('../utils/image');

function serializeFarmerAvatar(delivery) {
  const order = delivery?.order_id;
  const farmerUser = order?.farmer_id?.user_id;
  // Ensure avatar is always a browser-usable string (data URI or http URL).
  // Some code paths might already provide a string; toDataUri handles only the Mongo image shape.
  if (farmerUser && farmerUser.avatar && typeof farmerUser.avatar !== 'string') {
    farmerUser.avatar = toDataUri(farmerUser.avatar);
  }
  return delivery;
}

async function attachDeliveryRatings(deliveryCompanyId, deliveries) {
  const companyObjectId =
    mongoose.Types.ObjectId.isValid(deliveryCompanyId)
      ? new mongoose.Types.ObjectId(deliveryCompanyId)
      : deliveryCompanyId;
  const orderIds = (deliveries || [])
    .map((d) => d?.order_id?._id)
    .filter(Boolean);
  if (!orderIds.length) return deliveries;

  const ratings = await Rating.find({
    order_id: { $in: orderIds },
    target_type: 'delivery_company',
    target_id: companyObjectId,
  })
    .select('order_id stars review')
    .lean();

  const byOrder = new Map(ratings.map((r) => [String(r.order_id), r]));
  (deliveries || []).forEach((d) => {
    const key = String(d?.order_id?._id || '');
    const r = byOrder.get(key);
    if (!r) return;
    // Frontend expects farmer_rating / farmer_feedback
    d.farmer_rating = r.stars || 0;
    d.farmer_feedback = r.review || null;
  });
  return deliveries;
}

async function getProfile(userId) {
  const user = await User.findById(userId);
  const company = await DeliveryCompany.findOne({ owner_user_id: userId });
  if (!user || !company) throw createError(404, 'Delivery company profile not found');
  return formatProfile(user, company);
}

async function updateProfile(userId, body, file) {
  const user = await User.findById(userId);
  const company = await DeliveryCompany.findOne({ owner_user_id: userId });
  if (!user || !company) throw createError(404, 'Profile not found');

  const { full_name, phone, company_name, address, company_phone, email, description } = body;
  if (full_name) user.full_name = full_name;
  if (phone) user.phone = phone;
  if (company_name) company.name = company_name;
  if (address) company.address = address;
  if (company_phone) company.phone = company_phone;
  if (email) company.email = email;
  if (description) company.description = description;
  if (file) company.logo = toMongoImage(file);

  await Promise.all([user.save(), company.save()]);
  return formatProfile(user, company);
}

function formatProfile(user, company) {
  return {
    id: company._id,
    user_id: user._id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    company_name: company.name,
    company_address: company.address,
    company_phone: company.phone,
    company_email: company.email,
    description: company.description,
    logo: toDataUri(company.logo),
    is_verified: company.is_verified,
  };
}

async function getAssignedOrders(companyId, query) {
  const { page = 1, limit = 20, status, search } = query;
  const skip = (Number(page) - 1) * Number(limit);

  const deliveryFilter = { delivery_company_id: companyId };
  if (status) deliveryFilter.status = status;

  let items = await Delivery.find(deliveryFilter)
    .populate({
      path: 'order_id',
      match: { status: { $in: ['shipped', 'on_the_way', 'arriving', 'delivered', 'delivery_failed', 'cancelled'] } },
      populate: {
        path: 'farmer_id',
        select: 'user_id location',
        populate: { path: 'user_id', select: 'full_name phone avatar' },
      },
    })
    .populate('company_id', 'name phone email')
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(Number(limit))
    .lean();

  items = items.filter((delivery) => delivery.order_id);
  items.forEach(serializeFarmerAvatar);
  await attachDeliveryRatings(companyId, items);
  if (search) {
    const q = String(search).trim().toLowerCase();
    items = items.filter((delivery) => {
      const order = delivery.order_id || {};
      const farmer = order.farmer_id || {};
      const haystack = [
        order.order_code,
        order.shipping_address?.street,
        order.shipping_address?.city,
        farmer.location,
        farmer.user_id?.full_name,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }

  const total = await Delivery.countDocuments(deliveryFilter);
  return { items, total, page: Number(page), limit: Number(limit) };
}

async function getActiveOrders(companyId, query) {
  const status = query.status || { $in: ['picked_up', 'on_the_way', 'arriving'] };
  return getAssignedOrders(companyId, { ...query, status });
}

async function getCompletedOrders(companyId, query) {
  const { page = 1, limit = 20, search } = query;
  const skip = (Number(page) - 1) * Number(limit);
  const deliveryFilter = { delivery_company_id: companyId, status: 'delivered' };

  let items = await Delivery.find(deliveryFilter)
    .populate({
      path: 'order_id',
      populate: {
        path: 'farmer_id',
        select: 'user_id location',
        populate: { path: 'user_id', select: 'full_name phone avatar' },
      },
    })
    .populate('company_id', 'name phone email')
    .sort({ delivered_at: -1 })
    .skip(skip)
    .limit(Number(limit))
    .lean();

  items = items.filter((delivery) => delivery.order_id);
  items.forEach(serializeFarmerAvatar);
  await attachDeliveryRatings(companyId, items);
  if (search) {
    const q = String(search).trim().toLowerCase();
    items = items.filter((delivery) => {
      const order = delivery.order_id || {};
      const farmer = order.farmer_id || {};
      const haystack = [
        order.order_code,
        order.shipping_address?.city,
        farmer.location,
        farmer.user_id?.full_name,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }

  const total = await Delivery.countDocuments(deliveryFilter);
  return { items, total, page: Number(page), limit: Number(limit) };
}

async function getDashboardStats(companyId) {
  const [active, completed, failed, weekly] = await Promise.all([
    Delivery.countDocuments({ delivery_company_id: companyId, status: { $in: ['picked_up', 'on_the_way', 'arriving'] } }),
    Delivery.countDocuments({ delivery_company_id: companyId, status: 'delivered' }),
    Delivery.countDocuments({ delivery_company_id: companyId, status: 'failed' }),
    Delivery.countDocuments({
      delivery_company_id: companyId,
      created_at: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    }),
  ]);

  return { active, completed, failed, weekly };
}

module.exports = {
  getProfile,
  updateProfile,
  getAssignedOrders,
  getActiveOrders,
  getCompletedOrders,
  getDashboardStats,
};
