'use strict';

const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema(
  { data: { type: Buffer, required: true }, content_type: { type: String, required: true } },
  { _id: false }
);

const deliveryCompanySchema = new mongoose.Schema(
  {
    owner_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    name:          { type: String, required: [true, 'Company name is required'], trim: true },
    address:       { type: String, trim: true, default: null },
    phone:         { type: String, trim: true, default: null },
    email:         { type: String, trim: true, lowercase: true, default: null },
    description:   { type: String, trim: true, default: null },
    logo:          { type: imageSchema, default: null },
    is_verified:   { type: Boolean, default: false },
    deleted_at:    { type: Date, default: null },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

deliveryCompanySchema.index({ owner_user_id: 1 }, { unique: true });
deliveryCompanySchema.index({ name: 1 });
deliveryCompanySchema.pre(/^find/, function (next) { this.where({ deleted_at: null }); next(); });

const DeliveryCompany = mongoose.model('DeliveryCompany', deliveryCompanySchema);
module.exports = DeliveryCompany;
