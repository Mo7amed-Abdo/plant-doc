'use strict';

const FarmerNotification = require('../models/notifications/FarmerNotification');
const ExpertNotification = require('../models/notifications/ExpertNotification');
const CompanyNotification = require('../models/notifications/CompanyNotification');

async function _create(Model, payload, roomIds, io) {
  const notification = await Model.create(payload);

  if (io) {
    const eventPayload = {
      id: notification._id,
      _id: notification._id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      message: notification.body,
      related_id: notification.related_id,
      related_type: notification.related_type,
      relatedCaseId: notification.related_case_id || null,
      relatedConversationId: notification.related_conversation_id || null,
      is_read: false,
      isRead: false,
      created_at: notification.created_at,
      createdAt: notification.created_at,
    };

    for (const roomId of roomIds.filter(Boolean)) {
      io.to(roomId).emit('notification:new', eventPayload);
    }
  }

  return notification;
}

async function notifyFarmer(farmerId, userId, payload, io) {
  return _create(
    FarmerNotification,
    { farmer_id: farmerId, ...payload },
    [`user:${userId}`, `farmer:${farmerId}`],
    io
  );
}

async function notifyExpert(expertId, payload, io, options = {}) {
  return _create(
    ExpertNotification,
    { expert_id: expertId, user_role: 'expert', ...payload },
    [`expert:${expertId}`],
    io
  );
}

async function notifyCompany(companyId, userId, payload, io) {
  return _create(
    CompanyNotification,
    { company_id: companyId, ...payload },
    [`user:${userId}`, `company:${companyId}`],
    io
  );
}

async function markExpertNotificationRead(expertId, notificationId) {
  return ExpertNotification.findOneAndUpdate(
    { _id: notificationId, expert_id: expertId },
    { is_read: true },
    { new: true }
  );
}

async function markAllExpertNotificationsRead(expertId) {
  return ExpertNotification.updateMany(
    { expert_id: expertId, is_read: false },
    { is_read: true }
  );
}

async function markExpertChatNotificationsRead(expertId, conversationId) {
  return ExpertNotification.updateMany(
    {
      expert_id: expertId,
      type: 'unread_chat_message',
      related_conversation_id: conversationId,
      is_read: false,
    },
    { is_read: true }
  );
}

async function markFarmerChatNotificationsRead(farmerId, conversationId) {
  return FarmerNotification.updateMany(
    {
      farmer_id: farmerId,
      type: 'expert_reply',
      related_type: 'chat',
      related_id: conversationId,
      is_read: false,
    },
    { is_read: true }
  );
}

async function markPendingCaseNotificationsResolved(caseId) {
  return ExpertNotification.updateMany(
    {
      type: 'new_pending_case',
      related_case_id: caseId,
      is_read: false,
    },
    { is_read: true }
  );
}

module.exports = {
  notifyFarmer,
  notifyExpert,
  notifyCompany,
  markExpertNotificationRead,
  markAllExpertNotificationsRead,
  markExpertChatNotificationsRead,
  markFarmerChatNotificationsRead,
  markPendingCaseNotificationsResolved,
};
