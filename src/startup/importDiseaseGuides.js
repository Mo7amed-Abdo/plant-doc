'use strict';

const fs = require('fs');
const path = require('path');

const env = require('../config/env');
const { importDiseaseGuidesFromText } = require('../services/diseaseGuide.service');

function _firstExistingPath(candidates) {
  for (const p of candidates) {
    if (!p) continue;
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    } catch (_) {}
  }
  return null;
}

async function importDiseaseGuidesOnStartup() {
  const cwd = process.cwd();

  const candidates = [
    env.DISEASE_GUIDES_PATH,
    path.join(cwd, 'recomendations.txt'),
    path.join(cwd, 'recommendations.txt'),
    // Local dev convenience (only if present)
    'C:\\Users\\Office\\OneDrive\\Desktop\\recomendations.txt',
  ];

  const filePath = _firstExistingPath(candidates);
  if (!filePath) {
    console.log('[DiseaseGuides] No guides file found. Set DISEASE_GUIDES_PATH to enable auto-import.');
    return { imported: false };
  }

  const text = fs.readFileSync(filePath, 'utf8');
  const result = await importDiseaseGuidesFromText(text, { source: path.basename(filePath) });

  console.log(
    `[DiseaseGuides] Imported from ${filePath} (upserted=${result.upserted}, parsed=${result.totalParsed}, errors=${(result.errors || []).length})`
  );

  return { imported: true, filePath, result };
}

module.exports = { importDiseaseGuidesOnStartup };

