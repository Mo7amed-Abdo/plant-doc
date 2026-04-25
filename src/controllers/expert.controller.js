'use strict';

const expertService = require('../services/expert.service');
const { success } = require('../utils/apiResponse');

async function getProfile(req, res, next) {
  try {
    const profile = await expertService.getProfile(req.user.userId);
    return success(res, 200, 'Profile fetched', profile);
  } catch (err) { next(err); }
}

async function updateProfile(req, res, next) {
  try {
    const profile = await expertService.updateProfile(req.user.userId, req.body, req.file);
    return success(res, 200, 'Profile updated', profile);
  } catch (err) { next(err); }
}

module.exports = { getProfile, updateProfile };
