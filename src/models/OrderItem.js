'use strict';

const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
    },
    product_listing_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductListing',
      required: true,
    },
    // Denormalized for easier product-level sales queries
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    // Snapshots — preserved even if product is later edited
    product_name_snapshot: { type: String, required: true, trim: true },
    sku_snapshot: { type: String, trim: true, default: null },
    quantity: { type: Number, required: true, min: 1 },
    unit_price: { type: Number, required: true, min: 0 },
    subtotal: { type: Number, required: true, min: 0 },
    deleted_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

orderItemSchema.index({ order_id: 1 });
orderItemSchema.index({ product_id: 1 });

orderItemSchema.pre(/^find/, function (next) {
  this.where({ deleted_at: null });
  next();
});

const OrderItem = mongoose.model('OrderItem', orderItemSchema);
module.exports = OrderItem;
