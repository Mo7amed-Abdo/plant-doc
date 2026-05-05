'use strict';

const Diagnosis = require('../models/Diagnosis');
const Farmer = require('../models/Farmer');
const DiseaseGuide = require('../models/DiseaseGuide');
const { createError } = require('../middleware/error.middleware');
const { toMongoImage, toDataUri, toImageMeta } = require('../utils/image');
const { normalizeDiseaseKey } = require('../utils/diseaseGuides');
const { pathToFileURL } = require('url');

// ─── Mock AI Service ──────────────────────────────────────────────────────────
// Replace the body of `callAI` with your real model call in ~3 days.
// The contract: receives a Buffer + mimeType, returns the ai_result shape.

// ── HuggingFace (Gradio) AI Service ───────────────────────────────────────────
// Contract: receives a Buffer + mimeType, returns ai_result = { disease_name, confidence, severity, analyzed_at }.
// Uses @gradio/client (ESM) via dynamic import (CommonJS-friendly).

const HF_SPACE = 'MRAdmin10/osama_test';
const HF_ENDPOINT = '/predict_pipeline';
const AI_TIMEOUT_MS = 25000;

let _gradioAppPromise = null;

async function importGradioClient() {
  const modulePath = require.resolve('@gradio/client');
  const moduleUrl = pathToFileURL(modulePath).href;
  return await import(moduleUrl);
}

async function getGradioApp() {
  if (_gradioAppPromise) return _gradioAppPromise;

  _gradioAppPromise = (async () => {
    const mod = await importGradioClient();
    const { Client } = mod;
    return await Client.connect(HF_SPACE);
  })().catch((err) => {
    _gradioAppPromise = null;
    throw err;
  });

  return _gradioAppPromise;
}

function withTimeout(promise, ms, label = 'TIMEOUT') {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const e = Object.assign(new Error(label), { code: label });
      setTimeout(() => reject(e), ms);
    }),
  ]);
}

function extractOutputText(result) {
  const data = result?.data;

  if (typeof data === 'string') return data.trim();
  if (Array.isArray(data) && typeof data[0] === 'string') return data[0].trim();
  if (Array.isArray(data) && Array.isArray(data[0]) && typeof data[0][0] === 'string') return data[0][0].trim();
  if (data && typeof data === 'object' && typeof data.text === 'string') return data.text.trim();

  return '';
}

function parseAI(outputText) {
  const text = String(outputText || '').trim();

  const isNotPlant = /does not look like a plant|not a plant/i.test(text);
  const isOutOfScope = /out of scope|image not defined|not defined/i.test(text);
  const isMissingImage = /please upload an image/i.test(text);

  if (!text || isNotPlant || isOutOfScope || isMissingImage) {
    return { disease_name: text || 'Unknown', confidence: 0, severity: 'normal', analyzed_at: new Date(), _invalid_image: true };
  }

  const match = text.match(/Result:\s*(.*?)\s*\(Confidence:\s*([\d.]+)%\)/i);
  if (!match) {
    return { disease_name: text, confidence: 0, severity: 'normal', analyzed_at: new Date() };
  }

  const disease_name = match[1].trim();
  const confidence = Number(match[2]);
  const severity = /\bhealthy\b/i.test(disease_name) ? 'normal' : 'high';

  return {
    disease_name,
    confidence: Number.isFinite(confidence) ? confidence : 0,
    severity,
    analyzed_at: new Date(),
  };
}

function deriveCropTypeFromDiseaseName(diseaseName) {
  const name = String(diseaseName || '').trim();
  if (!name) return null;

  // Expected format from your HF model: "<Crop> - <Class>" after cleaning.
  if (name.includes(' - ')) {
    const crop = name.split(' - ')[0].trim();
    return crop || null;
  }

  return null;
}

