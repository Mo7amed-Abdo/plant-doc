'use strict';

const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema(
  {
    data: { type: Buffer, required: true },
    content_type: { type: String, required: true },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Product name is required'], trim: true },
    category: {
      type: String,
      required: true,
      enum: {
        values: ['fungicide', 'pesticide', 'herbicide', 'fertilizer', 'nutrient_booster', 'other'],
        message: '{VALUE} is not a valid category',
      },
    },
    active_ingredient: { type: String, trim: true, default: null },
    description: { type: String, trim: true, default: null },
    form: {
      type: String,
      enum: {
        values: ['liquid', 'powder', 'granular', 'concentrate', null],
        message: '{VALUE} is not a valid form',
      },
      default: null,
    },
    unit: { type: String, trim: true, default: null }, // e.g. "L", "kg"
    default_image: { type: imageSchema, default: null },
    tags: { type: [String], default: [] },
    treats_diseases: { type: [String], default: [] },
    deleted_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

productSchema.index({ name: 1 });
productSchema.index({ category: 1 });
productSchema.index({ treats_diseases: 1 });
productSchema.index({ tags: 1 });

productSchema.pre(/^find/, function (next) {
  this.where({ deleted_at: null });
  next();
});

const Product = mongoose.model('Product', productSchema);
module.exports = Product;
