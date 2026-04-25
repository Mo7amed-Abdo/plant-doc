'use strict';

const mongoose = require('mongoose');

const farmerNotificationSchema = new mongoose.Schema(
  {
    farmer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Farmer',
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['expert_reply', 'treatment_due', 'order_status', 'diagnosis_ready', 'system'],
    },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    related_id: { type: mongoose.Schema.Types.ObjectId, default: null },
    related_type: {
      type: String,
      enum: ['diagnosis', 'order', 'chat', 'treatment_request', null],
      default: null,
    },
    is_read: { type: Boolean, default: false },
    deleted_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

farmerNotificationSchema.index({ farmer_id: 1, is_read: 1, created_at: -1 });

farmerNotificationSchema.pre(/^find/, function (next) {
  this.where({ deleted_at: null });
  next();
});

const FarmerNotification = mongoose.model('FarmerNotification', farmerNotificationSchema);
module.exports = FarmerNotification;
