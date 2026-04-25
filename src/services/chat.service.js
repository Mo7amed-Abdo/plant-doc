'use strict';

const Chat = require('../models/Chat');
const Message = require('../models/Message');
const { createError } = require('../middleware/error.middleware');
const { toMongoImage, toDataUri } = require('../utils/image');

// ─── List chats for the authenticated user ────────────────────────────────────

async function getChats(role, profileId, query) {
  const { page = 1, limit = 20 } = query;
  const skip = (Number(page) - 1) * Number(limit);

  const filter = role === 'farmer'
    ? { farmer_id: profileId }
    : { expert_id: profileId };

  const [items, total] = await Promise.all([
    Chat.find(filter)
      .populate('farmer_id', 'user_id location')
      .populate('expert_id', 'user_id specialization')
      .populate('treatment_request_id', 'priority status')
      .sort({ last_message_at: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Chat.countDocuments(filter),
  ]);

  return { items, total, page: Number(page), limit: Number(limit) };
}

// ─── Get single chat (participant only) ──────────────────────────────────────

async function getChatById(chatId, role, profileId) {
  const chat = await Chat.findById(chatId)
    .populate('farmer_id', 'user_id location')
    .populate('expert_id', 'user_id specialization')
    .populate('treatment_request_id');

  if (!chat) throw createError(404, 'Chat not found');
  _assertParticipant(chat, role, profileId);
  return chat;
}

// ─── Paginated message history ────────────────────────────────────────────────

async function getMessages(chatId, role, profileId, query) {
  const chat = await Chat.findById(chatId);
  if (!chat) throw createError(404, 'Chat not found');
  _assertParticipant(chat, role, profileId);

  const { page = 1, limit = 50 } = query;
  const skip = (Number(page) - 1) * Number(limit);

  const [items, total] = await Promise.all([
    Message.find({ chat_id: chatId })
      .sort({ sent_at: 1 })
      .skip(skip)
      .limit(Number(limit)),
    Message.countDocuments({ chat_id: chatId }),
  ]);

  return {
    items: items.map(_formatMessage),
    total,
    page: Number(page),
    limit: Number(limit),
  };
}

// ─── Send a message (REST fallback) ──────────────────────────────────────────

async function sendMessage(chatId, senderId, senderRole, body, file) {
  const chat = await Chat.findById(chatId);
  if (!chat) throw createError(404, 'Chat not found');
  if (chat.is_resolved) throw createError(409, 'This chat has been resolved and is now read-only');

  const { content_type = 'text', text, ai_analysis } = body;

  if (content_type === 'text' && !text?.trim()) {
    throw createError(400, 'text is required for text messages');
  }
  if (content_type === 'image' && !file) {
    throw createError(400, 'image file is required for image messages');
  }

  const message = await Message.create({
    chat_id: chatId,
    sender_id: senderId,
    sender_role: senderRole,
    content_type,
    text: text || null,
    image: file ? toMongoImage(file) : null,
    ai_analysis: ai_analysis || null,
    sent_at: new Date(),
  });

  // Keep chat.last_message_at fresh for sorting
  await Chat.findByIdAndUpdate(chatId, { last_message_at: message.sent_at });

  return _formatMessage(message);
}

// ─── Mark messages as read ────────────────────────────────────────────────────

async function markRead(chatId, role, profileId) {
  const chat = await Chat.findById(chatId);
  if (!chat) throw createError(404, 'Chat not found');
  _assertParticipant(chat, role, profileId);

  // Mark all messages NOT sent by me as read
  await Message.updateMany(
    { chat_id: chatId, sender_role: { $ne: role }, is_read: false },
    { is_read: true }
  );
}

// ─── Expert resolves chat ─────────────────────────────────────────────────────

async function resolveChat(chatId, expertProfileId) {
  const chat = await Chat.findOne({ _id: chatId, expert_id: expertProfileId });
  if (!chat) throw createError(404, 'Chat not found');
  if (chat.is_resolved) throw createError(409, 'Chat is already resolved');

  chat.is_resolved = true;
  await chat.save();
  return chat;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _assertParticipant(chat, role, profileId) {
  const id = profileId.toString();
  const isParticipant =
    (role === 'farmer' && chat.farmer_id.toString() === id) ||
    (role === 'expert' && chat.expert_id.toString() === id);

  if (!isParticipant) throw createError(403, 'Access denied');
}

function _formatMessage(msg) {
  const obj = msg.toObject ? msg.toObject() : msg;
  return {
    id: obj._id,
    chat_id: obj.chat_id,
    sender_id: obj.sender_id,
    sender_role: obj.sender_role,
    content_type: obj.content_type,
    text: obj.text,
    image: obj.image ? toDataUri(obj.image) : null,
    ai_analysis: obj.ai_analysis,
    is_read: obj.is_read,
    sent_at: obj.sent_at,
  };
}

module.exports = { getChats, getChatById, getMessages, sendMessage, markRead, resolveChat };
