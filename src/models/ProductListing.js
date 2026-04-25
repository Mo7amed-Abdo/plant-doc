'use strict';

const mongoose = require('mongoose');

const productListingSchema = new mongoose.Schema(
  {
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    sku: { type: String, trim: true, default: null },
    price: { type: Number, required: [true, 'Price is required'], min: 0 },
    currency: { type: String, default: 'USD', uppercase: true, trim: true },
    stock_quantity: { type: Number, required: true, min: 0, default: 0 },
    stock_status: {
      type: String,
      enum: ['in_stock', 'low_stock', 'out_of_stock'],
      default: 'out_of_stock',
    },
    is_active: { type: Boolean, default: true },
    deleted_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// One listing per product per company
productListingSchema.index({ product_id: 1, company_id: 1 }, { unique: true });
productListingSchema.index({ company_id: 1 });
productListingSchema.index({ stock_status: 1 });

// Auto-derive stock_status before every save
productListingSchema.pre('save', function (next) {
  if (this.stock_quantity <= 0) {
    this.stock_status = 'out_of_stock';
  } else if (this.stock_quantity <= 20) {
    this.stock_status = 'low_stock';
  } else {
    this.stock_status = 'in_stock';
  }
  next();
});

productListingSchema.pre(/^find/, function (next) {
  this.where({ deleted_at: null });
  next();
});

const ProductListing = mongoose.model('ProductListing', productListingSchema);
module.exports = ProductListing;
