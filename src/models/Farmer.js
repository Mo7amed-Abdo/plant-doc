'use strict';

const mongoose = require('mongoose');

const farmerSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    location: { type: String, trim: true, default: null },
    bio: { type: String, trim: true, default: null },
    joined_at: { type: Date, default: Date.now },
    deleted_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

farmerSchema.index({ user_id: 1 }, { unique: true });

farmerSchema.pre(/^find/, function (next) {
  this.where({ deleted_at: null });
  next();
});

const Farmer = mongoose.model('Farmer', farmerSchema);
module.exports = Farmer;
