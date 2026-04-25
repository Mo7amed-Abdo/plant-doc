'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const chatService = require('./chat.service');

/**
 * Wires all Socket.IO events onto the server instance.
 * Call this once from server.js after `io` is created.
 *
 * @param {import('socket.io').Server} io
 */
function initSocketService(io) {

  // ── Auth middleware for Socket.IO ──────────────────────────────────────────
  // Every connecting socket must send a valid JWT as:
  //   socket = io('...', { auth: { token: '<jwt>' } })
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET);
      socket.user = decoded; // { userId, role, profileId }
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const { userId, role, profileId } = socket.user;

    if (env.isDev()) {
      console.log(`[Socket.IO] ${role} connected — userId: ${userId} socketId: ${socket.id}`);
    }

    // ── Join personal notification room ───────────────────────────────────────
    // Notifications are pushed to "user:<userId>"
    socket.join(`user:${userId}`);

    // ── Join a chat room ──────────────────────────────────────────────────────
    // Client emits: { chatId: '<id>' }
    socket.on('chat:join', async ({ chatId }) => {
      if (!chatId) return;
      try {
        // Verify participant before allowing join
        const chat = await require('../models/Chat').findById(chatId);
        if (!chat) return socket.emit('error', { message: 'Chat not found' });

        const isParticipant =
          (role === 'farmer' && chat.farmer_id.toString() === profileId) ||
          (role === 'expert' && chat.expert_id.toString() === profileId);

        if (!isParticipant) return socket.emit('error', { message: 'Access denied' });

        socket.join(`chat:${chatId}`);
        socket.emit('chat:joined', { chatId });

        if (env.isDev()) console.log(`[Socket.IO] ${role} joined chat:${chatId}`);
      } catch (err) {
        socket.emit('error', { message: 'Failed to join chat' });
      }
    });

    // ── Send a real-time message ───────────────────────────────────────────────
    // Client emits: { chatId, content_type, text?, ai_analysis? }
    // (image messages use the REST endpoint — too large for websocket)
    socket.on('message:send', async (data) => {
      const { chatId, content_type = 'text', text, ai_analysis } = data;
      if (!chatId) return;

      try {
        const message = await chatService.sendMessage(
          chatId,
          userId,
          role,
          { content_type, text, ai_analysis },
          null // no file via socket
        );

        // Broadcast to everyone in the room (including sender for confirmation)
        io.to(`chat:${chatId}`).emit('message:new', message);
      } catch (err) {
        socket.emit('error', { message: err.message || 'Failed to send message' });
      }
    });

    // ── Mark messages read ─────────────────────────────────────────────────────
    // Client emits: { chatId }
    socket.on('message:read', async ({ chatId }) => {
      if (!chatId) return;
      try {
        await chatService.markRead(chatId, role, profileId);
        // Notify the other participant that messages were read
        socket.to(`chat:${chatId}`).emit('message:read', { chatId, reader_role: role });
      } catch {
        // Silently ignore read errors
      }
    });

    // ── Expert resolves chat ───────────────────────────────────────────────────
    // Client emits: { chatId }
    socket.on('chat:resolve', async ({ chatId }) => {
      if (role !== 'expert') return socket.emit('error', { message: 'Only experts can resolve chats' });
      try {
        await chatService.resolveChat(chatId, profileId);
        io.to(`chat:${chatId}`).emit('chat:resolved', { chatId });
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    // ── Disconnect ─────────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      if (env.isDev()) {
        console.log(`[Socket.IO] ${role} disconnected — userId: ${userId}`);
      }
    });
  });
}

module.exports = { initSocketService };
