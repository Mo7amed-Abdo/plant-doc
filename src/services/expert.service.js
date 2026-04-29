'use strict';

const Expert = require('../models/Expert');
const User = require('../models/User');
const { createError } = require('../middleware/error.middleware');
const { toMongoImage, toDataUri } = require('../utils/image');

async function getProfile(userId) {
  const user = await User.findById(userId);
  if (!user) throw createError(404, 'User not found');

  const expert = await Expert.findOne({ user_id: userId });
  if (!expert) throw createError(404, 'Expert profile not found');

  return _formatProfile(user, expert);
}

async function updateProfile(userId, body, file) {
  const user = await User.findById(userId);
  if (!user) throw createError(404, 'User not found');

  const expert = await Expert.findOne({ user_id: userId });
  if (!expert) throw createError(404, 'Expert profile not found');

  const { full_name, phone, bio, location, years_experience, expertise_tags } = body;

  // User fields
  if (full_name) user.full_name = full_name;
  if (phone !== undefined) user.phone = phone;
  if (file) user.avatar = toMongoImage(file);

  // Expert fields — specialization is LOCKED after creation, not updatable
  if (bio !== undefined) expert.bio = bio;
  if (location !== undefined) expert.location = location;
  if (years_experience !== undefined) expert.years_experience = Number(years_experience);
  if (expertise_tags !== undefined) {
    expert.expertise_tags = Array.isArray(expertise_tags)
      ? expertise_tags
      : expertise_tags.split(',').map((t) => t.trim());
  }

  await Promise.all([user.save(), expert.save()]);
  return _formatProfile(user, expert);
}

function _formatProfile(user, expert) {
  return {
    id: expert._id,
    user_id: user._id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    avatar: toDataUri(user.avatar),
    //: expert.specialization,
    years_experience: expert.years_experience,
    bio: expert.bio,
    location: expert.location,
    expertise_tags: expert.expertise_tags,
    cases_reviewed: expert.cases_reviewed,
    accuracy_rate: expert.accuracy_rate,
    is_verified: expert.is_verified,
    last_login_at: user.last_login_at,
  };
}

module.exports = { getProfile, updateProfile };
