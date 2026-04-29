'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/treatmentRequest.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');

const isExpert = [authenticate, requireRole('expert')];

router.get('/pending', ...isExpert, ctrl.getPendingCases);
router.get('/reviewed-today', ...isExpert, ctrl.getReviewedToday);
router.get('/validated', ...isExpert, ctrl.getRecentValidatedCases);
router.get('/', ...isExpert, ctrl.getExpertCases);

module.exports = router;
