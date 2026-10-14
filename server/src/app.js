const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const { router: auth } = require('./routes/auth');
const activities = require('./routes/activities');
const reports = require('./routes/reports');
const admin = require('./routes/admin');
const { router: shares, publicRouter } = require('./routes/shares');

// Rejects any request body/query key that starts with "$" or contains "." (NoSQL operator injection like {"$ne": ""}).
function noOperatorKeys(value) {
  if (Array.isArray(value)) return value.every(noOperatorKeys);
  if (value && typeof value === 'object') {
    return Object.keys(value).every((k) => !k.startsWith('$') && !k.includes('.') && noOperatorKeys(value[k]));
  }
  return true;
}
function sanitize(req, res, next) {
  if (!noOperatorKeys(req.body) || !noOperatorKeys(req.query)) {
    return res.status(400).json({ error: 'Invalid input' });
  }
  next();
}

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], imgSrc: ["'self'", 'data:'], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], fontSrc: ["'self'", 'https://fonts.gstatic.com'], scriptSrc: ["'self'"] } } }));
  app.use(express.json({ limit: '50kb' }));
  app.use(sanitize);
  const limiter = process.env.NODE_ENV === 'test' ? (q, s, n) => n() : rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false });
  const authLimiter = process.env.NODE_ENV === 'test' ? (q, s, n) => n() : rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
  app.use('/api', limiter);
  app.use('/api/auth', authLimiter, auth);
  app.use('/api/activities', activities);
  app.use('/api/reports', reports);
  app.use('/api/admin', admin);
  app.use('/api/shares', shares);
  const publicLimiter = process.env.NODE_ENV === 'test' ? (q, s, n) => n() : rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });
  app.use('/api/public', publicLimiter, publicRouter);
  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  const dist = path.join(__dirname, '..', '..', 'client', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^\/(?!api).*/, (req, res) => { if (req.path.startsWith('/p/')) res.set('X-Robots-Tag', 'noindex, nofollow'); res.sendFile(path.join(dist, 'index.html')); });
  }
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large (max 2 MB)' });
    if (err && err.status) return res.status(err.status).json({ error: err.message });
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  });
  return app;
}
module.exports = { createApp };
