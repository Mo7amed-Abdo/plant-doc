'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/chat.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');
const { uploadOptional } = require('../middleware/upload.middleware');

const isParticipant = [authenticate, requireRole('farmer', 'expert')];
const isExpert = [authenticate, requireRole('expert')];

router.get('/', ...isParticipant, ctrl.getChats);
router.get('/:id', ...isParticipant, ctrl.getChatById);
router.get('/:id/messages', ...isParticipant, ctrl.getMessages);
router.post('/:id/messages', ...isParticipant, uploadOptional('image'), ctrl.sendMessage);
router.put('/:id/resolve', ...isExpert, ctrl.resolveChat);
router.delete('/:id', ...isParticipant, ctrl.deleteChat);

module.exports = router;
