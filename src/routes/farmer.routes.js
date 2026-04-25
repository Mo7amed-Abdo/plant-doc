'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/farmer.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');
const { uploadOptional } = require('../middleware/upload.middleware');

const isFarmer = [authenticate, requireRole('farmer')];

// Profile
router.get('/profile',    ...isFarmer, ctrl.getProfile);
router.put('/profile',    ...isFarmer, uploadOptional('avatar'), ctrl.updateProfile);

// Fields
router.get('/fields',         ...isFarmer, ctrl.getFields);
router.post('/fields',        ...isFarmer, ctrl.createField);
router.put('/fields/:id',     ...isFarmer, ctrl.updateField);
router.delete('/fields/:id',  ...isFarmer, ctrl.deleteField);

module.exports = router;
