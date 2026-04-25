'use strict';

require('dotenv').config();

const required = ['MONGO_URI', 'JWT_SECRET'];

required.forEach((key) => {
  if (!process.env[key]) {
    console.error(`[ENV] Missing required environment variable: ${key}`);
    process.exit(1);
  }
});

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 5000,

  MONGO_URI: process.env.MONGO_URI,

  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',

  MAX_IMAGE_SIZE: parseInt(process.env.MAX_IMAGE_SIZE, 10) || 5 * 1024 * 1024, // 5MB

  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:5000', 'http://localhost:3000'],

  AI_SERVICE_URL: process.env.AI_SERVICE_URL || 'http://localhost:8000/predict',
  AI_SERVICE_TIMEOUT: parseInt(process.env.AI_SERVICE_TIMEOUT, 10) || 10000,

  isDev() {
    return this.NODE_ENV === 'development';
  },
  isProd() {
    return this.NODE_ENV === 'production';
  },
};
