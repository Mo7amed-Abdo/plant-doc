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
const { toDataUri } = require('../utils/image');

const CASE_STATUS = {
  pending_review: 'pending',
  in_review: 'pending',
  approved: 'validated',
  rejected: 'validated',
};

function getDayBounds(baseDate = new Date()) {
  const startOfDay = new Date(baseDate);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(baseDate);
  endOfDay.setHours(23, 59, 59, 999);

  return { startOfDay, endOfDay };
}

function normalizeValidationStatus(status) {
  if (status === 'approved') return 'validated';
  if (status === 'rejected') return 'rejected';
  if (status === 'in_review') return 'in_review';
  return 'pending';
}

function formatCaseItem(request) {
  const diagnosis = request.diagnosis_id || {};
  const review = request.expert_review_id || {};
  const cropType = diagnosis.crop_type || null;
  const diseaseName = review.confirmed_disease || diagnosis.ai_result?.disease_name || null;
  const imageUrl = request.image_url || toDataUri(diagnosis.plant_image) || null;
  const severity = review.confirmed_severity || diagnosis.ai_result?.severity || null;
  const confidence = diagnosis.ai_result?.confidence || 0;
  const recommendation = review.expert_notes || diagnosis.ai_result?.suggested_action || request.farmer_message || null;
  const decidedAt = request.validated_at || request.reviewed_at || request.created_at;

  return {
    id: request._id,
    expertId: request.assigned_expert_id?._id || request.assigned_expert_id || null,
    status: CASE_STATUS[request.status] || 'pending',
    validationStatus: normalizeValidationStatus(request.status),
    reviewedAt: request.reviewed_at || null,
    validatedAt: request.validated_at || null,
    imageUrl,
    createdAt: request.created_at,
    updatedAt: request.updated_at,
    title: cropType || diseaseName || 'Untitled case',
    plantName: cropType || 'Unknown plant',
    cropName: cropType || 'Unknown plant',
    diseaseName,
    severity,
    confidence,
    recommendation,
    description: recommendation,
    decidedAt,
    priority: request.priority,
    farmerMessage: request.farmer_message,
  };
}

function formatPendingCaseItem(request) {
  const diagnosis = request.diagnosis_id || {};
  const farmer = request.farmer_id || {};
  const imageUrl = request.image_url || toDataUri(diagnosis.plant_image) || null;

  return {
    id: request._id,
    status: 'pending',
    priority: request.priority,
    farmerMessage: request.farmer_message || null,
    createdAt: request.created_at,
    updatedAt: request.updated_at,
    imageUrl,
    cropType: diagnosis.crop_type || 'Unknown crop',
    diseaseName: diagnosis.ai_result?.disease_name || 'Unknown disease',
    severity: diagnosis.ai_result?.severity || null,
    confidence: diagnosis.ai_result?.confidence || 0,
    symptoms: diagnosis.ai_result?.symptoms || [],
    suggestedAction: diagnosis.ai_result?.suggested_action || null,
    location: farmer.location || 'Unknown location',
  };
}

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

  // ✅ بدون session
  const request = await TreatmentRequest.create({
    farmer_id: farmerId,
    diagnosis_id,
    priority,
    farmer_message: farmer_message || null
  });

  // ✅ update عادي
  await Diagnosis.findByIdAndUpdate(diagnosis_id, {
    status: 'pending_expert'
  });

  const experts = await Expert.find({}).select('_id user_id specialization');
  await Promise.all(
    experts.map((expert) =>
      notificationService.notifyExpert(
        expert._id,
        {
          type: 'new_pending_case',
          title: 'New pending case available',
          body: `${diagnosis.crop_type || 'A plant'} case is waiting for expert review.`,
          related_id: request._id,
          related_case_id: request._id,
          related_type: 'treatment_request',
        },
        io,
        { userId: expert.user_id?.toString?.() || expert.user_id }
      ).catch(() => null)
    )
  );

  return request;
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

