'use strict';

const multer = require('multer');
const env = require('../config/env');
const { createError } = require('./error.middleware');

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/**
 * Multer instance — stores files in memory (we convert to BinData for MongoDB).
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_IMAGE_SIZE,
  },
  fileFilter(req, file, cb) {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(
        createError(400, `Unsupported file type. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`)
      );
    }
    cb(null, true);
  },
});

/**
 * Single-image upload middleware.
 * Field name is configurable (defaults to 'image').
 *
 * After this middleware runs, req.file is available.
 * Use imageUtils.toMongoImage(req.file) to get the { data, content_type } object.
 *
 * Usage:
 *   router.post('/route', authenticate, uploadSingle('avatar'), controller)
 */
function uploadSingle(fieldName = 'image') {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (err) return next(err);
      next();
    });
  };
}

/**
 * Optional single-image upload — doesn't fail if no file is sent.
 */
function uploadOptional(fieldName = 'image') {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (err && err.code !== 'LIMIT_UNEXPECTED_FILE') return next(err);
      next();
    });
  };
}

module.exports = { uploadSingle, uploadOptional };