async function enrichAiResultFromGuides(ai_result) {
  if (!ai_result || !ai_result.disease_name) return ai_result;

  const key = normalizeDiseaseKey(ai_result.disease_name);
  if (!key) return ai_result;

  // Backwards compatible lookup: older imports might have stored 4+ underscores (buggy key normalization).
  const legacyKey = key.replace(/___/g, '____');

  const guide = await DiseaseGuide.findOne({ disease_key: { $in: [key, legacyKey] } }).lean();
  if (!guide) return ai_result;

  const treatment = guide.treatment || null;
  const recommendation = guide.recommendation || null;

  return {
    ...ai_result,
    treatment,
    recommendation,
    suggested_action: recommendation || treatment || ai_result.suggested_action || null,
  };
}

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

async function callAIMock(imageBuffer, mimeType) {
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
async function callAI(imageBuffer, mimeType = 'image/jpeg') {
  try {
    const mod = await importGradioClient();
    const { handle_file } = mod;

    const app = await getGradioApp();

    const BlobClass = globalThis.Blob || require('buffer').Blob;
    const blob = new BlobClass([imageBuffer], { type: mimeType });

    const predictionPromise = app.predict(HF_ENDPOINT, {
      image: handle_file(blob),
    });

    const result = await withTimeout(predictionPromise, AI_TIMEOUT_MS, 'AI_TIMEOUT');
    const outputText = extractOutputText(result);
    return parseAI(outputText);
  } catch (err) {
    const msg =
      err?.code === 'AI_TIMEOUT'
        ? 'AI service timeout'
        : `AI service unavailable: ${err?.message || 'unknown error'}`;
    throw createError(502, msg);
  }
}

const SEVERITY_TO_PRIORITY = { normal: 'low', low: 'low', medium: 'medium', high: 'high', critical: 'urgent' };

// ─── Service Methods ──────────────────────────────────────────────────────────

async function createDiagnosis(userId, profileId, body, file) {
  if (!file) throw createError(400, 'Plant image is required');

  const { crop_type, field_id } = body;

  // Run AI analysis
  let ai_result = await callAI(file.buffer, file.mimetype);
  ai_result = await enrichAiResultFromGuides(ai_result);

  if (ai_result?._invalid_image) {
    // Don't save non-plant / out-of-scope images.
    throw createError(400, ai_result.disease_name || 'Invalid image');
  }

  const derivedCropType = deriveCropTypeFromDiseaseName(ai_result?.disease_name);

  const diagnosis = await Diagnosis.create({
    farmer_id: profileId,
    field_id: field_id || null,
    plant_image: toMongoImage(file),
    crop_type: crop_type || derivedCropType || null,
    ai_result,
    status: 'ai_only',
  });

  return _formatDiagnosis(diagnosis, true);
}

async function getDiagnoses(profileId, query) {
  const { page = 1, limit = 10, severity, crop, status } = query;
  const skip = (Number(page) - 1) * Number(limit);

  const filter = { farmer_id: profileId };

  if (severity) {
    const severities = severity.split(',').map(s => s.trim().toLowerCase());
    filter['ai_result.severity'] = { $in: severities };
  }

  if (crop) {
    const crops = crop.split(',').map(c => c.trim().toLowerCase());
    filter.crop_type = { $in: crops };
  }

  if (status) {
    const statuses = status.split(',').map(s => s.trim().toLowerCase());
    filter.status = { $in: statuses };
  }

  const [items, total] = await Promise.all([
    Diagnosis.find(filter)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Diagnosis.countDocuments(filter),
  ]);

  const enriched = await enrichDiagnosesForResponse(items);
  return { items: enriched.map((d) => _formatDiagnosis(d, true)), total, page: Number(page), limit: Number(limit) };
}

async function getDiagnosisById(profileId, diagnosisId) {
  const diagnosis = await Diagnosis.findOne({ _id: diagnosisId, farmer_id: profileId });
  if (!diagnosis) throw createError(404, 'Diagnosis not found');
  const [enriched] = await enrichDiagnosesForResponse([diagnosis]);
  return _formatDiagnosis(enriched || diagnosis, true); // Include image as data URI
}

async function deleteDiagnosis(profileId, diagnosisId) {
  const diagnosis = await Diagnosis.findOne({ _id: diagnosisId, farmer_id: profileId });
  if (!diagnosis) throw createError(404, 'Diagnosis not found');

  diagnosis.deleted_at = new Date();
  await diagnosis.save();
}

async function markAsRecovered(profileId, diagnosisId) {
  const diagnosis = await Diagnosis.findOne({ _id: diagnosisId, farmer_id: profileId });
  if (!diagnosis) throw createError(404, 'Diagnosis not found');

  diagnosis.is_recovered = true;
  await diagnosis.save();
  return _formatDiagnosis(diagnosis, false);
}

async function getRecoveredCount(profileId) {
  return await Diagnosis.countDocuments({ farmer_id: profileId, is_recovered: true, deleted_at: null });
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
    is_recovered: obj.is_recovered,
    created_at: obj.created_at,
    updated_at: obj.updated_at,
    ...(includeImage && obj.plant_image
      ? { plant_image: toDataUri(obj.plant_image) }
      : { plant_image: toImageMeta(obj.plant_image) }),
  };
}