async function getPendingCases(query) {
  const {
    page = 1,
    limit = 10,
    crop,
    severity,
    sort = 'newest',
  } = query;

  const currentPage = Math.max(Number(page) || 1, 1);
  const pageSize = Math.max(Number(limit) || 10, 1);
  const skip = (currentPage - 1) * pageSize;
  const filter = { status: 'pending_review', assigned_expert_id: null };

  const diagnosisFilter = {};
  if (crop) diagnosisFilter.crop_type = { $regex: `^${crop.trim()}$`, $options: 'i' };
  if (severity) diagnosisFilter['ai_result.severity'] = severity;

  if (Object.keys(diagnosisFilter).length) {
    const matchingDiagnosisIds = await Diagnosis.find(diagnosisFilter).distinct('_id');
    if (!matchingDiagnosisIds.length) {
      return {
        cases: [],
        currentPage,
        totalPages: 0,
        totalCases: 0,
        hasNextPage: false,
        hasPrevPage: currentPage > 1,
      };
    }

    filter.diagnosis_id = { $in: matchingDiagnosisIds };
  }

  const sortOption = sort === 'oldest' ? { created_at: 1 } : { created_at: -1 };

  const [items, totalCases] = await Promise.all([
    TreatmentRequest.find(filter)
      .populate('diagnosis_id', 'crop_type ai_result plant_image created_at')
      .populate('farmer_id', 'location')
      .sort(sortOption)
      .skip(skip)
      .limit(pageSize),
    TreatmentRequest.countDocuments(filter),
  ]);

  const totalPages = totalCases ? Math.ceil(totalCases / pageSize) : 0;

  return {
    cases: items.map(formatPendingCaseItem),
    currentPage,
    totalPages,
    totalCases,
    hasNextPage: currentPage < totalPages,
    hasPrevPage: currentPage > 1,
  };
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
    last_message_at: new Date(),
  });

  await notificationService.markPendingCaseNotificationsResolved(request._id).catch(() => null);

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

  // ✅ create review
  const review = await ExpertReview.create({
    diagnosis_id: request.diagnosis_id,
    expert_id: expertId,
    decision,
    confirmed_disease: confirmed_disease || null,
    confirmed_severity: confirmed_severity || null,
    expert_notes: expert_notes || null,
    reviewed_at: new Date(),
  });

  // ✅ update request
  const reviewedAt = review.reviewed_at || new Date();
  request.status = decision === 'rejected' ? 'rejected' : 'approved';
  request.expert_review_id = review._id;
  request.reviewed_at = reviewedAt;
  request.validated_at = reviewedAt;
  await request.save();

  // ✅ update diagnosis
  await Diagnosis.findByIdAndUpdate(
    request.diagnosis_id,
    { status: 'expert_reviewed' }
  );

  // ✅ update expert
  await Expert.findByIdAndUpdate(
    expertId,
    { $inc: { cases_reviewed: 1 } }
  );

  // ✅ resolve chat
  await Chat.findOneAndUpdate(
    { treatment_request_id: request._id },
    { is_resolved: true }
  );

  // 🔔 notify farmer
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
}

async function getReviewedToday(expertId) {
  const { startOfDay, endOfDay } = getDayBounds();
  const filter = {
    assigned_expert_id: expertId,
    reviewed_at: { $gte: startOfDay, $lte: endOfDay },
  };

  const items = await TreatmentRequest.find(filter)
    .populate('diagnosis_id', 'crop_type ai_result plant_image created_at')
    .populate('expert_review_id', 'decision confirmed_disease confirmed_severity reviewed_at')
    .sort({ reviewed_at: -1 });

  return {
    items: items.map(formatCaseItem),
    total: items.length,
    startOfDay,
    endOfDay,
  };
}

async function getRecentValidatedCases(expertId, query) {
  const { page = 1, limit = 5, crop, severity, sort = 'newest' } = query;
  const currentPage = Math.max(Number(page) || 1, 1);
  const pageSize = Math.max(Number(limit) || 5, 1);
  const skip = (currentPage - 1) * pageSize;
  const filter = {
    assigned_expert_id: expertId,
    validated_at: { $ne: null },
  };

  const diagnosisFilter = {};
  if (crop) diagnosisFilter.crop_type = { $regex: `^${crop.trim()}$`, $options: 'i' };
  if (severity) diagnosisFilter['ai_result.severity'] = severity;

  if (Object.keys(diagnosisFilter).length) {
    const matchingDiagnosisIds = await Diagnosis.find(diagnosisFilter).distinct('_id');
    if (!matchingDiagnosisIds.length) {
      return {
        items: [],
        total: 0,
        page: currentPage,
        limit: pageSize,
      };
    }

    filter.diagnosis_id = { $in: matchingDiagnosisIds };
  }

  const sortOption = sort === 'oldest' ? { validated_at: 1, created_at: 1 } : { validated_at: -1, created_at: -1 };

  const [items, total] = await Promise.all([
    TreatmentRequest.find(filter)
      .populate('diagnosis_id', 'crop_type ai_result plant_image created_at')
      .populate('expert_review_id', 'decision confirmed_disease confirmed_severity reviewed_at')
      .sort(sortOption)
      .skip(skip)
      .limit(pageSize),
    TreatmentRequest.countDocuments(filter),
  ]);

  return {
    items: items.map(formatCaseItem),
    total,
    page: currentPage,
    limit: pageSize,
  };
}

async function getExpertCases(expertId, query) {
  const { page = 1, limit = 10, status } = query;
  const skip = (Number(page) - 1) * Number(limit);
  const filter = { assigned_expert_id: expertId };

  if (status === 'validated') {
    filter.validated_at = { $ne: null };
  } else if (status === 'reviewed') {
    filter.reviewed_at = { $ne: null };
  } else if (status === 'pending') {
    filter.status = { $in: ['pending_review', 'in_review'] };
  }

  const [items, total] = await Promise.all([
    TreatmentRequest.find(filter)
      .populate('diagnosis_id', 'crop_type ai_result plant_image created_at')
      .populate('expert_review_id', 'decision confirmed_disease confirmed_severity reviewed_at')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(Number(limit)),
    TreatmentRequest.countDocuments(filter),
  ]);

  return {
    items: items.map(formatCaseItem),
    total,
    page: Number(page),
    limit: Number(limit),
  };
}

module.exports = {
  createRequest,
  getFarmerRequests,
  getPool,
  getPendingCases,
  assignToExpert,
  getRequestById,
  submitReview,
  getReviewedToday,
  getRecentValidatedCases,
  getExpertCases,
};
