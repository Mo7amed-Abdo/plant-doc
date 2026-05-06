'use strict';

const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema(
  {
    order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
    },
    farmer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Farmer',
      required: true,
    },
    target_type: {
      type: String,
      required: true,
      enum: {
        values: ['product', 'company', 'delivery_company'],
        message: '{VALUE} is not a valid target type',
      },
    },
    // Points to products OR companies depending on target_type
    target_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'target_type_model',
    },
    stars: {
      type: Number,
      required: [true, 'Star rating is required'],
      min: [1, 'Minimum rating is 1'],
      max: [5, 'Maximum rating is 5'],
    },
    review: { type: String, trim: true, default: null },
    deleted_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Prevents duplicate rating of the same target per order
ratingSchema.index({ order_id: 1, target_type: 1, target_id: 1 }, { unique: true });
// For aggregating average ratings per product or company
ratingSchema.index({ target_type: 1, target_id: 1 });

ratingSchema.pre(/^find/, function (next) {
  this.where({ deleted_at: null });
  next();
});

const Rating = mongoose.model('Rating', ratingSchema);
module.exports = Rating;
