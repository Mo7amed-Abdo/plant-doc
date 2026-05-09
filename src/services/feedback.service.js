'use strict';

const PlantDocFeedback = require('../models/PlantDocFeedback');
const { createError } = require('../middleware/error.middleware');
const User = require('../models/User');
const { toDataUri } = require('../utils/image');

function asRating(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
}

function validateRating(n, fieldName) {
  if (n === null) return null;
  if (n < 1 || n > 5) throw createError(400, `${fieldName} must be between 1 and 5`);
  return n;
}

async function createPlantDocFeedback(user, body) {
  if (!user?.userId) throw createError(401, 'Unauthorized');
  if (user.role !== 'farmer') throw createError(403, 'Only farmers can rate PlantDoc');

  const overall = validateRating(asRating(body?.overall_rating), 'overall_rating');
  if (!overall) throw createError(400, 'overall_rating is required');

  const category = body?.category_ratings || {};
  const category_ratings = {
    ai_diagnosis_accuracy: validateRating(asRating(category.ai_diagnosis_accuracy), 'ai_diagnosis_accuracy'),
    expert_support: validateRating(asRating(category.expert_support), 'expert_support'),
    treatment_effectiveness: validateRating(asRating(category.treatment_effectiveness), 'treatment_effectiveness'),
    speed_performance: validateRating(asRating(category.speed_performance), 'speed_performance'),
  };

  const comment = String(body?.comment || '').slice(0, 500);
  const tagsRaw = Array.isArray(body?.tags) ? body.tags : [];
  const tags = tagsRaw
    .map((t) => String(t || '').trim())
    .filter(Boolean)
    .slice(0, 20);

  const impact = String(body?.impact || '');
  const allowedImpact = new Set(['significantly', 'a_little', 'not_really', '']);
  if (!allowedImpact.has(impact)) throw createError(400, 'Invalid impact value');

  const doc = await PlantDocFeedback.create({
    user_id: user.userId,
    overall_rating: overall,
    category_ratings,
    tags,
    comment,
    impact,
  });

  return { id: doc._id };
}

async function listRecentPlantDocFeedback(limit = 3) {
  const n = Math.max(1, Math.min(6, Number(limit) || 3));
  const items = await PlantDocFeedback.find({})
    .sort({ created_at: -1 })
    .limit(n)
    .lean();

  const userIds = items.map((i) => i.user_id).filter(Boolean);
  const users = await User.find({ _id: { $in: userIds } })
    .select('full_name role avatar')
    .lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));

  return items.map((i) => {
    const u = byId.get(String(i.user_id));
    const nameFromUser = u?.role === 'farmer' ? u.full_name : null;
    const avatarFromUser = u?.role === 'farmer' ? toDataUri(u.avatar) : null;

    return {
      id: i._id,
      overall_rating: i.overall_rating,
      comment: i.comment || '',
      created_at: i.created_at,
      author_name: nameFromUser || i.author_name || 'Farmer',
      author_avatar: avatarFromUser || i.author_avatar || '',
    };
  });
}

module.exports = { createPlantDocFeedback, listRecentPlantDocFeedback };
