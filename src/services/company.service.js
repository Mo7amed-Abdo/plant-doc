'use strict';

const Company = require('../models/Company');
const User = require('../models/User');
const { createError } = require('../middleware/error.middleware');
const { toMongoImage, toDataUri } = require('../utils/image');

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

module.exports = { getProfile, updateProfile };
