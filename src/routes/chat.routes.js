'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/chat.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');
const { uploadOptional } = require('../middleware/upload.middleware');

const isParticipant = [authenticate, requireRole('farmer', 'expert')];
const isExpert = [authenticate, requireRole('expert')];

// List all chats for the current user
router.get('/', ...isParticipant, ctrl.getChats);

// Get a single chat
router.get('/:id', ...isParticipant, ctrl.getChatById);

// Get paginated message history
router.get('/:id/messages', ...isParticipant, ctrl.getMessages);

// Send a message (REST fallback — Socket.IO is preferred for text messages)
router.post('/:id/messages', ...isParticipant, uploadOptional('image'), ctrl.sendMessage);

// Expert resolves a chat
router.put('/:id/resolve', ...isExpert, ctrl.resolveChat);

module.exports = router;
