'use strict';

const { Router } = require('express');
const { runBrowserTest } = require('../controllers/browser.controller');

const router = Router();

/**
 * POST /api/browser/test
 *
 * Phase 1 integration test endpoint.
 * Launches Chromium, navigates to Google, extracts page state, takes a screenshot.
 *
 * No request body required.
 * Returns: { success, durationMs, steps[] }
 */
router.post('/test', runBrowserTest);

module.exports = router;
