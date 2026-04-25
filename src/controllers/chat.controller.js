'use strict';

const chatService = require('../services/chat.service');
const { success, paginated } = require('../utils/apiResponse');

async function getChats(req, res, next) {
  try {
    const { items, total, page, limit } = await chatService.getChats(
      req.user.role,
      req.user.profileId,
      req.query
    );
    return paginated(res, items, total, page, limit, 'Chats fetched');
  } catch (err) { next(err); }
}

async function getChatById(req, res, next) {
  try {
    const chat = await chatService.getChatById(
      req.params.id,
      req.user.role,
      req.user.profileId
    );
    return success(res, 200, 'Chat fetched', chat);
  } catch (err) { next(err); }
}

async function getMessages(req, res, next) {
  try {
    const { items, total, page, limit } = await chatService.getMessages(
      req.params.id,
      req.user.role,
      req.user.profileId,
      req.query
    );
    return paginated(res, items, total, page, limit, 'Messages fetched');
  } catch (err) { next(err); }
}

async function sendMessage(req, res, next) {
  try {
    const message = await chatService.sendMessage(
      req.params.id,
      req.user.userId,
      req.user.role,
      req.body,
      req.file || null
    );

    // Also emit via Socket.IO so real-time clients get it too
    const io = req.app.get('io');
    if (io) io.to(`chat:${req.params.id}`).emit('message:new', message);

    return success(res, 201, 'Message sent', message);
  } catch (err) { next(err); }
}

async function resolveChat(req, res, next) {
  try {
    const chat = await chatService.resolveChat(req.params.id, req.user.profileId);
    const io = req.app.get('io');
    if (io) io.to(`chat:${req.params.id}`).emit('chat:resolved', { chatId: req.params.id });
    return success(res, 200, 'Chat resolved', chat);
  } catch (err) { next(err); }
}

module.exports = { getChats, getChatById, getMessages, sendMessage, resolveChat };
