'use strict';

const FarmerNotification = require('../models/notifications/FarmerNotification');
const ExpertNotification = require('../models/notifications/ExpertNotification');
const CompanyNotification = require('../models/notifications/CompanyNotification');

/**
 * Internal helper — creates a notification doc and emits it over Socket.IO.
 *
 * @param {Object} Model      - Mongoose model to save into
 * @param {Object} payload    - Document fields (without _id / timestamps)
 * @param {string} roomId     - Socket.IO room to emit to (e.g. "user:<userId>")
 * @param {Object} [io]       - Socket.IO server instance (optional — skipped if not provided)
 */
async function _create(Model, payload, roomId, io) {
  const notification = await Model.create(payload);

  if (io) {
    io.to(roomId).emit('notification:new', {
      id: notification._id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      related_id: notification.related_id,
      related_type: notification.related_type,
      is_read: false,
      created_at: notification.created_at,
    });
  }

  return notification;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Notify a farmer.
 *
 * @param {string} farmerId
 * @param {string} userId        - Used as the Socket.IO room key
 * @param {Object} payload       - { type, title, body, related_id?, related_type? }
 * @param {Object} [io]
 */
async function notifyFarmer(farmerId, userId, payload, io) {
  return _create(
    FarmerNotification,
    { farmer_id: farmerId, ...payload },
    `user:${userId}`,
    io
  );
}

/**
 * Notify an expert.
 *
 * @param {string} expertId
 * @param {string} userId
 * @param {Object} payload       - { type, title, body, related_id?, related_type? }
 * @param {Object} [io]
 */
async function notifyExpert(expertId, userId, payload, io) {
  return _create(
    ExpertNotification,
    { expert_id: expertId, ...payload },
    `user:${userId}`,
    io
  );
}

/**
 * Notify a company.
 *
 * @param {string} companyId
 * @param {string} userId
 * @param {Object} payload       - { type, title, body, related_id?, related_type? }
 * @param {Object} [io]
 */
async function notifyCompany(companyId, userId, payload, io) {
  return _create(
    CompanyNotification,
    { company_id: companyId, ...payload },
    `user:${userId}`,
    io
  );
}

module.exports = { notifyFarmer, notifyExpert, notifyCompany };
