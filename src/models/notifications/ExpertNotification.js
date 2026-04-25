'use strict';

const mongoose = require('mongoose');

const expertNotificationSchema = new mongoose.Schema(
  {
    expert_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Expert',
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['new_case_assigned', 'new_message', 'case_resolved', 'system'],
    },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    related_id: { type: mongoose.Schema.Types.ObjectId, default: null },
    related_type: {
      type: String,
      enum: ['treatment_request', 'chat', 'diagnosis', null],
      default: null,
    },
    is_read: { type: Boolean, default: false },
    deleted_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

expertNotificationSchema.index({ expert_id: 1, is_read: 1, created_at: -1 });

expertNotificationSchema.pre(/^find/, function (next) {
  this.where({ deleted_at: null });
  next();
});

const ExpertNotification = mongoose.model('ExpertNotification', expertNotificationSchema);
module.exports = ExpertNotification;
