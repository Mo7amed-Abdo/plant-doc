'use strict';

const router = require('express').Router();
const multer = require('multer');
const ctrl = require('../controllers/diseaseGuide.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');
const { createError } = require('../middleware/error.middleware');

// Keep import restricted (server also supports auto-import on startup).
const isCompany = [authenticate, requireRole('company')];

const uploadText = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter(req, file, cb) {
    const ok = file.mimetype === 'text/plain' || file.mimetype === 'application/octet-stream';
    if (!ok) return cb(createError(400, 'Only .txt files are allowed'));
    cb(null, true);
  },
});

router.post('/import', ...isCompany, uploadText.single('guide_file'), ctrl.importDiseaseGuides);

module.exports = router;
