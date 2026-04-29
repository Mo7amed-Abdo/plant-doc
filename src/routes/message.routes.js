'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/chat.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');

const isParticipant = [authenticate, requireRole('farmer', 'expert')];

router.get('/:conversationId', ...isParticipant, ctrl.getMessages);

module.exports = router;
