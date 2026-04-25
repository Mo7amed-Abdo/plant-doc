'use strict';

const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema(
  {
    product_listing_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductListing',
      required: true,
    },
    quantity: { type: Number, required: true, min: [1, 'Quantity must be at least 1'] },
    added_at: { type: Date, default: Date.now },
    price_snapshot: {
      type: Number,
      required: true,
      min: 0,
      // Price at the time of adding — for display only; final price recalculated at checkout
    },
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    farmer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Farmer',
      required: true,
      unique: true,
    },
    items: { type: [cartItemSchema], default: [] },
    deleted_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

cartSchema.index({ farmer_id: 1 }, { unique: true });

cartSchema.pre(/^find/, function (next) {
  this.where({ deleted_at: null });
  next();
});

const Cart = mongoose.model('Cart', cartSchema);
module.exports = Cart;
