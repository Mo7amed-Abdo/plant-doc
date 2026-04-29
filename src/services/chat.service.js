'use strict';

const Chat = require('../models/Chat');
const Message = require('../models/Message');
const Farmer = require('../models/Farmer');
const { createError } = require('../middleware/error.middleware');
const { toMongoImage, toDataUri } = require('../utils/image');
const notificationService = require('./notification.service');

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

async function getChatById(chatId, role, profileId) {
  const chat = await Chat.findById(chatId)
    .populate('farmer_id', 'user_id location')
    .populate('expert_id', 'user_id specialization')
    .populate('treatment_request_id');

  if (!chat) {
    console.error(`[ChatService] getChatById: Chat not found for chatId=${chatId}, role=${role}`);
    throw createError(404, 'Chat not found');
  }

  _assertParticipant(chat, role, profileId);
  console.log(`[ChatService] getChatById: Found chatId=${chatId}, role=${role}`);
  return chat;
}

async function getMessages(chatId, role, profileId, query = {}) {
  if (!chatId) {
    console.error('[ChatService] getMessages: conversationId is missing');
    throw createError(400, 'conversationId is required');
  }

  const chat = await Chat.findById(chatId);
  if (!chat) {
    console.error(`[ChatService] getMessages: Chat not found for conversationId=${chatId}, role=${role}`);
    throw createError(404, 'Chat not found');
  }

  _assertParticipant(chat, role, profileId);
  console.log(`[ChatService] getMessages: conversationId=${chatId}, role=${role}, profileId=${profileId} - fetching from MongoDB`);

  const { page = 1, limit = 50 } = query;
  const skip = (Number(page) - 1) * Number(limit);
  const filter = { chat_id: chatId };

  const [items, total] = await Promise.all([
    Message.find(filter)
      .sort({ sent_at: 1 })
      .skip(skip)
      .limit(Number(limit)),
    Message.countDocuments(filter),
  ]);

  console.log(`[ChatService] getMessages: Found ${items.length} messages (total=${total}) for conversationId=${chatId}`);

  return {
    items: items.map(_formatMessage),
    total,
    page: Number(page),
    limit: Number(limit),
  };
}

async function sendMessage(chatId, senderId, senderRole, senderProfileId, body = {}, file, io = null) {
  if (!chatId) {
    console.error('[ChatService] sendMessage: conversationId is missing');
    throw createError(400, 'conversationId is required');
  }

  const chat = await Chat.findById(chatId);
  if (!chat) {
    console.error(`[ChatService] sendMessage: Chat not found for conversationId=${chatId}`);
    throw createError(404, 'Chat not found');
  }

  _assertParticipant(chat, senderRole, senderProfileId);

  if (chat.is_resolved) {
    throw createError(409, 'This chat has been resolved and is now read-only');
  }

  const contentType = body.content_type || body.messageType || 'text';
  const aiAnalysis = body.ai_analysis || body.aiAnalysis || null;
  const normalizedText = typeof body.text === 'string' ? body.text.trim() : '';
  const mongoImage = file ? toMongoImage(file) : null;
  const imageUrl = mongoImage ? toDataUri(mongoImage) : null;

  if (contentType === 'text' && !normalizedText) {
    throw createError(400, 'text is required for text messages');
  }

  if (contentType === 'image' && !mongoImage) {
    throw createError(400, 'image file is required for image messages');
  }

  const message = await Message.create({
    chat_id: chatId,
    sender_id: senderId,
    sender_role: senderRole,
    content_type: contentType,
    text: normalizedText || null,
    image: mongoImage,
    image_url: imageUrl,
    ai_analysis: aiAnalysis,
    sent_at: new Date(),
  });

  console.log(`[ChatService] sendMessage: message saved successfully - conversationId=${chatId}, messageId=${message._id}, senderRole=${senderRole}, messageType=${contentType}`);

  await Chat.findByIdAndUpdate(chatId, { last_message_at: message.sent_at });

  if (senderRole === 'farmer') {
    const farmer = await Farmer.findById(chat.farmer_id).populate('user_id', 'full_name');
    const farmerName = farmer?.user_id?.full_name || 'Farmer';

    await notificationService.notifyExpert(
      chat.expert_id,
      {
        type: 'unread_chat_message',
        title: `New message from ${farmerName}`,
        body: normalizedText || 'A farmer sent you a new message.',
        related_id: chatId,
        related_conversation_id: chatId,
        related_type: 'chat',
      },
      io
    ).catch(() => null);
  }

  return _formatMessage(message);
}

async function markRead(chatId, role, profileId) {
  const chat = await Chat.findById(chatId);
  if (!chat) throw createError(404, 'Chat not found');

  _assertParticipant(chat, role, profileId);

  await Message.updateMany(
    { chat_id: chatId, sender_role: { $ne: role }, is_read: false },
    { is_read: true }
  );

  if (role === 'expert') {
    await notificationService.markExpertChatNotificationsRead(profileId, chatId).catch(() => null);
  }
}

async function resolveChat(chatId, expertProfileId) {
  const chat = await Chat.findOne({ _id: chatId, expert_id: expertProfileId });
  if (!chat) throw createError(404, 'Chat not found');
  if (chat.is_resolved) throw createError(409, 'Chat is already resolved');

  chat.is_resolved = true;
  await chat.save();
  return chat;
}

function _assertParticipant(chat, role, profileId) {
  const id = profileId?.toString();
  if (!id) throw createError(403, 'Access denied');

  const farmerId = chat.farmer_id?._id
    ? chat.farmer_id._id.toString()
    : chat.farmer_id?.toString();
  const expertId = chat.expert_id?._id
    ? chat.expert_id._id.toString()
    : chat.expert_id?.toString();

  const isParticipant =
    (role === 'farmer' && farmerId === id) ||
    (role === 'expert' && expertId === id);

  if (!isParticipant) throw createError(403, 'Access denied');
}

function _formatMessage(message) {
  const obj = message.toObject ? message.toObject() : message;
  const conversationId = obj.chat_id || obj.conversationId || null;
  const senderId = obj.sender_id || obj.senderId || null;
  const senderRole = obj.sender_role || obj.senderRole || null;
  const messageType = obj.content_type || obj.messageType || 'text';
  const imageUrl = obj.image_url || obj.imageUrl || (obj.image ? toDataUri(obj.image) : null);
  const createdAt = obj.created_at || obj.createdAt || obj.sent_at || null;

  return {
    id: obj._id,
    _id: obj._id,
    conversationId,
    senderId,
    senderRole,
    text: obj.text,
    imageUrl,
    messageType,
    createdAt,
    chat_id: conversationId,
    sender_id: senderId,
    sender_role: senderRole,
    content_type: messageType,
    image: imageUrl,
    ai_analysis: obj.ai_analysis,
    aiAnalysis: obj.ai_analysis,
    is_read: obj.is_read,
    sent_at: obj.sent_at || createdAt,
    created_at: obj.created_at || createdAt,
  };
}

module.exports = { getChats, getChatById, getMessages, sendMessage, markRead, resolveChat };
