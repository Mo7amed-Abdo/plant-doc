'use strict';

const Diagnosis = require('../models/Diagnosis');
const Farmer = require('../models/Farmer');
const { createError } = require('../middleware/error.middleware');
const { toMongoImage, toDataUri, toImageMeta } = require('../utils/image');

// ─── Mock AI Service ──────────────────────────────────────────────────────────
// Replace the body of `callAI` with your real model call in ~3 days.
// The contract: receives a Buffer + mimeType, returns the ai_result shape.

const MOCK_DISEASES = [
  {
    disease_name: 'Early Blight',
    confidence: 94.2,
    severity: 'high',
    symptoms: ['Concentric ring spots', 'Lower leaf yellowing', 'Dark brown lesions'],
    suggested_action: 'Apply copper-based fungicide. Remove and destroy affected leaves. Ensure proper plant spacing for airflow.',
  },
  {
    disease_name: 'Powdery Mildew',
    confidence: 88.7,
    severity: 'medium',
    symptoms: ['White powdery coating on leaves', 'Distorted new growth', 'Premature leaf drop'],
    suggested_action: 'Apply sulfur-based fungicide or neem oil. Improve air circulation. Avoid overhead watering.',
  },
  {
    disease_name: 'Downy Mildew',
    confidence: 91.5,
    severity: 'high',
    symptoms: ['Yellow angular spots on upper leaf surface', 'Gray-purple fuzz on underside', 'Rapid spread in humid conditions'],
    suggested_action: 'Apply systemic fungicide immediately. Remove infected plant material. Reduce humidity.',
  },
  {
    disease_name: 'Healthy Plant',
    confidence: 97.1,
    severity: 'low',
    symptoms: [],
    suggested_action: 'No disease detected. Continue regular monitoring and preventative care.',
  },
  {
    disease_name: 'Bacterial Leaf Spot',
    confidence: 85.3,
    severity: 'medium',
    symptoms: ['Water-soaked spots', 'Yellow halos around lesions', 'Lesions turning brown and dry'],
    suggested_action: 'Apply copper-based bactericide. Avoid wetting foliage. Remove severely infected leaves.',
  },
];

async function callAI(imageBuffer, mimeType) {
  // ── MOCK ─────────────────────────────────────────────────────────────────────
  // Simulates network latency from a real model call
  await new Promise((resolve) => setTimeout(resolve, 600));

  // Return a deterministic-ish result based on buffer size
  const index = imageBuffer.length % MOCK_DISEASES.length;
  const result = MOCK_DISEASES[index];

  return {
    disease_name: result.disease_name,
    confidence: result.confidence,
    severity: result.severity,
    symptoms: result.symptoms,
    suggested_action: result.suggested_action,
    analyzed_at: new Date(),
  };
  // ── END MOCK ─────────────────────────────────────────────────────────────────

  // ── REAL MODEL (uncomment when ready) ────────────────────────────────────────
  // const env = require('../config/env');
  // const response = await fetch(env.AI_SERVICE_URL, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     image: imageBuffer.toString('base64'),
  //     mime_type: mimeType,
  //   }),
  //   signal: AbortSignal.timeout(env.AI_SERVICE_TIMEOUT),
  // });
  // if (!response.ok) throw createError(502, 'AI service unavailable');
  // const data = await response.json();
  // return { ...data, analyzed_at: new Date() };
  // ── END REAL MODEL ────────────────────────────────────────────────────────────
}

// ─── Map AI severity → treatment request priority ─────────────────────────────
const SEVERITY_TO_PRIORITY = { low: 'low', medium: 'medium', high: 'high', critical: 'urgent' };

// ─── Service Methods ──────────────────────────────────────────────────────────

async function createDiagnosis(userId, profileId, body, file) {
  if (!file) throw createError(400, 'Plant image is required');

  const { crop_type, field_id } = body;

  // Run AI analysis
  const ai_result = await callAI(file.buffer, file.mimetype);

  const diagnosis = await Diagnosis.create({
    farmer_id: profileId,
    field_id: field_id || null,
    plant_image: toMongoImage(file),
    crop_type: crop_type || null,
    ai_result,
    status: 'ai_only',
  });

  return _formatDiagnosis(diagnosis, true);
}

async function getDiagnoses(profileId, query) {
  const { page = 1, limit = 10, status, severity } = query;
  const skip = (Number(page) - 1) * Number(limit);

  const filter = { farmer_id: profileId };
  if (status) filter.status = status;
  if (severity) filter['ai_result.severity'] = severity;

  const [items, total] = await Promise.all([
    Diagnosis.find(filter)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(Number(limit))
      .select('-plant_image'), // Exclude binary image from list view
    Diagnosis.countDocuments(filter),
  ]);

  return { items: items.map((d) => _formatDiagnosis(d, false)), total, page: Number(page), limit: Number(limit) };
}

async function getDiagnosisById(profileId, diagnosisId) {
  const diagnosis = await Diagnosis.findOne({ _id: diagnosisId, farmer_id: profileId });
  if (!diagnosis) throw createError(404, 'Diagnosis not found');
  return _formatDiagnosis(diagnosis, true); // Include image as data URI
}

async function deleteDiagnosis(profileId, diagnosisId) {
  const diagnosis = await Diagnosis.findOne({ _id: diagnosisId, farmer_id: profileId });
  if (!diagnosis) throw createError(404, 'Diagnosis not found');

  diagnosis.deleted_at = new Date();
  await diagnosis.save();
}

function _formatDiagnosis(doc, includeImage) {
  const obj = doc.toObject();
  return {
    id: obj._id,
    farmer_id: obj.farmer_id,
    field_id: obj.field_id,
    crop_type: obj.crop_type,
    ai_result: obj.ai_result,
    status: obj.status,
    created_at: obj.created_at,
    updated_at: obj.updated_at,
    ...(includeImage && obj.plant_image
      ? { plant_image: toDataUri(obj.plant_image) }
      : { plant_image: toImageMeta(obj.plant_image) }),
  };
}

module.exports = { createDiagnosis, getDiagnoses, getDiagnosisById, deleteDiagnosis, SEVERITY_TO_PRIORITY };
