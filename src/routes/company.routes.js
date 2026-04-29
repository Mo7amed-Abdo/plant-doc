'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/company.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');
const { uploadOptional } = require('../middleware/upload.middleware');

const isCompany = [authenticate, requireRole('company')];

// ── Dashboard ─────────────────────────────────────────────────────────────────
// PUT THIS ROUTE BEFORE /profile so it doesn't get swallowed
router.get('/dashboard', ...isCompany, ctrl.getDashboard);

// ── Profile ───────────────────────────────────────────────────────────────────
router.get('/profile', ...isCompany, ctrl.getProfile);
router.put('/profile', ...isCompany, uploadOptional('logo'), ctrl.updateProfile);

// Products, listings, orders, deliveries are mounted as sub-routers in app.js
// under /api/company/... to keep this file focused on profile + dashboard.

module.exports = router;