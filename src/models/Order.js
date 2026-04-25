'use strict';

const mongoose = require('mongoose');

const shippingAddressSchema = new mongoose.Schema(
  {
    street: { type: String, trim: true, default: null },
    city: { type: String, trim: true, default: null },
    state: { type: String, trim: true, default: null },
    zip: { type: String, trim: true, default: null },
    country: { type: String, trim: true, default: null },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    order_code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    farmer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Farmer',
      required: true,
    },
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    // Set if order originated from an approved treatment request flow
    related_treatment_request_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TreatmentRequest',
      default: null,
    },
    status: {
      type: String,
      enum: {
        values: ['pending', 'processing', 'shipped', 'on_the_way', 'arriving', 'delivered', 'cancelled'],
        message: '{VALUE} is not a valid order status',
      },
      default: 'pending',
    },
    subtotal: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USD', uppercase: true, trim: true },
    shipping_address: { type: shippingAddressSchema, default: () => ({}) },
    contact_phone: { type: String, trim: true, default: null },
    estimated_delivery_at: { type: Date, default: null },
    placed_at: { type: Date, default: Date.now },
    delivered_at: { type: Date, default: null },
    notes: { type: String, trim: true, default: null },
    deleted_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

orderSchema.index({ order_code: 1 }, { unique: true });
orderSchema.index({ farmer_id: 1, placed_at: -1 });
orderSchema.index({ company_id: 1, status: 1 });
orderSchema.index({ status: 1 });

orderSchema.pre(/^find/, function (next) {
  this.where({ deleted_at: null });
  next();
});

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;
