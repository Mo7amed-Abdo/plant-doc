'use strict';

const mongoose = require('mongoose');

const expertReviewSchema = new mongoose.Schema(
  {
    diagnosis_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Diagnosis',
      required: true,
    },
    expert_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Expert',
      required: true,
    },
    decision: {
      type: String,
      required: true,
      enum: {
        values: ['approved', 'rejected', 'edited'],
        message: '{VALUE} is not a valid decision',
      },
    },
    confirmed_disease: { type: String, trim: true, default: null },
    confirmed_severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical', null],
      default: null,
    },
    expert_notes: { type: String, trim: true, default: null },
    reviewed_at: { type: Date, default: Date.now },
    deleted_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

expertReviewSchema.index({ diagnosis_id: 1 });
expertReviewSchema.index({ expert_id: 1, created_at: -1 });

expertReviewSchema.pre(/^find/, function (next) {
  this.where({ deleted_at: null });
  next();
});

const ExpertReview = mongoose.model('ExpertReview', expertReviewSchema);
module.exports = ExpertReview;
