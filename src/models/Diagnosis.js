'use strict';

const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema(
  {
    data: { type: Buffer, required: true },
    content_type: { type: String, required: true },
  },
  { _id: false }
);

const aiResultSchema = new mongoose.Schema(
  {
    disease_name: { type: String, default: null },
    confidence: { type: Number, min: 0, max: 100, default: null },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical', null],
      default: null,
    },
    symptoms: { type: [String], default: [] },
    suggested_action: { type: String, default: null },
    analyzed_at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const diagnosisSchema = new mongoose.Schema(
  {
    farmer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Farmer',
      required: true,
    },
    field_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Field',
      default: null,
    },
    plant_image: { type: imageSchema, required: [true, 'Plant image is required'] },
    crop_type: { type: String, trim: true, default: null },
    ai_result: { type: aiResultSchema, default: () => ({}) },
    status: {
      type: String,
      enum: ['ai_only', 'pending_expert', 'expert_reviewed', 'archived'],
      default: 'ai_only',
    },
    deleted_at: { type: Date, default: null },
    is_recovered: { type: Boolean, default: false },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

diagnosisSchema.index({ farmer_id: 1, created_at: -1 });
diagnosisSchema.index({ status: 1 });
diagnosisSchema.index({ 'ai_result.disease_name': 1 });
diagnosisSchema.index({ 'ai_result.severity': 1 });

diagnosisSchema.pre(/^find/, function (next) {
  this.where({ deleted_at: null });
  next();
});
// belong to rercoveded crops

const Diagnosis = mongoose.model('Diagnosis', diagnosisSchema);
module.exports = Diagnosis;
