'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/company.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');
const { uploadOptional } = require('../middleware/upload.middleware');

const isCompany = [authenticate, requireRole('company')];

// Profile
router.get('/profile', ...isCompany, ctrl.getProfile);
router.put('/profile', ...isCompany, uploadOptional('logo'), ctrl.updateProfile);

// Products, listings, orders, deliveries are mounted as sub-routers in app.js
// under /api/company/... to keep this file focused on profile only.

module.exports = router;