async function enrichDiagnosesForResponse(docs) {
  if (!Array.isArray(docs) || docs.length === 0) return docs || [];

  const byKey = new Map();
  const keys = [];

  for (const d of docs) {
    const name = d?.ai_result?.disease_name;
    if (!name) continue;
    const key = normalizeDiseaseKey(name);
    if (!key) continue;
    if (!byKey.has(key)) {
      byKey.set(key, []);
      keys.push(key);
    }
    byKey.get(key).push(d);
  }

  if (!keys.length) return docs;

  const legacyKeys = keys.map((k) => k.replace(/___/g, '____'));
  const guides = await DiseaseGuide.find({ disease_key: { $in: [...keys, ...legacyKeys] } }).lean();
  const guideMap = new Map(guides.map((g) => [g.disease_key, g]));

  const updates = [];

  for (const key of keys) {
    const guide = guideMap.get(key) || guideMap.get(key.replace(/___/g, '____'));
    if (!guide) continue;

    const treatment = guide.treatment || null;
    const recommendation = guide.recommendation || null;

    const list = byKey.get(key) || [];
    for (const doc of list) {
      const cur = doc.ai_result || {};
      const nextSuggested = recommendation || treatment || cur.suggested_action || null;

      const changed =
        (cur.treatment || null) !== treatment ||
        (cur.recommendation || null) !== recommendation ||
        (cur.suggested_action || null) !== nextSuggested;

      if (changed) {
        doc.ai_result = {
          ...cur,
          treatment,
          recommendation,
          suggested_action: nextSuggested,
        };

        // Best-effort persistence so old diagnoses start showing the fields without re-scan.
        updates.push(
          Diagnosis.updateOne(
            { _id: doc._id },
            {
              $set: {
                'ai_result.treatment': treatment,
                'ai_result.recommendation': recommendation,
                'ai_result.suggested_action': nextSuggested,
              },
            }
          )
        );
      }
    }
  }

  if (updates.length) {
    await Promise.allSettled(updates);
  }

  return docs;
}

/////////////////////edit of diagnosis
async function getRecoveredCountLastWeek(profileId) {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  return await Diagnosis.countDocuments({
    farmer_id: profileId,
    "ai_result.disease_name": "Healthy Plant",
    created_at: { $gte: oneWeekAgo },
    deleted_at: null
  });
}
///////////add
// async function getTotalDiagnoses(profileId) {
//   return await Diagnosis.countDocuments({
//     farmer_id: profileId,
//     deleted_at: null
//   });
// }
async function getStats(profileId) {
  const [total, recovered] = await Promise.all([
    Diagnosis.countDocuments({
      farmer_id: profileId,
      deleted_at: null
    }),
    Diagnosis.countDocuments({
      farmer_id: profileId,
      is_recovered: true,
      deleted_at: null
    })
  ]);

  return {
    total_crops: total,
    recovered_crops: recovered,
    active_diseases: total - recovered
  };
}


module.exports = { createDiagnosis, getDiagnoses, getDiagnosisById, deleteDiagnosis, markAsRecovered, getRecoveredCount, getStats, SEVERITY_TO_PRIORITY };
