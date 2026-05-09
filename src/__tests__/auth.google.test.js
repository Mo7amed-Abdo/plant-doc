'use strict';

describe('auth.service googleAuth', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';
    process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/test';
    process.env.GOOGLE_CLIENT_ID = 'client-id-123';
  });

  test('rejects invalid Google token', async () => {
    jest.doMock('google-auth-library', () => ({
      OAuth2Client: function () {
        return { verifyIdToken: async () => { throw new Error('bad'); } };
      },
    }));
    jest.doMock('../models/User', () => ({ findOne: jest.fn() }));
    jest.doMock('../models/Farmer', () => ({}));
    jest.doMock('../models/Expert', () => ({}));
    jest.doMock('../models/Company', () => ({}));
    jest.doMock('../models/DeliveryCompany', () => ({}));

    const { googleAuth } = require('../services/auth.service');
    await expect(googleAuth({ credential: 'x' })).rejects.toMatchObject({ statusCode: 401 });
  });

  test('logs in existing user by email', async () => {
    jest.doMock('google-auth-library', () => ({
      OAuth2Client: function () {
        return {
          verifyIdToken: async () => ({
            getPayload: () => ({ email: 'user@example.com', sub: 'sub123', name: 'U', email_verified: true }),
          }),
        };
      },
    }));

    const save = jest.fn().mockResolvedValue();
    const existingUser = {
      _id: 'u1',
      full_name: 'User',
      email: 'user@example.com',
      phone: null,
      role: 'farmer',
      avatar: null,
      is_active: true,
      google_sub: null,
      auth_provider: 'local',
      last_login_at: null,
      save,
    };

    const userFindOne = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(existingUser) });
    const farmerFindOne = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: 'p1' }) });

    jest.doMock('../models/User', () => ({ findOne: userFindOne, create: jest.fn() }));
    jest.doMock('../models/Farmer', () => ({ findOne: farmerFindOne, create: jest.fn() }));
    jest.doMock('../models/Expert', () => ({ findOne: jest.fn(), create: jest.fn() }));
    jest.doMock('../models/Company', () => ({ findOne: jest.fn(), create: jest.fn() }));
    jest.doMock('../models/DeliveryCompany', () => ({ findOne: jest.fn(), create: jest.fn() }));

    const { googleAuth } = require('../services/auth.service');
    const res = await googleAuth({ credential: 'good' });

    expect(res).toHaveProperty('token');
    expect(res).toHaveProperty('user.email', 'user@example.com');
    expect(save).toHaveBeenCalled();
    expect(existingUser.google_sub).toBe('sub123');
    expect(existingUser.auth_provider).toBe('google');
  });

  test('requires role for new users (login flow)', async () => {
    jest.doMock('google-auth-library', () => ({
      OAuth2Client: function () {
        return {
          verifyIdToken: async () => ({
            getPayload: () => ({ email: 'new@example.com', sub: 'sub999', name: 'N', email_verified: true }),
          }),
        };
      },
    }));

    jest.doMock('../models/User', () => ({
      findOne: jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(null) }),
      create: jest.fn(),
    }));
    jest.doMock('../models/Farmer', () => ({ findOne: jest.fn(), create: jest.fn() }));
    jest.doMock('../models/Expert', () => ({ findOne: jest.fn(), create: jest.fn() }));
    jest.doMock('../models/Company', () => ({ findOne: jest.fn(), create: jest.fn() }));
    jest.doMock('../models/DeliveryCompany', () => ({ findOne: jest.fn(), create: jest.fn() }));

    const { googleAuth } = require('../services/auth.service');
    await expect(googleAuth({ credential: 'good' })).rejects.toMatchObject({ statusCode: 404 });
  });
});
