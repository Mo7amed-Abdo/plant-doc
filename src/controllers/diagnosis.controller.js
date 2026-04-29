'use strict';

const diagnosisService = require('../services/diagnosis.service');
const { success, paginated } = require('../utils/apiResponse');

async function createDiagnosis(req, res, next) {
  try {
    const diagnosis = await diagnosisService.createDiagnosis(
      req.user.userId,
      req.user.profileId,
      req.body,
      req.file
    );
    return success(res, 201, 'Diagnosis created', diagnosis);
  } catch (err) { next(err); }
}

async function getDiagnoses(req, res, next) {
  try {
    const { items, total, page, limit } = await diagnosisService.getDiagnoses(
      req.user.profileId,
      req.query
    );
    return paginated(res, items, total, page, limit, 'Diagnoses fetched');
  } catch (err) { next(err); }
}

async function getDiagnosisById(req, res, next) {
  try {
    const diagnosis = await diagnosisService.getDiagnosisById(
      req.user.profileId,
      req.params.id
    );
    return success(res, 200, 'Diagnosis fetched', diagnosis);
  } catch (err) { next(err); }
}

async function deleteDiagnosis(req, res, next) {
  try {
    await diagnosisService.deleteDiagnosis(req.user.profileId, req.params.id);
    return success(res, 200, 'Diagnosis deleted');
  } catch (err) { next(err); }
}

async function markAsRecovered(req, res, next) {
  try {
    const diagnosis = await diagnosisService.markAsRecovered(req.user.profileId, req.params.id);
    return success(res, 200, 'Diagnosis marked as recovered', diagnosis);
  } catch (err) { next(err); }
}

async function getStats(req, res, next) {
  try {
    const stats = await diagnosisService.getStats(req.user.profileId);

return success(res, 200, 'Stats fetched', stats);
  } catch (err) { next(err); }
}
module.exports = { createDiagnosis, getDiagnoses, getDiagnosisById, deleteDiagnosis, markAsRecovered, getStats };
