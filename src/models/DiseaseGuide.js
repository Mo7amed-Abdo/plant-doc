'use strict';

const mongoose = require('mongoose');

const diseaseGuideSchema = new mongoose.Schema(
  {
    disease_name_raw: { type: String, required: true, trim: true },
    disease_key: { type: String, required: true, trim: true, unique: true, index: true },
    treatment: { type: String, default: null },
    recommendation: { type: String, default: null },
    source: { type: String, default: null },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

const DiseaseGuide = mongoose.model('DiseaseGuide', diseaseGuideSchema);
module.exports = DiseaseGuide;

