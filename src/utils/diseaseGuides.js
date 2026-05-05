'use strict';

function normalizeDiseaseKey(input) {
  const s = String(input || '').trim();
  if (!s) return '';

  let out = s;

  // Remove leading numbering like "1-" or "1 -"
  out = out.replace(/^\s*\d+\s*-\s*/g, '');

  // Remove common prefixes
  out = out.replace(/^\s*(disease|status)\s*:\s*/i, '');

  // Fix some common encoding artifacts / punctuation
  out = out.replace(/[–—]/g, '-');

  // Convert model style "<Crop> - <Class>" into dataset style "<crop>___<class>"
  // (e.g. "Blueberry - healthy" -> "blueberry___healthy")
  if (/\s-\s/.test(out) && !/_{3,}/.test(out)) {
    const parts = out.split(/\s-\s/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      out = `${parts[0]}___${parts.slice(1).join('_')}`;
    }
  }

  // If we have something like "Tomato___healthyRecommendation:" split it.
  out = out.replace(/healthy\s*recommendation\s*:/i, 'healthy');

  // Normalize whitespace/underscores
  out = out.replace(/\s+/g, ' ');
  // Keep triple-underscore separator stable; collapse 2+ underscores to "___"
  out = out.replace(/_{2,}/g, '___');

  // Lowercase key, and prefer underscores over spaces for stability
  out = out.toLowerCase().trim();
  out = out.replace(/\s+/g, '_');

  // Remove odd punctuation while preserving underscores.
  out = out.replace(/[^a-z0-9_]+/g, '_');

  // Canonicalize separators:
  // - Any run of 3+ underscores becomes exactly "___"
  // - Other underscore runs become "_"
  out = out.replace(/_{3,}/g, '___');
  out = out.replace(/___/g, '<<SEP>>');
  out = out.replace(/_+/g, '_');
  out = out.replace(/<<SEP>>/g, '___');
  out = out.replace(/^_+|_+$/g, '');

  return out;
}

function _extractSectionValue(block, headerRegex) {
  const m = block.match(headerRegex);
  if (!m) return null;
  const raw = (m[1] || '').trim();
  if (!raw) return null;
  return raw.replace(/\s+\n/g, '\n').trim();
}

function parseDiseaseGuidesFromText(text, source = null) {
  const raw = String(text || '');
  const blocks = raw
    .split(/-{5,}\s*/g)
    .map((b) => b.trim())
    .filter(Boolean);

  const items = [];
  const errors = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const firstLine = (block.split(/\r?\n/)[0] || '').trim();

    // Disease name can be in first line or in "Disease:" line (some blocks have both).
    const diseaseLineMatch = block.match(/^\s*(?:\d+\s*-\s*)?(?:disease|status)\s*:\s*(.+?)\s*$/im);
    const nameRaw =
      (diseaseLineMatch && diseaseLineMatch[1] ? diseaseLineMatch[1].trim() : '') ||
      firstLine;

    const disease_key = normalizeDiseaseKey(nameRaw);
    if (!disease_key) {
      errors.push({ index: i, reason: 'Missing disease name', firstLine });
      continue;
    }

    // Tolerate typos: "reatment", "eatment", or "treatment ->"
    const treatment =
      _extractSectionValue(
        block,
        /(?:^|\n)\s*(?:treatment|reatment|eatment)\s*[:\-]?\s*([\s\S]*?)(?=\n\s*(?:recommendations?|recommendation)\s*[:\-]|\n\s*-{3,}|$)/i
      ) ||
      _extractSectionValue(block, /(?:^|\n)\s*treatment\s*->\s*([^\n]+)\s*$/im);

    const recommendation =
      _extractSectionValue(
        block,
        /(?:^|\n)\s*(?:recommendations?|recommendation)\s*[:\-]?\s*([\s\S]*?)(?=\n\s*(?:treatment|reatment|eatment)\s*[:\-]|\n\s*-{3,}|$)/i
      );

    items.push({
      disease_name_raw: String(nameRaw || '').trim(),
      disease_key,
      treatment: treatment ? treatment.trim() : null,
      recommendation: recommendation ? recommendation.trim() : null,
      source: source || null,
    });
  }

  return { items, errors, totalBlocks: blocks.length };
}

module.exports = { normalizeDiseaseKey, parseDiseaseGuidesFromText };
