'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/expert.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');
const { uploadOptional } = require('../middleware/upload.middleware');

const isExpert = [authenticate, requireRole('expert')];

router.get('/profile', ...isExpert, ctrl.getProfile);
router.put('/profile', ...isExpert, uploadOptional('avatar'), ctrl.updateProfile);

module.exports = router;
