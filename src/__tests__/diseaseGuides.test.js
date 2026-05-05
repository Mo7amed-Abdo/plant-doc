'use strict';

const { normalizeDiseaseKey, parseDiseaseGuidesFromText } = require('../utils/diseaseGuides');

describe('diseaseGuides utils', () => {
  test('normalizeDiseaseKey strips prefixes and numbers', () => {
    expect(normalizeDiseaseKey('1-Disease: Apple Scab')).toBe('apple_scab');
    expect(normalizeDiseaseKey('Status: Apple___healthy')).toBe('apple___healthy');
  });

  test('normalizeDiseaseKey fixes merged healthyRecommendation', () => {
    expect(normalizeDiseaseKey('Tomato___healthyRecommendation:')).toBe('tomato___healthy');
  });

  test('parseDiseaseGuidesFromText parses treatment and recommendations (with typos)', () => {
    const sample = `
1-Disease: Apple Scab

Recommendations:
Prune infected parts.
Use fungicides like captan or sulfur.
 treatment ->captan
-----------------------
2-Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot
reatment:
Use fungicides such as azoxystrobin or propiconazole.

Recommendations:
Remove infected plant debris.
Practice crop rotation.
`;

    const { items, errors, totalBlocks } = parseDiseaseGuidesFromText(sample, 'recomendations.txt');
    expect(errors.length).toBe(0);
    expect(totalBlocks).toBe(2);

    const scab = items.find((i) => i.disease_key === 'apple_scab');
    expect(scab).toBeTruthy();
    expect(scab.recommendation).toMatch(/prune infected parts/i);
    expect(scab.treatment).toMatch(/captan/i);

    const corn = items.find((i) => i.disease_key.includes('corn_'));
    expect(corn).toBeTruthy();
    expect(corn.treatment).toMatch(/azoxystrobin/i);
    expect(corn.recommendation).toMatch(/crop rotation/i);
  });
});

