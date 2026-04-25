'use strict';

const Farmer = require('../models/Farmer');
const Field = require('../models/Field');
const User = require('../models/User');
const { createError } = require('../middleware/error.middleware');
const { toMongoImage, toDataUri } = require('../utils/image');

// ─── Profile ──────────────────────────────────────────────────────────────────

async function getProfile(userId) {
  const user = await User.findById(userId);
  if (!user) throw createError(404, 'User not found');

  const farmer = await Farmer.findOne({ user_id: userId });
  if (!farmer) throw createError(404, 'Farmer profile not found');

  return _formatProfile(user, farmer);
}

async function updateProfile(userId, body, file) {
  const user = await User.findById(userId);
  if (!user) throw createError(404, 'User not found');

  const farmer = await Farmer.findOne({ user_id: userId });
  if (!farmer) throw createError(404, 'Farmer profile not found');

  // Update User fields
  const { full_name, phone, location, bio } = body;
  if (full_name) user.full_name = full_name;
  if (phone !== undefined) user.phone = phone;
  if (file) user.avatar = toMongoImage(file);

  // Update Farmer fields
  if (location !== undefined) farmer.location = location;
  if (bio !== undefined) farmer.bio = bio;

  await Promise.all([user.save(), farmer.save()]);

  return _formatProfile(user, farmer);
}

function _formatProfile(user, farmer) {
  return {
    id: farmer._id,
    user_id: user._id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    avatar: toDataUri(user.avatar),
    location: farmer.location,
    bio: farmer.bio,
    joined_at: farmer.joined_at,
    is_active: user.is_active,
    last_login_at: user.last_login_at,
  };
}

// ─── Fields ───────────────────────────────────────────────────────────────────

async function getFields(farmerId) {
  return Field.find({ farmer_id: farmerId }).sort({ created_at: -1 });
}

async function createField(farmerId, body) {
  const { name, crop_type, area_acres, location, crops_count } = body;
  if (!name) throw createError(400, 'Field name is required');

  return Field.create({
    farmer_id: farmerId,
    name,
    crop_type: crop_type || null,
    area_acres: area_acres != null ? Number(area_acres) : null,
    location: location || null,
    crops_count: crops_count != null ? Number(crops_count) : 0,
  });
}

async function updateField(farmerId, fieldId, body) {
  const field = await Field.findOne({ _id: fieldId, farmer_id: farmerId });
  if (!field) throw createError(404, 'Field not found');

  const { name, crop_type, area_acres, location, crops_count } = body;
  if (name !== undefined) field.name = name;
  if (crop_type !== undefined) field.crop_type = crop_type;
  if (area_acres !== undefined) field.area_acres = Number(area_acres);
  if (location !== undefined) field.location = location;
  if (crops_count !== undefined) field.crops_count = Number(crops_count);

  await field.save();
  return field;
}

async function deleteField(farmerId, fieldId) {
  const field = await Field.findOne({ _id: fieldId, farmer_id: farmerId });
  if (!field) throw createError(404, 'Field not found');

  field.deleted_at = new Date();
  await field.save();
}

module.exports = { getProfile, updateProfile, getFields, createField, updateField, deleteField };
