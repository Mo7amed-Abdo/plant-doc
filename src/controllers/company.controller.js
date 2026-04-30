'use strict';

const companyService = require('../services/company.service');
const { success } = require('../utils/apiResponse');

async function getProfile(req, res, next) {
  try {
    const profile = await companyService.getProfile(req.user.userId);
    return success(res, 200, 'Profile fetched', profile);
  } catch (err) { next(err); }
}

async function updateProfile(req, res, next) {
  try {
    const profile = await companyService.updateProfile(req.user.userId, req.body, req.file);
    return success(res, 200, 'Profile updated', profile);
  } catch (err) { next(err); }
}

async function getDashboard(req, res, next) {
  try {
    // req.user.profileId is the Company document _id set by the JWT
    const data = await companyService.getDashboard(req.user.profileId);
    return success(res, 200, 'Dashboard data fetched', data);
  } catch (err) { next(err); }
}

async function listDeliveryCompanies(req, res, next) {
  try {
    const data = await companyService.listDeliveryCompanies();
    return success(res, 200, 'Delivery companies fetched', data);
  } catch (err) { next(err); }
}

module.exports = { getProfile, updateProfile, getDashboard, listDeliveryCompanies };
