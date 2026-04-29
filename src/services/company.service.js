'use strict';

const Company = require('../models/Company');
const User = require('../models/User');
const ProductListing = require('../models/ProductListing');
const Order = require('../models/Order');
const CompanyNotification = require('../models/notifications/CompanyNotification');
const { createError } = require('../middleware/error.middleware');
const { toMongoImage, toDataUri } = require('../utils/image');

// ─── Profile ──────────────────────────────────────────────────────────────────

async function getProfile(userId) {
  const user = await User.findById(userId);
  if (!user) throw createError(404, 'User not found');

  const company = await Company.findOne({ owner_user_id: userId });
  if (!company) throw createError(404, 'Company profile not found');

  return _formatProfile(user, company);
}

async function updateProfile(userId, body, file) {
  const user = await User.findById(userId);
  if (!user) throw createError(404, 'User not found');

  const company = await Company.findOne({ owner_user_id: userId });
  if (!company) throw createError(404, 'Company profile not found');

  const { full_name, phone, company_name, address, company_phone, email, description } = body;

  // User fields
  if (full_name) user.full_name = full_name;
  if (phone !== undefined) user.phone = phone;

  // Company fields
  if (company_name) company.name = company_name;
  if (address !== undefined) company.address = address;
  if (company_phone !== undefined) company.phone = company_phone;
  if (email !== undefined) company.email = email;
  if (description !== undefined) company.description = description;
  if (file) company.logo = toMongoImage(file);

  await Promise.all([user.save(), company.save()]);
  return _formatProfile(user, company);
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

/**
 * Returns all stats needed by the company dashboard in a single round-trip.
 *
 * @param {string|ObjectId} companyId  — the Company document _id (req.user.profileId)
 */
async function getDashboard(companyId) {
  const FARMER_POPULATE = {
    path: 'farmer_id',
    select: 'user_id location',
    populate: { path: 'user_id', select: 'full_name' },
  };

  const [
    activeListings,
    lowStockCount,
    outOfStockCount,
    pendingCount,
    activeOrdersCount,
    deliveredOrders,
    recentOrders,
    unreadNotifications,
  ] = await Promise.all([
    // Inventory
    ProductListing.countDocuments({ company_id: companyId, is_active: true }),
    ProductListing.countDocuments({ company_id: companyId, stock_status: 'low_stock' }),
    ProductListing.countDocuments({ company_id: companyId, stock_status: 'out_of_stock' }),
    // Orders
    Order.countDocuments({ company_id: companyId, status: 'pending' }),
    Order.countDocuments({
      company_id: companyId,
      status: { $in: ['processing', 'shipped', 'on_the_way', 'arriving'] },
    }),
    Order.find({ company_id: companyId, status: 'delivered' }).select('total').lean(),
    // Recent 5 non-pending orders for the table widget
    Order.find({ company_id: companyId, status: { $ne: 'pending' } })
      .populate(FARMER_POPULATE)
      .sort({ placed_at: -1 })
      .limit(5)
      .lean(),
    // Notification bell count
    CompanyNotification.countDocuments({ company_id: companyId, is_read: false }),
  ]);

  const revenue = deliveredOrders.reduce((sum, o) => sum + (o.total || 0), 0);

  return {
    active_listings:       activeListings,
    low_stock_count:       lowStockCount,
    out_of_stock_count:    outOfStockCount,
    pending_orders:        pendingCount,        // = treatment requests awaiting decision
    active_orders:         activeOrdersCount,   // processing / in transit
    delivered_orders:      deliveredOrders.length,
    revenue:               parseFloat(revenue.toFixed(2)),
    recent_orders:         recentOrders,
    unread_notifications:  unreadNotifications,
  };
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function _formatProfile(user, company) {
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
    last_login_at: user.last_login_at,
  };
}

module.exports = { getProfile, updateProfile, getDashboard };