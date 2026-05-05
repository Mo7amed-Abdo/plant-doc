'use strict';

const { success } = require('../utils/apiResponse');
const service = require('../services/diseaseGuide.service');

async function importDiseaseGuides(req, res, next) {
  try {
    const text =
      (req.file && req.file.buffer ? req.file.buffer.toString('utf8') : null) ||
      (typeof req.body?.text === 'string' ? req.body.text : null);

    const result = await service.importDiseaseGuidesFromText(text, {
      source: req.file?.originalname || req.body?.source || 'manual',
    });

    return success(res, 200, 'Disease guides imported', result);
  } catch (err) { next(err); }
}

module.exports = { importDiseaseGuides };

