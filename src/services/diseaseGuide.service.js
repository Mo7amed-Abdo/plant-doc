'use strict';

const DiseaseGuide = require('../models/DiseaseGuide');
const { createError } = require('../middleware/error.middleware');
const { parseDiseaseGuidesFromText } = require('../utils/diseaseGuides');

async function importDiseaseGuidesFromText(text, opts = {}) {
  const source = opts.source || null;

  if (!text || !String(text).trim()) {
    throw createError(400, 'Text file is required');
  }

  const { items, errors, totalBlocks } = parseDiseaseGuidesFromText(text, source);

  let upserted = 0;
  let skipped = 0;

  for (const it of items) {
    // skip empty payloads
    if (!it.disease_key) { skipped++; continue; }

    await DiseaseGuide.updateOne(
      { disease_key: it.disease_key },
      {
        $set: {
          disease_name_raw: it.disease_name_raw,
          treatment: it.treatment,
          recommendation: it.recommendation,
          source: it.source,
        },
      },
      { upsert: true }
    );
    upserted++;
  }

  return {
    totalParsed: items.length,
    totalBlocks,
    upserted,
    skipped,
    errors,
  };
}

module.exports = { importDiseaseGuidesFromText };

