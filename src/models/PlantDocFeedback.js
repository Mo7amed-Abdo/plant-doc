'use strict';

const mongoose = require('mongoose');

const plantDocFeedbackSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    author_name: { type: String, default: '', maxlength: 80, trim: true },
    author_avatar: { type: String, default: '', maxlength: 600000 }, // data URI (best-effort)
    overall_rating: { type: Number, required: true, min: 1, max: 5 },
    category_ratings: {
      ai_diagnosis_accuracy: { type: Number, min: 1, max: 5, default: null },
      expert_support: { type: Number, min: 1, max: 5, default: null },
      treatment_effectiveness: { type: Number, min: 1, max: 5, default: null },
      speed_performance: { type: Number, min: 1, max: 5, default: null },
    },
    tags: { type: [String], default: [] },
    comment: { type: String, default: '', maxlength: 500, trim: true },
    impact: {
      type: String,
      enum: ['significantly', 'a_little', 'not_really', ''],
      default: '',
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

plantDocFeedbackSchema.index({ user_id: 1, created_at: -1 });

module.exports = mongoose.model('PlantDocFeedback', plantDocFeedbackSchema);
