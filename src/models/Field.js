'use strict';

const mongoose = require('mongoose');

const fieldSchema = new mongoose.Schema(
  {
    farmer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Farmer',
      required: true,
    },
    name: { type: String, required: [true, 'Field name is required'], trim: true },
    crop_type: { type: String, trim: true, default: null },
    area_acres: { type: Number, min: 0, default: null },
    location: { type: String, trim: true, default: null },
    crops_count: { type: Number, min: 0, default: 0 },
    deleted_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

fieldSchema.index({ farmer_id: 1 });

fieldSchema.pre(/^find/, function (next) {
  this.where({ deleted_at: null });
  next();
});

const Field = mongoose.model('Field', fieldSchema);
module.exports = Field;
