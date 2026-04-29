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
    const conversationId = resolveConversationId(req);
    const { items, total, page, limit } = await chatService.getMessages(
      conversationId,
      req.user.role,
      req.user.profileId,
      req.query
    );
    await chatService.markRead(conversationId, req.user.role, req.user.profileId).catch(() => null);
    console.log(`[ChatController] messages fetched successfully after refresh - conversationId=${conversationId}, role=${req.user.role}, messages=${items.length}, total=${total}`);
    return paginated(res, items, total, page, limit, 'Messages fetched');
  } catch (err) { next(err); }
}

async function sendMessage(req, res, next) {
  try {
    const conversationId = req.params.id;
    const message = await chatService.sendMessage(
      conversationId,
      req.user.userId,
      req.user.role,
      req.user.profileId,
      req.body,
      req.file || null,
      req.app.get('io')
    );

    console.log(`[ChatController] message saved successfully - conversationId=${conversationId}, messageId=${message.id}, role=${req.user.role}`);

    // Also emit via Socket.IO so real-time clients get it too
    const io = req.app.get('io');
    if (io) {
      io.to(`chat:${conversationId}`).emit('message:new', message);
      console.log(`[ChatController] Emitted message:new to chat:${conversationId}`);
    }

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

function resolveConversationId(req) {
  return req.params.conversationId || req.params.id;
}

module.exports = { getChats, getChatById, getMessages, sendMessage, resolveChat };
