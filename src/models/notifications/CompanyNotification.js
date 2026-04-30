'use strict';

const mongoose = require('mongoose');

const companyNotificationSchema = new mongoose.Schema(
  {
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: [
        'new_order',
        'new_treatment_request',
        'low_stock',
        'delivery_assigned',
        'delivery_completed',
        'delivery_failed',
        'delivery_update',
        'system',
      ],
    },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    related_id: { type: mongoose.Schema.Types.ObjectId, default: null },
    related_type: {
      type: String,
      enum: ['order', 'treatment_request', 'product_listing', null],
      default: null,
    },
    is_read: { type: Boolean, default: false },
    deleted_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

companyNotificationSchema.index({ company_id: 1, is_read: 1, created_at: -1 });

companyNotificationSchema.pre(/^find/, function (next) {
  this.where({ deleted_at: null });
  next();
});

const CompanyNotification = mongoose.model('CompanyNotification', companyNotificationSchema);
module.exports = CompanyNotification;
