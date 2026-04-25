'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/diagnosis.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');
const { uploadSingle } = require('../middleware/upload.middleware');

const isFarmer = [authenticate, requireRole('farmer')];

router.post('/',     ...isFarmer, uploadSingle('plant_image'), ctrl.createDiagnosis);
router.get('/',      ...isFarmer, ctrl.getDiagnoses);
router.get('/:id',   ...isFarmer, ctrl.getDiagnosisById);
router.delete('/:id',...isFarmer, ctrl.deleteDiagnosis);

module.exports = router;
