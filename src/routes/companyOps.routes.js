'use strict';

const router = require('express').Router();
const productCtrl = require('../controllers/product.controller');
const orderCtrl = require('../controllers/order.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');
const { uploadSingle } = require('../middleware/upload.middleware');

const isCompany = [authenticate, requireRole('company')];

// ─── Listings ─────────────────────────────────────────────────────────────────
router.get('/listings',         ...isCompany, productCtrl.getCompanyListings);
router.post('/listings',        ...isCompany, productCtrl.createListing);
router.put('/listings/:id',     ...isCompany, productCtrl.updateListing);
router.delete('/listings/:id',  ...isCompany, productCtrl.deleteListing);

// ─── Orders ───────────────────────────────────────────────────────────────────
router.get('/orders',           ...isCompany, orderCtrl.getCompanyOrders);
router.get('/orders/:id',       ...isCompany, orderCtrl.getCompanyOrderById);
router.put('/orders/:id/status',...isCompany, orderCtrl.updateOrderStatus);

// ─── Deliveries ───────────────────────────────────────────────────────────────
router.post('/orders/:id/delivery',               ...isCompany, orderCtrl.createDelivery);
router.get('/deliveries',                         ...isCompany, orderCtrl.getCompanyDeliveries);
router.get('/deliveries/:id',                     ...isCompany, orderCtrl.getCompanyDeliveryById);
router.put('/deliveries/:id/status',              ...isCompany, orderCtrl.updateDeliveryStatus);
router.put('/deliveries/:id/proof',               ...isCompany, uploadSingle('proof'), orderCtrl.uploadProofOfDelivery);

module.exports = router;
