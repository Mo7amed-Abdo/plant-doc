'use strict';

const mongoose = require('mongoose');

const expertSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    specialization: {
      type: String,
      required: [true, 'Specialization is required'],
      trim: true,
      // Locked after creation — enforced at service layer
    },
    years_experience: { type: Number, min: 0, default: 0 },
    bio: { type: String, trim: true, default: null },
    location: { type: String, trim: true, default: null },
    expertise_tags: { type: [String], default: [] },
    cases_reviewed: { type: Number, default: 0 },
    accuracy_rate: { type: Number, min: 0, max: 100, default: 0 },
    is_verified: { type: Boolean, default: false },
    deleted_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

expertSchema.index({ user_id: 1 }, { unique: true });
expertSchema.index({ expertise_tags: 1 });

expertSchema.pre(/^find/, function (next) {
  this.where({ deleted_at: null });
  next();
});

const Expert = mongoose.model('Expert', expertSchema);
module.exports = Expert;
