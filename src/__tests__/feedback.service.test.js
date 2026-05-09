'use strict';

describe('feedback.service createPlantDocFeedback', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('rejects non-farmer', async () => {
    jest.doMock('../models/User', () => ({}));
    jest.doMock('../utils/image', () => ({ toDataUri: jest.fn() }));
    jest.doMock('../models/PlantDocFeedback', () => ({ create: jest.fn() }));
    const { createPlantDocFeedback } = require('../services/feedback.service');
    await expect(
      createPlantDocFeedback({ userId: 'u1', role: 'expert' }, { overall_rating: 5 })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  test('requires overall rating', async () => {
    jest.doMock('../models/User', () => ({}));
    jest.doMock('../utils/image', () => ({ toDataUri: jest.fn() }));
    jest.doMock('../models/PlantDocFeedback', () => ({ create: jest.fn() }));
    const { createPlantDocFeedback } = require('../services/feedback.service');
    await expect(
      createPlantDocFeedback({ userId: 'u1', role: 'farmer' }, { })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('creates feedback for farmer', async () => {
    jest.doMock('../models/User', () => ({}));
    const create = jest.fn().mockResolvedValue({ _id: 'f1' });
    jest.doMock('../models/PlantDocFeedback', () => ({ create }));
    jest.doMock('../utils/image', () => ({ toDataUri: jest.fn() }));
    const { createPlantDocFeedback } = require('../services/feedback.service');
    const res = await createPlantDocFeedback(
      { userId: 'u1', role: 'farmer' },
      {
        overall_rating: 4,
        category_ratings: { ai_diagnosis_accuracy: 5, expert_support: 4 },
        tags: ['Easy to use', 'Fast diagnosis'],
        comment: 'Great app',
        impact: 'significantly',
      }
    );
    expect(res).toEqual({ id: 'f1' });
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('feedback.service listRecentPlantDocFeedback', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('returns author from User profile when available', async () => {
    const find = jest.fn().mockReturnValue({
      sort: () => ({ limit: () => ({ lean: async () => ([{ _id: 'f1', user_id: 'u1', overall_rating: 5, comment: 'helpful', created_at: new Date() }]) }) }),
    });
    jest.doMock('../models/PlantDocFeedback', () => ({ find }));
    jest.doMock('../models/User', () => ({
      find: () => ({ select: () => ({ lean: async () => ([{ _id: 'u1', role: 'farmer', full_name: 'saved ahmed', avatar: null }]) }) }),
    }));
    jest.doMock('../utils/image', () => ({ toDataUri: () => 'data:image/png;base64,AAA' }));

    const { listRecentPlantDocFeedback } = require('../services/feedback.service');
    const res = await listRecentPlantDocFeedback(1);
    expect(res[0].author_name).toBe('saved ahmed');
    expect(res[0].author_avatar).toMatch(/^data:image/);
  });
});
