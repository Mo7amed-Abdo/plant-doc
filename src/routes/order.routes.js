'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/order.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');

const isFarmer = [authenticate, requireRole('farmer')];

// Farmer: their orders
router.get('/',    ...isFarmer, ctrl.getFarmerOrders);
router.get('/:id', ...isFarmer, ctrl.getFarmerOrderById);

// Farmer: track the delivery on a specific order
router.get('/:id/delivery', ...isFarmer, ctrl.getFarmerDelivery);

module.exports = router;
