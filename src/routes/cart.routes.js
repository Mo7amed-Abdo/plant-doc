'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/cart.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');

const isFarmer = [authenticate, requireRole('farmer')];

router.get('/',                           ...isFarmer, ctrl.getCart);
router.post('/items',                     ...isFarmer, ctrl.addToCart);
router.put('/items/:listingId',           ...isFarmer, ctrl.updateCartItem);
router.delete('/items/:listingId',        ...isFarmer, ctrl.removeFromCart);
router.post('/checkout',                  ...isFarmer, ctrl.checkout);

module.exports = router;
