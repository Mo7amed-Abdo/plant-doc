'use strict';

const farmerService = require('../services/farmer.service');
const { success } = require('../utils/apiResponse');

async function getProfile(req, res, next) {
  try {
    const profile = await farmerService.getProfile(req.user.userId);
    return success(res, 200, 'Profile fetched', profile);
  } catch (err) { next(err); }
}

async function updateProfile(req, res, next) {
  try {
    const profile = await farmerService.updateProfile(req.user.userId, req.body, req.file);
    return success(res, 200, 'Profile updated', profile);
  } catch (err) { next(err); }
}

async function getFields(req, res, next) {
  try {
    const fields = await farmerService.getFields(req.user.profileId);
    return success(res, 200, 'Fields fetched', fields);
  } catch (err) { next(err); }
}

async function createField(req, res, next) {
  try {
    const field = await farmerService.createField(req.user.profileId, req.body);
    return success(res, 201, 'Field created', field);
  } catch (err) { next(err); }
}

async function updateField(req, res, next) {
  try {
    const field = await farmerService.updateField(req.user.profileId, req.params.id, req.body);
    return success(res, 200, 'Field updated', field);
  } catch (err) { next(err); }
}

async function deleteField(req, res, next) {
  try {
    await farmerService.deleteField(req.user.profileId, req.params.id);
    return success(res, 200, 'Field deleted');
  } catch (err) { next(err); }
}

module.exports = { getProfile, updateProfile, getFields, createField, updateField, deleteField };
