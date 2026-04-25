'use strict';

const mongoose = require('mongoose');
const TreatmentRequest = require('../models/TreatmentRequest');
const Diagnosis = require('../models/Diagnosis');
const ExpertReview = require('../models/ExpertReview');
const Chat = require('../models/Chat');
const Expert = require('../models/Expert');
const User = require('../models/User');
const Farmer = require('../models/Farmer');
const { createError } = require('../middleware/error.middleware');
const { SEVERITY_TO_PRIORITY } = require('./diagnosis.service');
const notificationService = require('./notification.service');

// ─── Farmer: open a case ──────────────────────────────────────────────────────

async function createRequest(farmerId, body, io) {
  const { diagnosis_id, farmer_message } = body;
  if (!diagnosis_id) throw createError(400, 'diagnosis_id is required');

  const diagnosis = await Diagnosis.findOne({ _id: diagnosis_id, farmer_id: farmerId });
  if (!diagnosis) throw createError(404, 'Diagnosis not found');

  if (['pending_expert', 'expert_reviewed'].includes(diagnosis.status)) {
    throw createError(409, 'A treatment request already exists for this diagnosis');
  }

  const priority = SEVERITY_TO_PRIORITY[diagnosis.ai_result?.severity] || 'medium';

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const [request] = await TreatmentRequest.create(
      [{ farmer_id: farmerId, diagnosis_id, priority, farmer_message: farmer_message || null }],
      { session }
    );

    // Mark diagnosis as pending expert review
    await Diagnosis.findByIdAndUpdate(diagnosis_id, { status: 'pending_expert' }, { session });

    await session.commitTransaction();
    return request;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

// ─── Farmer: list own requests ────────────────────────────────────────────────

async function getFarmerRequests(farmerId, query) {
  const { page = 1, limit = 10, status } = query;
  const skip = (Number(page) - 1) * Number(limit);
  const filter = { farmer_id: farmerId };
  if (status) filter.status = status;

  const [items, total] = await Promise.all([
    TreatmentRequest.find(filter)
      .populate('diagnosis_id', 'crop_type ai_result status created_at')
      .populate('assigned_expert_id', 'specialization years_experience')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(Number(limit)),
    TreatmentRequest.countDocuments(filter),
  ]);
  return { items, total, page: Number(page), limit: Number(limit) };
}

// ─── Expert: pool of unassigned cases ─────────────────────────────────────────

async function getPool(query) {
  const { page = 1, limit = 10 } = query;
  const skip = (Number(page) - 1) * Number(limit);
  const filter = { status: 'pending_review', assigned_expert_id: null };

  const [items, total] = await Promise.all([
    TreatmentRequest.find(filter)
      .populate('diagnosis_id', 'crop_type ai_result created_at')
      .populate('farmer_id', 'location')
      .sort({ priority: -1, created_at: 1 }) // urgent first, oldest first within same priority
      .skip(skip)
      .limit(Number(limit)),
    TreatmentRequest.countDocuments(filter),
  ]);
  return { items, total, page: Number(page), limit: Number(limit) };
}

// ─── Expert: self-assign ──────────────────────────────────────────────────────

async function assignToExpert(expertId, expertUserId, requestId, io) {
  const request = await TreatmentRequest.findById(requestId);
  if (!request) throw createError(404, 'Treatment request not found');
  if (request.status !== 'pending_review') {
    throw createError(409, 'This case is no longer available');
  }
  if (request.assigned_expert_id) {
    throw createError(409, 'This case has already been assigned');
  }

  request.assigned_expert_id = expertId;
  request.status = 'in_review';
  await request.save();

  // Create the chat room for this case
  const chat = await Chat.create({
    treatment_request_id: request._id,
    farmer_id: request.farmer_id,
    expert_id: expertId,
  });

  // Notify farmer
  const farmer = await Farmer.findById(request.farmer_id).populate('user_id', '_id');
  if (farmer) {
    const expert = await Expert.findById(expertId);
    await notificationService.notifyFarmer(
      farmer._id,
      farmer.user_id._id,
      {
        type: 'expert_reply',
        title: 'Expert assigned to your case',
        body: `An expert specializing in ${expert?.specialization || 'agriculture'} has picked up your treatment request.`,
        related_id: request._id,
        related_type: 'treatment_request',
      },
      io
    );
  }

  return { request, chat };
}

// ─── Get single request (farmer or assigned expert) ───────────────────────────

async function getRequestById(requestId, userId, role, profileId) {
  const request = await TreatmentRequest.findById(requestId)
    .populate('diagnosis_id')
    .populate('assigned_expert_id', 'specialization years_experience bio')
    .populate('expert_review_id');

  if (!request) throw createError(404, 'Treatment request not found');

  // Access control
  if (role === 'farmer' && request.farmer_id.toString() !== profileId.toString()) {
    throw createError(403, 'Access denied');
  }
  if (role === 'expert' && request.assigned_expert_id?._id.toString() !== profileId.toString()) {
    throw createError(403, 'Access denied');
  }

  return request;
}

// ─── Expert: submit review ────────────────────────────────────────────────────

async function submitReview(expertId, expertUserId, requestId, body, io) {
  const { decision, confirmed_disease, confirmed_severity, expert_notes } = body;

  if (!decision) throw createError(400, 'decision is required');

  const request = await TreatmentRequest.findOne({
    _id: requestId,
    assigned_expert_id: expertId,
    status: 'in_review',
  });
  if (!request) throw createError(404, 'Treatment request not found or not assigned to you');

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Create expert review
    const [review] = await ExpertReview.create(
      [{
        diagnosis_id: request.diagnosis_id,
        expert_id: expertId,
        decision,
        confirmed_disease: confirmed_disease || null,
        confirmed_severity: confirmed_severity || null,
        expert_notes: expert_notes || null,
        reviewed_at: new Date(),
      }],
      { session }
    );

    // Update treatment request
    request.status = decision === 'rejected' ? 'rejected' : 'approved';
    request.expert_review_id = review._id;
    await request.save({ session });

    // Update diagnosis status
    await Diagnosis.findByIdAndUpdate(
      request.diagnosis_id,
      { status: 'expert_reviewed' },
      { session }
    );

    // Update expert counters
    await Expert.findByIdAndUpdate(
      expertId,
      { $inc: { cases_reviewed: 1 } },
      { session }
    );

    // Mark chat as resolved
    await Chat.findOneAndUpdate(
      { treatment_request_id: request._id },
      { is_resolved: true },
      { session }
    );

    await session.commitTransaction();

    // Notify farmer out of transaction
    const farmer = await Farmer.findById(request.farmer_id).populate('user_id', '_id');
    if (farmer) {
      await notificationService.notifyFarmer(
        farmer._id,
        farmer.user_id._id,
        {
          type: 'diagnosis_ready',
          title: 'Expert review complete',
          body: `Your treatment request has been ${request.status}. Check the results.`,
          related_id: request._id,
          related_type: 'treatment_request',
        },
        io
      );
    }

    return { request, review };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

module.exports = {
  createRequest,
  getFarmerRequests,
  getPool,
  assignToExpert,
  getRequestById,
  submitReview,
};
