'use strict';

const mongoose = require('mongoose');
const crypto = require('crypto');
const User = require('../models/User');
const Farmer = require('../models/Farmer');
const Expert = require('../models/Expert');
const Company = require('../models/Company');
const { buildAuthResponse } = require('../utils/jwt');
const { createError } = require('../middleware/error.middleware');
const { toMongoImage } = require('../utils/image');
const env = require('../config/env');

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
  // if (role === 'expert' && !specialization) {
  //   throw createError(400, 'Specialization is required for experts');
  // }
  // if (role === 'company' && !company_name) {
  //   throw createError(400, 'Company name is required');
  // }

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
  specialization: specialization || null,
  years_experience: years_experience ? Number(years_experience) : 0,
  bio: bio || null,
  location: location || null,
  expertise_tags: tags,
});
    }

    if (role === 'company') {
      profile = await Company.create({
  owner_user_id: user._id,
  name: company_name || `${full_name}'s Company`,
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

// ─── Password Reset (dev code return; no email) ───────────────────────────────
function hashResetCode(code) {
  // Pepper with JWT secret so leaked DB hashes are less useful.
  return crypto.createHash('sha256').update(`${code}:${env.JWT_SECRET}`).digest('hex');
}

async function requestPasswordReset(email) {
  if (!email) throw createError(400, 'Email is required');

  const normalized = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalized }).select('_id email');

  // Always return success to avoid user enumeration.
  if (!user) return { sent: true, code: null };

  const code = String(crypto.randomInt(100000, 1000000)); // 6-digit code
  user.password_reset_code_hash = hashResetCode(code);
  user.password_reset_expires_at = new Date(Date.now() + 15 * 60 * 1000); // 15 min
  await user.save();

  return { sent: true, code: env.isDev() ? code : null };
}

async function confirmPasswordReset(email, code, newPassword) {
  if (!email || !code || !newPassword) throw createError(400, 'Email, code, and new password are required');
  if (newPassword.length < 8) throw createError(400, 'New password must be at least 8 characters');

  const normalized = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalized }).select('+password_hash +password_reset_code_hash password_reset_expires_at');
  if (!user) throw createError(400, 'Invalid reset code');

  if (!user.password_reset_code_hash || !user.password_reset_expires_at) {
    throw createError(400, 'Invalid reset code');
  }
  if (new Date(user.password_reset_expires_at).getTime() < Date.now()) {
    throw createError(400, 'Reset code expired');
  }

  const expected = user.password_reset_code_hash;
  const got = hashResetCode(String(code).trim());
  if (expected !== got) throw createError(400, 'Invalid reset code');

  user.password_hash = newPassword; // pre-save hook hashes
  user.password_reset_code_hash = null;
  user.password_reset_expires_at = null;
  await user.save();
  return { reset: true };
}

// ─── Google Sign-In ──────────────────────────────────────────────────────────
async function googleAuth({ credential, role }) {
  if (!credential) throw createError(400, 'Google credential is required');
  // In dev, allow reloading .env without forcing a server restart.
  try { require('dotenv').config(); } catch (_) {}
  const googleClientId = process.env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID;
  if (!googleClientId) throw createError(500, 'Server is missing GOOGLE_CLIENT_ID');

  const { OAuth2Client } = require('google-auth-library');
  const client = new OAuth2Client(googleClientId);
  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: googleClientId,
    });
    payload = ticket.getPayload();
  } catch (_) {
    throw createError(401, 'Invalid Google token');
  }

  const email = payload?.email ? String(payload.email).toLowerCase() : null;
  const sub = payload?.sub ? String(payload.sub) : null;
  const name = payload?.name ? String(payload.name) : null;
  const emailVerified = payload?.email_verified;

  if (!email || !sub) throw createError(401, 'Invalid Google token');
  if (emailVerified === false) throw createError(401, 'Google email is not verified');

  // Existing user: login
  const existing = await User.findOne({ email }).select('full_name email phone role avatar is_active google_sub auth_provider last_login_at');
  if (existing) {
    if (!existing.is_active) throw createError(403, 'Account is deactivated');

    existing.last_login_at = new Date();
    if (!existing.google_sub) existing.google_sub = sub;
    if (existing.auth_provider !== 'google') existing.auth_provider = 'google';
    await existing.save();

    // fetch profile id to keep JWT payload consistent
    let profileId = null;
    if (existing.role === 'farmer') {
      const profile = await Farmer.findOne({ user_id: existing._id }).select('_id');
      profileId = profile?._id;
    } else if (existing.role === 'expert') {
      const profile = await Expert.findOne({ user_id: existing._id }).select('_id');
      profileId = profile?._id;
    } else if (existing.role === 'company') {
      const profile = await Company.findOne({ owner_user_id: existing._id }).select('_id');
      profileId = profile?._id;
    } else if (existing.role === 'delivery') {
      const DeliveryCompany = require('../models/DeliveryCompany');
      const profile = await DeliveryCompany.findOne({ owner_user_id: existing._id }).select('_id');
      profileId = profile?._id;
    }

    return buildAuthResponse(existing, profileId);
  }

  // New user: allowed only when role is provided (register flow)
  const validRoles = ['farmer', 'expert', 'company', 'delivery'];
  if (!validRoles.includes(role)) {
    throw createError(404, 'Account not found. Please register first.');
  }

  const user = await User.create({
    full_name: name || 'Google User',
    email,
    phone: null,
    password_hash: crypto.randomBytes(24).toString('hex'), // unused; still required by schema
    role,
    auth_provider: 'google',
    google_sub: sub,
  });

  let profile = null;
  if (role === 'farmer') {
    profile = await Farmer.create({ user_id: user._id, location: null, bio: null });
  } else if (role === 'expert') {
    profile = await Expert.create({ user_id: user._id, specialization: null, years_experience: 0, bio: null, location: null, expertise_tags: [] });
  } else if (role === 'company') {
    profile = await Company.create({ owner_user_id: user._id, name: `${user.full_name}'s Company`, address: null, phone: null, email: null, description: null });
  } else if (role === 'delivery') {
    const DeliveryCompany = require('../models/DeliveryCompany');
    profile = await DeliveryCompany.create({ owner_user_id: user._id, name: `${user.full_name}'s Delivery Co.`, address: null, phone: null, email: null, description: null });
  }

  return {
    ...buildAuthResponse(user, profile?._id),
    profile,
  };
}

module.exports = { register, login, changePassword, requestPasswordReset, confirmPasswordReset, googleAuth };
