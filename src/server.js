'use strict';

const http = require('http');
const { Server } = require('socket.io');

const env = require('./config/env');
const connectDB = require('./config/db');
const app = require('./app');
const { initSocketService } = require('./services/socket.service');
const { importDiseaseGuidesOnStartup } = require('./startup/importDiseaseGuides');

// ─── HTTP Server ──────────────────────────────────────────────────────────────
const server = http.createServer(app);

// ─── Socket.IO ────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: env.ALLOWED_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
});

// Make io accessible anywhere via req.app.get('io')
app.set('io', io);

// Wire all Socket.IO events (chat, notifications, auth middleware)
initSocketService(io);

// ─── Startup ──────────────────────────────────────────────────────────────────
async function start() {
  await connectDB();
  await importDiseaseGuidesOnStartup().catch((e) => {
    console.error('[DiseaseGuides] Auto-import failed:', e?.message || e);
  });

  server.listen(env.PORT, () => {
    console.log(`\n🌿 PlantDoc API`);
    console.log(`   Environment : ${env.NODE_ENV}`);
    console.log(`   Port        : ${env.PORT}`);
    console.log(`   Health      : http://localhost:${env.PORT}/health`);
    console.log(`   MongoDB     : ${env.MONGO_URI}\n`);
  });
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
async function shutdown(signal) {
  console.log(`\n[Server] ${signal} received — shutting down gracefully...`);
  server.close(async () => {
    const mongoose = require('mongoose');
    await mongoose.connection.close();
    console.log('[Server] MongoDB connection closed. Goodbye.\n');
    process.exit(0);
  });
  setTimeout(() => { process.exit(1); }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled Rejection:', reason);
  shutdown('unhandledRejection');
});

start();
