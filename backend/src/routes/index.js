'use strict';

const { Router } = require('express');
const browserRoutes = require('./browser.routes');
const agentRoutes = require('./agent.routes');
const sessionRoutes = require('./session.routes');
const { createBrowserToolRegistry } = require('../tools/registry/browser.tools');

const router = Router();
const registry = createBrowserToolRegistry();

// Health check — no auth required
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    features: {
      perception: 'structured + vision fallback',
      tools: registry.list().length,
      orchestrator: 'observe-decide-act-verify-recover',
    },
  });
});

router.get('/debug/cache', (req, res) => {
  res.json(Object.keys(require.cache).filter(k => k.toLowerCase().includes('session.service')));
});

// Browser runtime test routes (Phase 1)
router.use('/browser', browserRoutes);

// Tool registry inspection (Phase 3)
router.get('/tools', (_req, res) => {
  res.json({ success: true, tools: registry.list() });
});

const speechRoutes = require('./speech.routes');

// Session routes
router.use('/sessions', sessionRoutes);

// Speech transcription routes
router.use('/speech', speechRoutes);

// Agent orchestrator routes (Phases 5-13)
router.use('/agent', agentRoutes);

module.exports = router;
