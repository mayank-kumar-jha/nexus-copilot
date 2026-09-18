'use strict';

const path = require('path');
const express = require('express');
const routes = require('./routes');
const errorHandler = require('./middleware/error.handler');

const app = express();

// ─── CORS (wide-open for local dev) ──────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─── Serve frontend ───────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../../frontend')));

// ─── Request parsing (50mb limit for audio base64) ────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ─── Request logging (minimal, no external deps) ──────────────────────────
app.use((req, _res, next) => {
  console.log('[HTTP] %s %s', req.method, req.path);
  next();
});

// ─── API Routes ───────────────────────────────────────────────────────────
app.use('/api', routes);

// ─── 404 handler (API only — frontend routes handled by static) ─────────────
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: { message: 'Not Found', status: 404 } });
  }
  // For any non-API route just serve the frontend
  res.sendFile(path.join(__dirname, '../../frontend/index.html'));
});

// ─── Centralized error handler ────────────────────────────────────────────
// Must be last and must have 4 arguments (Express convention)
app.use(errorHandler);

module.exports = app;
