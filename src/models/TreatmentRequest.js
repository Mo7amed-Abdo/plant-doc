'use strict';

const mongoose = require('mongoose');

const treatmentRequestSchema = new mongoose.Schema(
  {
    farmer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Farmer',
      required: true,
    },
    diagnosis_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Diagnosis',
      required: true,
    },
    assigned_expert_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Expert',
      default: null,
    },
    expert_review_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ExpertReview',
      default: null,
    },
    priority: {
      type: String,
      enum: {
        values: ['low', 'medium', 'high', 'urgent'],
        message: '{VALUE} is not a valid priority',
      },
      default: 'medium',
    },
    status: {
      type: String,
      enum: {
        values: ['pending_review', 'in_review', 'approved', 'rejected'],
        message: '{VALUE} is not a valid status',
      },
      default: 'pending_review',
    },
    farmer_message: { type: String, trim: true, default: null },
    reviewed_at: { type: Date, default: null, alias: 'reviewedAt' },
    validated_at: { type: Date, default: null, alias: 'validatedAt' },
    image_url: { type: String, trim: true, default: null, alias: 'imageUrl' },
    deleted_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Expert queue: unassigned cases, ordered by urgency then age
treatmentRequestSchema.index({ status: 1, priority: -1, created_at: 1 });
treatmentRequestSchema.index({ farmer_id: 1 });
treatmentRequestSchema.index({ assigned_expert_id: 1 });
treatmentRequestSchema.index({ assigned_expert_id: 1, reviewed_at: -1 });
treatmentRequestSchema.index({ assigned_expert_id: 1, validated_at: -1 });

treatmentRequestSchema.pre(/^find/, function (next) {
  this.where({ deleted_at: null });
  next();
});

treatmentRequestSchema.virtual('expertId').get(function () {
  return this.assigned_expert_id || null;
});

treatmentRequestSchema.virtual('createdAt').get(function () {
  return this.created_at || null;
});

const TreatmentRequest = mongoose.model('TreatmentRequest', treatmentRequestSchema);
module.exports = TreatmentRequest;
