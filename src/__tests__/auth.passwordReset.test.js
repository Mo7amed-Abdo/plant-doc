'use strict';

jest.mock('../models/Farmer', () => ({}));
jest.mock('../models/Expert', () => ({}));
jest.mock('../models/Company', () => ({}));
jest.mock('../models/DeliveryCompany', () => ({}));

describe('auth.service password reset', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';
    process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/test';
  });

  test('requestPasswordReset returns dev code when user exists', async () => {
    const save = jest.fn().mockResolvedValue();
    const findOne = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'u1', email: 'a@b.com', save }),
    });

    jest.doMock('../models/User', () => ({ findOne }));
    const { requestPasswordReset } = require('../services/auth.service');

    const res = await requestPasswordReset('a@b.com');
    expect(res.sent).toBe(true);
    expect(res.code).toMatch(/^\d{6}$/);
    expect(save).toHaveBeenCalledTimes(1);
  });

  test('requestPasswordReset does not reveal user existence', async () => {
    const findOne = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue(null),
    });
    jest.doMock('../models/User', () => ({ findOne }));
    const { requestPasswordReset } = require('../services/auth.service');

    const res = await requestPasswordReset('missing@b.com');
    expect(res.sent).toBe(true);
    expect(res.code).toBe(null);
  });

  test('confirmPasswordReset sets new password and clears reset fields', async () => {
    const save = jest.fn().mockResolvedValue();
    const user = {
      password_reset_code_hash: null,
      password_reset_expires_at: null,
      password_hash: 'old',
      save,
    };

    const findOne = jest.fn().mockImplementation(() => ({
      select: jest.fn().mockResolvedValue(user),
    }));

    jest.doMock('../models/User', () => ({ findOne }));
    const { confirmPasswordReset } = require('../services/auth.service');

    // We don't know the random code; set expected hash by faking it:
    // Re-run confirm with computed code by temporarily patching the stored hash to match known code.
    const knownCode = '123456';
    const crypto = require('crypto');
    user.password_reset_code_hash = crypto.createHash('sha256').update(`${knownCode}:${process.env.JWT_SECRET}`).digest('hex');
    user.password_reset_expires_at = new Date(Date.now() + 60_000);

    await confirmPasswordReset('a@b.com', knownCode, 'newpassword');
    expect(user.password_hash).toBe('newpassword');
    expect(user.password_reset_code_hash).toBe(null);
    expect(user.password_reset_expires_at).toBe(null);
    expect(save).toHaveBeenCalled();
  });
});
