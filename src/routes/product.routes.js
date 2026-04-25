'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/product.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');
const { uploadOptional } = require('../middleware/upload.middleware');

// Public — no auth needed
router.get('/', ctrl.getProducts);
router.get('/:id', ctrl.getProductById);

// Company only — add a product to the master catalog
router.post(
  '/',
  authenticate,
  requireRole('company'),
  uploadOptional('default_image'),
  ctrl.createProduct
);

module.exports = router;
