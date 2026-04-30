'use strict';

const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema(
  {
    data: { type: Buffer, required: true },
    content_type: { type: String, required: true },
  },
  { _id: false }
);

const timelineEventSchema = new mongoose.Schema(
  {
    step: {
      type: String,
      required: true,
      enum: ['order_received', 'picked_up', 'in_transit', 'arrived', 'delivered', 'failed'],
    },
    occurred_at: { type: Date, default: Date.now },
    note: { type: String, trim: true, default: null },
  },
  { _id: false }
);

const deliverySchema = new mongoose.Schema(
  {
    order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      unique: true, // one delivery record per order
    },
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    delivery_company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeliveryCompany',
      required: true,
    },
    status: {
      type: String,
      enum: {
        values: ['picked_up', 'on_the_way', 'arriving', 'delivered', 'failed'],
        message: '{VALUE} is not a valid delivery status',
      },
      default: 'picked_up',
    },
    status_timeline: { type: [timelineEventSchema], default: [] },
    eta: { type: Date, default: null },
    picked_up_at: { type: Date, default: null },
    delivered_at: { type: Date, default: null },
    delivery_notes: { type: String, trim: true, default: null },
    proof_of_delivery: { type: imageSchema, default: null },
    deleted_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

deliverySchema.index({ order_id: 1 }, { unique: true });
deliverySchema.index({ company_id: 1, status: 1 });
deliverySchema.index({ delivery_company_id: 1, status: 1 });

deliverySchema.pre(/^find/, function (next) {
  this.where({ deleted_at: null });
  next();
});

const Delivery = mongoose.model('Delivery', deliverySchema);
module.exports = Delivery;
