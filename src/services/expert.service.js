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

  return formatProfile(user, expert);
}

async function updateProfile(userId, body, file) {
  const user = await User.findById(userId);
  if (!user) throw createError(404, 'User not found');

  const expert = await Expert.findOne({ user_id: userId });
  if (!expert) throw createError(404, 'Expert profile not found');

  console.log('[expert.updateProfile] userId:', userId.toString());
  console.log('[expert.updateProfile] body:', body);
  console.log(
    '[expert.updateProfile] file:',
    file
      ? {
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
        }
      : null
  );

  const { full_name, phone, bio, location, years_experience, expertise_tags } = body;
  const userUpdate = {};
  const expertUpdate = {};

  if (full_name !== undefined) userUpdate.full_name = normalizeRequiredString(full_name, 'full_name');
  if (phone !== undefined) userUpdate.phone = normalizeNullableString(phone);
  if (file) userUpdate.avatar = toMongoImage(file);

  if (bio !== undefined) expertUpdate.bio = normalizeNullableString(bio);
  if (location !== undefined) expertUpdate.location = normalizeNullableString(location);
  if (years_experience !== undefined) expertUpdate.years_experience = normalizeExperience(years_experience);
  if (expertise_tags !== undefined) expertUpdate.expertise_tags = normalizeExpertiseTags(expertise_tags);

  const [updatedUser, updatedExpert] = await Promise.all([
    Object.keys(userUpdate).length
      ? User.findByIdAndUpdate(userId, userUpdate, { new: true, runValidators: true })
      : User.findById(userId),
    Object.keys(expertUpdate).length
      ? Expert.findOneAndUpdate({ user_id: userId }, expertUpdate, { new: true, runValidators: true })
      : Expert.findOne({ user_id: userId }),
  ]);

  console.log('[expert.updateProfile] updatedProfile:', {
    userId: updatedUser?._id?.toString?.(),
    expertId: updatedExpert?._id?.toString?.(),
    full_name: updatedUser?.full_name,
    phone: updatedUser?.phone,
    specialization: updatedExpert?.specialization,
    years_experience: updatedExpert?.years_experience,
    hasAvatar: Boolean(updatedUser?.avatar),
  });

  return formatProfile(updatedUser, updatedExpert);
}

function formatProfile(user, expert) {
  const avatar = toDataUri(user.avatar);

  return {
    id: expert._id,
    user_id: user._id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    avatar: avatar,
    profileImage: avatar,
    imageUrl: avatar,
    specialization: expert.specialization,
    years_experience: expert.years_experience,
    bio: expert.bio,
    location: expert.location,
    expertise_tags: expert.expertise_tags,
    cases_reviewed: expert.cases_reviewed,
    accuracy_rate: expert.accuracy_rate,
    is_verified: expert.is_verified,
    last_login_at: user.last_login_at,
    created_at: expert.created_at,
    updated_at: expert.updated_at,
  };
}

function normalizeNullableString(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed || null;
}

function normalizeRequiredString(value, fieldName) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) throw createError(400, `${fieldName} cannot be empty`);
  return trimmed;
}

function normalizeExperience(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw createError(400, 'years_experience must be a valid non-negative number');
  }

  return parsed;
}

function normalizeExpertiseTags(value) {
  let tags = value;

  if (!Array.isArray(tags) && typeof tags === 'string') {
    const trimmed = tags.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        tags = JSON.parse(trimmed);
      } catch (_) {
        tags = trimmed;
      }
    }
  }

  tags = Array.isArray(tags)
    ? tags
    : String(tags || '')
        .split(',')
        .map((tag) => tag.trim());

  return tags.filter(Boolean);
}

module.exports = { getProfile, updateProfile };
