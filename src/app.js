'use strict';

const path    = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const env = require('./config/env');
const { errorHandler, notFoundHandler } = require('./middleware/error.middleware');

const app = express();

// ─── Security ─────────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (env.ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: Origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ─── Body Parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));


// ─── HTTP Logging ─────────────────────────────────────────────────────────────
if (env.isDev()) {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Simple request logger for debugging (prints method, url and whether Authorization header exists)
app.use((req, res, next) => {
  try {
    console.log(`[REQ] ${req.method} ${req.originalUrl} Auth:${req.headers.authorization ? 'yes' : 'no'}`);
  } catch (e) { /* ignore logging errors */ }
  next();
});

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'PlantDoc API is running',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',               require('./routes/auth.routes'));
app.use('/api/farmer',             require('./routes/farmer.routes'));
app.use('/api/expert',             require('./routes/expert.routes'));
app.use('/api/company',            require('./routes/company.routes'));
app.use('/api/company',            require('./routes/companyOps.routes'));
app.use('/api/diagnoses',          require('./routes/diagnosis.routes'));
app.use('/api/disease-guides',     require('./routes/diseaseGuide.routes'));
app.use('/api/treatment-requests', require('./routes/treatmentRequest.routes'));
app.use('/api/cases',              require('./routes/case.routes'));
app.use('/api/chats',              require('./routes/chat.routes'));
app.use('/api/messages',           require('./routes/message.routes'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/products',           require('./routes/product.routes'));
app.use('/api/product-listings',   require('./routes/productListing.routes'));
app.use('/api/cart',               require('./routes/cart.routes'));
app.use('/api/orders',             require('./routes/order.routes'));
app.use('/api/notifications',      require('./routes/notification.routes'));
app.use('/api/delivery',           require('./routes/delivery.company.routes'));
app.use('/api/feedback',           require('./routes/feedback.routes'));

// Ratings are nested under orders: /api/orders/:id/ratings
app.use('/api/orders/:id/ratings', require('./routes/rating.routes'));

// ─── Frontend Static Files ───────────────────────────────────────────────────
app.use('/frontend', express.static(path.join(__dirname, '..', 'frontend')));

// Redirect root to frontend entrypoint
app.get('/', (req, res) => res.redirect('/frontend/index.html'));
app.get('/expert/profile', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'expert', 'expertProfile.html')));
app.get('/expert/dashboard', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'expert', 'expertDashboard.html')));
app.get('/expert/pending-cases', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'expert', 'expertPendingcases.html')));
app.get('/expert/chat', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'expert', 'expertChat.html')));
app.get('/expert/notifications', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'expert', 'expertnotifications.html')));
app.get('/expert/cases', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'expert', 'expertCases.html')));
app.get('/expert/all-cases', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'expert', 'expertCases.html')));

// ─── 404 + Error Handlers ─────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
