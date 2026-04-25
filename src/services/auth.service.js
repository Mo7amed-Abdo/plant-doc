'use strict';

const mongoose = require('mongoose');
const User = require('../models/User');
const Farmer = require('../models/Farmer');
const Expert = require('../models/Expert');
const Company = require('../models/Company');
const { buildAuthResponse } = require('../utils/jwt');
const { createError } = require('../middleware/error.middleware');
const { toMongoImage } = require('../utils/image');

// ─── Priority-to-role map for Treatment Requests ──────────────────────────────
const SEVERITY_TO_PRIORITY = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  critical: 'urgent',
};
exports.SEVERITY_TO_PRIORITY = SEVERITY_TO_PRIORITY;

// ─── Register ─────────────────────────────────────────────────────────────────

/**
 * Creates a User + the matching role-profile in a single transaction.
 *
 * @param {Object} body   - Request body fields
 * @param {Object} [file] - Multer file (avatar upload, optional)
 * @returns {{ token, user, profile }}
 */
async function register(body, file) {
  const {
    full_name,
    email,
    phone,
    password,
    role,
    // Farmer-specific
    location,
    bio,
    // Expert-specific
    specialization,
    years_experience,
    expertise_tags,
    // Company-specific
    company_name,
    company_address,
    company_phone,
    company_email,
    company_description,
  } = body;

  // ── Validate role ────────────────────────────────────────────────────────────
  const validRoles = ['farmer', 'expert', 'company', 'delivery'];
  if (!validRoles.includes(role)) {
    throw createError(400, `Invalid role. Must be one of: ${validRoles.join(', ')}`);
  }

  // ── Check duplicate email ────────────────────────────────────────────────────
  const existing = await User.findOne({ email: email.toLowerCase() }).select('_id');
  if (existing) throw createError(409, 'Email already in use');

  // ── Role-specific validation ─────────────────────────────────────────────────
  if (role === 'expert' && !specialization) {
    throw createError(400, 'Specialization is required for experts');
  }
  if (role === 'company' && !company_name) {
    throw createError(400, 'Company name is required');
  }

  // ── Start session for atomic write ───────────────────────────────────────────
  const avatar = file ? toMongoImage(file) : null;

  // 1. Create User
  const user = await User.create({
    full_name,
    email,
    phone: phone || null,
    password_hash: password,
    role,
    avatar,
  });

  // 2. Create role-specific profile
  let profile = null;

  try {
    if (role === 'farmer') {
      profile = await Farmer.create({
        user_id: user._id,
        location: location || null,
        bio: bio || null,
      });
    }

    if (role === 'expert') {
      const tags = Array.isArray(expertise_tags)
        ? expertise_tags
        : expertise_tags
        ? expertise_tags.split(',').map((t) => t.trim())
        : [];

      profile = await Expert.create({
        user_id: user._id,
        specialization,
        years_experience: years_experience ? Number(years_experience) : 0,
        bio: bio || null,
        location: location || null,
        expertise_tags: tags,
      });
    }

    if (role === 'company') {
      profile = await Company.create({
        owner_user_id: user._id,
        name: company_name,
        address: company_address || null,
        phone: company_phone || null,
        email: company_email || null,
        description: company_description || null,
      });
    }

    if (role === 'delivery') {
      const DeliveryCompany = require('../models/DeliveryCompany');
      profile = await DeliveryCompany.create({
        owner_user_id: user._id,
        name: company_name || `${full_name}'s Delivery Co.`,
        address: company_address || null,
        phone: company_phone || null,
        email: company_email || null,
        description: company_description || null,
      });
    }
  } catch (err) {
    // Clean up the user if profile creation failed
    await User.deleteOne({ _id: user._id });
    throw err;
  }

  return {
    ...buildAuthResponse(user, profile._id),
    profile,
  };
}

// ─── Login ────────────────────────────────────────────────────────────────────

/**
 * Validates credentials and returns a JWT + user data.
 *
 * @param {string} email
 * @param {string} password
 * @returns {{ token, user }}
 */
async function login(email, password) {
  if (!email || !password) {
    throw createError(400, 'Email and password are required');
  }

  // Explicitly select password_hash (it's hidden by default)
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password_hash');
  if (!user) throw createError(401, 'Invalid credentials');
  if (!user.is_active) throw createError(403, 'Account is deactivated');

  const isMatch = await user.comparePassword(password);
  if (!isMatch) throw createError(401, 'Invalid credentials');

  // Update last login timestamp
  user.last_login_at = new Date();
  await user.save();

  // Fetch the role-profile ID for the JWT payload
  let profileId = null;
  if (user.role === 'farmer') {
    const profile = await Farmer.findOne({ user_id: user._id }).select('_id');
    profileId = profile?._id;
  } else if (user.role === 'expert') {
    const profile = await Expert.findOne({ user_id: user._id }).select('_id');
    profileId = profile?._id;
  } else if (user.role === 'company') {
    const profile = await Company.findOne({ owner_user_id: user._id }).select('_id');
    profileId = profile?._id;
  } else if (user.role === 'delivery') {
    const DeliveryCompany = require('../models/DeliveryCompany');
    const profile = await DeliveryCompany.findOne({ owner_user_id: user._id }).select('_id');
    profileId = profile?._id;
  }

  return buildAuthResponse(user, profileId);
}

// ─── Change Password ──────────────────────────────────────────────────────────

/**
 * Validates old password and sets new one.
 *
 * @param {string} userId
 * @param {string} currentPassword
 * @param {string} newPassword
 */
async function changePassword(userId, currentPassword, newPassword) {
  if (!currentPassword || !newPassword) {
    throw createError(400, 'Current and new password are required');
  }
  if (currentPassword === newPassword) {
    throw createError(400, 'New password must differ from current password');
  }
  if (newPassword.length < 8) {
    throw createError(400, 'New password must be at least 8 characters');
  }

  const user = await User.findById(userId).select('+password_hash');
  if (!user) throw createError(404, 'User not found');

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) throw createError(401, 'Current password is incorrect');

  user.password_hash = newPassword; // pre-save hook re-hashes
  await user.save();
}

module.exports = { register, login, changePassword };
