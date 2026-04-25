'use strict';
// delivery.company.service.js
// Add this file to plantdoc-backend/src/services/
// Also: add 'delivery' to User.js role enum values array

const DeliveryCompany = require('../models/DeliveryCompany');
const Order           = require('../models/Order');
const Delivery        = require('../models/Delivery');
const User            = require('../models/User');
const { createError } = require('../middleware/error.middleware');
const { toMongoImage, toDataUri } = require('../utils/image');

// ── Profile ───────────────────────────────────────────────────────────────────
async function getProfile(userId) {
  const user    = await User.findById(userId);
  const company = await DeliveryCompany.findOne({ owner_user_id: userId });
  if (!user || !company) throw createError(404, 'Delivery company profile not found');
  return _format(user, company);
}

async function updateProfile(userId, body, file) {
  const user    = await User.findById(userId);
  const company = await DeliveryCompany.findOne({ owner_user_id: userId });
  if (!user || !company) throw createError(404, 'Profile not found');

  const { full_name, phone, company_name, address, company_phone, email, description } = body;
  if (full_name)    user.full_name  = full_name;
  if (phone)        user.phone      = phone;
  if (company_name) company.name    = company_name;
  if (address)      company.address = address;
  if (company_phone) company.phone  = company_phone;
  if (email)        company.email   = email;
  if (description)  company.description = description;
  if (file)         company.logo    = toMongoImage(file);

  await Promise.all([user.save(), company.save()]);
  return _format(user, company);
}

function _format(user, company) {
  return {
    id: company._id, user_id: user._id,
    full_name: user.full_name, email: user.email, phone: user.phone, role: user.role,
    company_name: company.name, company_address: company.address,
    company_phone: company.phone, company_email: company.email,
    description: company.description, logo: toDataUri(company.logo),
    is_verified: company.is_verified,
  };
}

// ── Orders assigned to this delivery company ──────────────────────────────────
// Orders appear here once seller marks them 'shipped' or later
async function getAssignedOrders(companyId, query) {
  const { page = 1, limit = 20, status } = query;
  const skip = (Number(page) - 1) * Number(limit);

  // Find deliveries belonging to this delivery company
  const deliveryFilter = { company_id: companyId };
  if (status) deliveryFilter.status = status;

  const [deliveries, total] = await Promise.all([
    Delivery.find(deliveryFilter)
      .populate({
        path: 'order_id',
        match: { status: { $in: ['shipped','on_the_way','arriving','delivered','cancelled'] } },
        populate: { path: 'farmer_id', select: 'user_id location' },
      })
      .sort({ created_at: -1 })
      .skip(skip).limit(Number(limit)),
    Delivery.countDocuments(deliveryFilter),
  ]);

  // Filter out deliveries where order didn't match the status filter
  const filtered = deliveries.filter(d => d.order_id);
  return { items: filtered, total, page: Number(page), limit: Number(limit) };
}

async function getActiveOrders(companyId, query) {
  return getAssignedOrders(companyId, {
    ...query,
    status: query.status || undefined,
  });
}

async function getCompletedOrders(companyId, query) {
  const deliveryFilter = { company_id: companyId, status: 'delivered' };
  const { page = 1, limit = 20 } = query;
  const skip = (Number(page) - 1) * Number(limit);

  const [deliveries, total] = await Promise.all([
    Delivery.find(deliveryFilter)
      .populate({ path: 'order_id', populate: { path: 'farmer_id', select: 'user_id location' } })
      .sort({ delivered_at: -1 })
      .skip(skip).limit(Number(limit)),
    Delivery.countDocuments(deliveryFilter),
  ]);
  return { items: deliveries.filter(d => d.order_id), total, page: Number(page), limit: Number(limit) };
}

async function getDashboardStats(companyId) {
  const [active, completed, pending, weekly] = await Promise.all([
    Delivery.countDocuments({ company_id: companyId, status: { $in: ['picked_up','on_the_way','arriving'] } }),
    Delivery.countDocuments({ company_id: companyId, status: 'delivered' }),
    Delivery.countDocuments({ company_id: companyId, status: 'pending' }),
    Delivery.countDocuments({
      company_id: companyId,
      created_at: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    }),
  ]);
  return { active, completed, pending, weekly };
}

module.exports = { getProfile, updateProfile, getAssignedOrders, getActiveOrders, getCompletedOrders, getDashboardStats };
