'use strict';

/**
 * Phase 1 Browser Runtime Test
 *
 * Standalone CLI script — does NOT require the HTTP server to be running.
 * Run with: node scripts/test-browser.js
 *
 * What it does:
 *  1. Launch an isolated Chromium instance
 *  2. Navigate to https://www.google.com
 *  3. Extract structured page state
 *  4. Capture a debug screenshot
 *  5. Close the browser cleanly
 *  6. Print a structured result summary
 *
 * Exit codes:
 *  0 — success
 *  1 — failure
 */

// Load .env from the backend root (one level above scripts/)
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const BrowserRuntime = require('../src/runtime/browser.runtime');
const PageStateExtractor = require('../src/perception/page-state/page-state.extractor');

async function runTest() {
  const runtime = new BrowserRuntime();
  const extractor = new PageStateExtractor();
  const startTime = Date.now();

  console.log('');
  console.log('══════════════════════════════════════════════');
  console.log('  Phase 1 — Browser Runtime Test');
  console.log('══════════════════════════════════════════════');
  console.log('');

  try {
    // ── Step 1: Launch ────────────────────────────────────────────────────
    console.log('[ 1/5 ] Launching Chromium…');
    await runtime.launch();
    console.log('        ✓ Browser launched');
    console.log('');

    // ── Step 2: Navigate ──────────────────────────────────────────────────
    console.log('[ 2/5 ] Navigating to https://www.google.com…');
    const navResult = await runtime.navigate('https://www.google.com');
    console.log('        ✓ Navigation complete');
    console.log('          URL   :', navResult.url);
    console.log('          Title :', navResult.title);
    console.log('');

    // ── Step 3: Extract page state ────────────────────────────────────────
    console.log('[ 3/5 ] Extracting page state…');
    const page = runtime.getPage();
    const pageState = await extractor.extract(page);
    console.log('        ✓ Page state extracted');
    console.log('');
    console.log('        Page State:');
    console.log(JSON.stringify(pageState, null, 10).replace(/^/gm, '          '));
    console.log('');

    // ── Step 4: Screenshot ────────────────────────────────────────────────
    console.log('[ 4/5 ] Capturing debug screenshot…');
    const screenshotPath = await runtime.screenshot('phase1-test-google.png');
    console.log('        ✓ Screenshot saved');
    console.log('          Path:', screenshotPath);
    console.log('');

    // ── Step 5: Close ─────────────────────────────────────────────────────
    console.log('[ 5/5 ] Closing browser…');
    await runtime.close();
    console.log('        ✓ Browser closed cleanly');
    console.log('');

    // ── Summary ───────────────────────────────────────────────────────────
    const duration = Date.now() - startTime;
    console.log('══════════════════════════════════════════════');
    console.log('  ✅ PASS — All steps completed successfully');
    console.log('  Duration : %dms', duration);
    console.log('  URL      : %s', pageState.url);
    console.log('  Title    : %s', pageState.title);
    console.log('  Screenshot: %s', screenshotPath);
    console.log('══════════════════════════════════════════════');
    console.log('');

    process.exit(0);
  } catch (err) {
    console.error('');
    console.error('══════════════════════════════════════════════');
    console.error('  ❌ FAIL — Test encountered an error');
    console.error('══════════════════════════════════════════════');
    console.error('  Error:', err.message);
    console.error('  Stack:', err.stack);
    console.error('');

    // Always attempt cleanup
    await runtime.close().catch(() => {});
    process.exit(1);
  }
}

runTest();
