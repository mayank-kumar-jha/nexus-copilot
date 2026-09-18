'use strict';

const BrowserRuntime = require('../runtime/browser.runtime');
const PageStateExtractor = require('../perception/page-state/page-state.extractor');

const extractor = new PageStateExtractor();

/**
 * POST /api/browser/test
 *
 * Phase 1 integration test via HTTP.
 * Runs the full browser runtime sequence:
 *   1. Launch Chromium
 *   2. Navigate to Google
 *   3. Extract page state
 *   4. Capture debug screenshot
 *   5. Close browser
 *
 * Returns all observations as a JSON response.
 * Creates a fresh browser instance per request (stateless test endpoint).
 */
async function runBrowserTest(req, res, next) {
  const runtime = new BrowserRuntime();
  const steps = [];
  const startTime = Date.now();

  try {
    // Step 1: Launch
    await runtime.launch();
    steps.push({ step: 'launch', status: 'ok' });

    // Step 2: Navigate
    const navResult = await runtime.navigate('https://www.google.com');
    steps.push({ step: 'navigate', status: 'ok', result: navResult });

    // Step 3: Extract page state
    const page = runtime.getPage();
    const pageState = await extractor.extract(page);
    steps.push({ step: 'extract_page_state', status: 'ok', result: pageState });

    // Step 4: Screenshot (debug — explicit, not automatic)
    const screenshotPath = await runtime.screenshot('test-google.png');
    steps.push({
      step: 'screenshot',
      status: 'ok',
      result: { path: screenshotPath },
    });

    // Step 5: Close
    await runtime.close();
    steps.push({ step: 'close', status: 'ok' });

    res.json({
      success: true,
      durationMs: Date.now() - startTime,
      steps,
    });
  } catch (err) {
    // Ensure the browser is always closed even on failure
    await runtime.close().catch(() => {});
    next(err);
  }
}

module.exports = { runBrowserTest };
