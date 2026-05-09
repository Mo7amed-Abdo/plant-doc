'use strict';

const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const feedbackController = require('../controllers/feedback.controller');

router.post('/plantdoc', authenticate, feedbackController.createPlantDocFeedback);
router.get('/plantdoc/recent', feedbackController.listRecentPlantDocFeedback);

module.exports = router;
