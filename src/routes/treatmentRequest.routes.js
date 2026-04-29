'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/treatmentRequest.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');

const isFarmer = [authenticate, requireRole('farmer')];
const isExpert = [authenticate, requireRole('expert')];
const isParticipant = [authenticate, requireRole('farmer', 'expert')];

// Farmer: create a request from a diagnosis
router.post('/', ...isFarmer, ctrl.createRequest);

// Farmer: list own requests
router.get('/my', ...isFarmer, ctrl.getFarmerRequests);

// Expert: browse the open pool
router.get('/pool', ...isExpert, ctrl.getPool);

// Expert: dashboard case data
router.get('/reviewed-today', ...isExpert, ctrl.getReviewedToday);
router.get('/validated', ...isExpert, ctrl.getRecentValidatedCases);
router.get('/expert/cases', ...isExpert, ctrl.getExpertCases);

// Expert: self-assign a case
router.post('/:id/assign', ...isExpert, ctrl.assignToExpert);

// Farmer or assigned Expert: view a single request
router.get('/:id', ...isParticipant, ctrl.getRequestById);

// Expert: submit review and close case
router.post('/:id/review', ...isExpert, ctrl.submitReview);

module.exports = router;
