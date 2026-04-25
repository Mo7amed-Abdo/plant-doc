'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/product.controller');

// Public browse
router.get('/', ctrl.getListings);
router.get('/:id', ctrl.getListingById);

module.exports = router;
