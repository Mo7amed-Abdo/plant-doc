'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/diagnosis.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');
const { uploadSingle } = require('../middleware/upload.middleware');

const isFarmer = [authenticate, requireRole('farmer')];

router.post('/',     ...isFarmer, uploadSingle('plant_image'), ctrl.createDiagnosis);
router.get('/',      ...isFarmer, ctrl.getDiagnoses);
router.get('/stats', ...isFarmer, ctrl.getStats);
router.get('/:id',   ...isFarmer, ctrl.getDiagnosisById);
router.patch('/:id/recover', ...isFarmer, ctrl.markAsRecovered);
router.delete('/:id',...isFarmer, ctrl.deleteDiagnosis);
// router.get('/stats', ...isFarmer, ctrl.getDashboardStats);

module.exports = router;
