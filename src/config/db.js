'use strict';

const mongoose = require('mongoose');
const env = require('./env');

const RETRY_DELAY_MS = 5000;
const MAX_RETRIES = 5;

let retries = 0;

const options = {
  // Mongoose 8 handles pooling internally; keep options minimal
};

async function connectDB() {
  try {
    await mongoose.connect(env.MONGO_URI, options);
    console.log(`[DB] MongoDB connected: ${mongoose.connection.host}`);
    retries = 0;
  } catch (err) {
    retries += 1;
    console.error(`[DB] Connection failed (attempt ${retries}/${MAX_RETRIES}): ${err.message}`);

    if (retries >= MAX_RETRIES) {
      console.error('[DB] Max retries reached. Shutting down.');
      process.exit(1);
    }

    console.log(`[DB] Retrying in ${RETRY_DELAY_MS / 1000}s...`);
    setTimeout(connectDB, RETRY_DELAY_MS);
  }
}

mongoose.connection.on('disconnected', () => {
  console.warn('[DB] MongoDB disconnected. Attempting reconnect...');
  connectDB();
});

mongoose.connection.on('error', (err) => {
  console.error(`[DB] Mongoose error: ${err.message}`);
});

module.exports = connectDB;
