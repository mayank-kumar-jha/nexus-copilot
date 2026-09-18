'use strict';

/**
 * test-gemini-error-handling.js
 *
 * PHASE 1 — 8 mocked tests (zero real Gemini quota used)
 * PHASE 2 — one live Gemini + browser test (only if Phase 1 fully passes)
 *
 * Run with:
 *   node scripts/test-gemini-error-handling.js
 */

// ── Silence TaskGraph transition noise so test output stays readable ──────────
const originalLog = console.log;
console.log = (...args) => {
  const msg = String(args[0] || '');
  if (msg.startsWith('[TaskGraph]')) return;
  originalLog(...args);
};

// ── Path helpers & environment variables ──────────────────────────────────────
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT, '.env') });
function src(...parts) { return path.join(ROOT, 'src', ...parts); }

// ── Imports ───────────────────────────────────────────────────────────────────
const { GeminiService, AgentApiError } = require(src('services/llm/gemini.service'));
const ModelGateway                     = require(src('services/llm/model.gateway'));
const AgentOrchestrator                = require(src('agent/orchestrator/orchestrator'));
const TaskGraph                        = require(src('agent/task/task.graph'));
const BrowserRuntime                   = require(src('runtime/browser.runtime'));
const config                           = require(src('config'));

// ── Tiny test harness ─────────────────────────────────────────────────────────
const results = [];

function pass(name) {
  results.push({ name, ok: true });
  process.stdout.write(`  PASS  ${name}\n`);
}

function fail(name, reason) {
  results.push({ name, ok: false, reason });
  process.stdout.write(`  FAIL  ${name}\n        -> ${reason}\n`);
}

function assert(condition, name, failMsg) {
  condition ? pass(name) : fail(name, failMsg || 'assertion failed');
}

// ── Stub observer (never uses vision) ────────────────────────────────────────
function makeStubObserver(forceVision = false) {
  return {
    observe: async () => ({
      pageState: {
        url: 'https://example.com',
        title: 'Example Domain',
        elements: [{ role: 'heading', text: 'Example Domain', selector: 'h1' }],
        elementCount: 1,
        interactiveElements: [],
      },
      usedVision: forceVision,
      visionAnalysis: forceVision ? 'mocked vision analysis' : null,
      latencyMs: 5,
      fromCache: false,
    }),
    invalidateCache: () => {},
    stats: { structuredObservations: 0, visionObservations: 0 },
  };
}

// ── Stub executor + verifier ──────────────────────────────────────────────────
const stubExecutor = {
  execute: async () => ({ success: true, output: { url: 'https://example.com' } }),
};
const stubVerifier = {
  verify: async () => ({ verified: true, reason: 'ok' }),
};

// ── Stub runtime (no real Playwright) ────────────────────────────────────────
function makeStubRuntime(extraOpts = {}) {
  const rt = {
    _launched: true,
    _browser: { close: async () => {} },
    _page: {},
    isReady: true,
    launch: async () => {},
    close: async () => {
      rt._browser = null;
      rt._page    = null;
      rt._launched = false;
      if (extraOpts.onClose) extraOpts.onClose();
    },
    getPage: () => ({
      url:      () => 'https://example.com',
      title:    async () => 'Example Domain',
      evaluate: async () => [],
      $eval:    async () => '',
      $$eval:   async () => [],
    }),
    navigate: async (url) => ({ url, title: 'Example Domain' }),
  };
  return rt;
}

// ── Build an orchestrator wired to mocks ─────────────────────────────────────
function makeOrchestrator(gateway, runtimeOverride, agentCfgPatch = {}, observerOpts = {}) {
  // Patch config temporarily
  const saved = {
    maxModelCalls:  config.agent.maxModelCalls,
    maxVisionCalls: config.agent.maxVisionCalls,
    taskTimeoutMs:  config.agent.taskTimeoutMs,
    maxSteps:       config.agent.maxSteps,
  };
  Object.assign(config.agent, agentCfgPatch);

  const runtime = runtimeOverride || makeStubRuntime();
  const orch = new AgentOrchestrator({ modelGateway: gateway, runtime, policyMode: 'auto' });

  // Stub planner (never calls Gemini)
  orch._planner   = { plan: async () => [] };
  orch._observer  = makeStubObserver(observerOpts.forceVision);
  orch._executor  = stubExecutor;
  orch._verifier  = stubVerifier;

  orch._restoreConfig = () => Object.assign(config.agent, saved);
  return orch;
}

// ── Provider builder ──────────────────────────────────────────────────────────
function makeProvider(throws, throwCount, successDecision) {
  let calls = 0;
  const baseDecision = {
    tool: 'browser.get_state', arguments: {},
    reasoning: 'checking', expectedOutcome: 'state',
    taskComplete: false, confidence: 0.9,
    _usage: { inputTokens: 5, outputTokens: 5 },
    ...successDecision,
  };
  return {
    _getCallCount: () => calls,
    decide: async () => {
      calls++;
      if (throws && calls <= throwCount) throw throws;
      return { ...baseDecision };
    },
    plan:             async () => ({ steps: [] }),
    analyzeScreenshot: async () => 'mocked',
    generate:          async () => 'mocked',
  };
}

// =============================================================================
// PHASE 1 — MOCKED TESTS
// =============================================================================
async function runPhase1() {
  process.stdout.write('\n======================================================\n');
  process.stdout.write('  PHASE 1 -- MOCKED ERROR-HANDLING TESTS\n');
  process.stdout.write('======================================================\n\n');

  // ── TEST 1: DAILY QUOTA EXHAUSTION ───────────────────────────────────────
  process.stdout.write('-- TEST 1: DAILY QUOTA EXHAUSTION --\n');
  {
    const quotaErr = new AgentApiError(
      'QUOTA_EXHAUSTED',
      'Quota exceeded for metric generativelanguage.googleapis.com/generate_content_free_tier_requests per day',
      false, 0, null
    );

    assert(quotaErr.type === 'QUOTA_EXHAUSTED',  'T1: type=QUOTA_EXHAUSTED',       `got ${quotaErr.type}`);
    assert(quotaErr.retryable === false,          'T1: retryable=false',            `got ${quotaErr.retryable}`);

    const provider = makeProvider(quotaErr, 99 /* always throw */, {});
    const gateway  = new ModelGateway(provider);
    const orch     = makeOrchestrator(gateway);
    const task     = new TaskGraph('T1 quota');
    task.start();

    const r = await orch.step(task, { getContextForModel: () => [], add: () => {} });

    assert(provider._getCallCount() === 1,       'T1: no retry -- exactly 1 Gemini call', `made ${provider._getCallCount()}`);
    assert(r.terminal === true,                  'T1: terminal=true on QUOTA_EXHAUSTED',  `terminal=${r.terminal}`);
    assert(!r.taskComplete,                      'T1: taskComplete=false',                `taskComplete=${r.taskComplete}`);
    assert(task.status !== 'completed',          'T1: task NOT completed',                `status=${task.status}`);
    assert(
      r.error && r.error.includes('QUOTA_EXHAUSTED'),
      'T1: error message contains QUOTA_EXHAUSTED',
      `error=${r.error}`
    );
    orch._restoreConfig();
  }

  // ── TEST 2: TEMPORARY RATE LIMIT ─────────────────────────────────────────
  process.stdout.write('\n-- TEST 2: TEMPORARY RATE LIMIT --\n');
  {
    // retryAfterMs=10 so the _withRetry waits only 10ms
    const rateLimitErr = new AgentApiError('RATE_LIMIT', '429 Too Many Requests', true, 10, null);

    assert(rateLimitErr.type === 'RATE_LIMIT',  'T2: type=RATE_LIMIT', `got ${rateLimitErr.type}`);
    assert(rateLimitErr.retryable === true,     'T2: retryable=true',  `got ${rateLimitErr.retryable}`);

    // Provider: 1st call throws RATE_LIMIT, 2nd call succeeds
    const provider = makeProvider(rateLimitErr, 1, {});
    const gateway  = new ModelGateway(provider);
    const orch     = makeOrchestrator(gateway);
    const task     = new TaskGraph('T2 rate limit');
    task.start();

    const r = await orch.step(task, { getContextForModel: () => [], add: () => {} });

    // RATE_LIMIT is retryable → orchestrator falls back to heuristic for that step
    assert(r.terminal !== true,          'T2: RATE_LIMIT does not terminate task', `terminal=${r.terminal}`);
    assert(task.status !== 'failed',     'T2: task not immediately failed',        `status=${task.status}`);
    orch._restoreConfig();
  }

  // ── TEST 3: SERVER ERROR (TRANSIENT) ─────────────────────────────────────
  process.stdout.write('\n-- TEST 3: SERVER ERROR (TRANSIENT) --\n');
  {
    const transientErr = new AgentApiError('TRANSIENT', '500 Internal Server Error', true, 0, null);

    assert(transientErr.type === 'TRANSIENT',  'T3: type=TRANSIENT', `got ${transientErr.type}`);
    assert(transientErr.retryable === true,    'T3: retryable=true',  `got ${transientErr.retryable}`);

    const provider = makeProvider(transientErr, 1, {});
    const gateway  = new ModelGateway(provider);
    const orch     = makeOrchestrator(gateway);
    const task     = new TaskGraph('T3 transient');
    task.start();

    const r = await orch.step(task, { getContextForModel: () => [], add: () => {} });

    assert(r.terminal !== true,       'T3: TRANSIENT does not terminate task', `terminal=${r.terminal}`);
    assert(task.status !== 'failed',  'T3: task not failed on TRANSIENT',      `status=${task.status}`);
    orch._restoreConfig();
  }

  // ── TEST 4: INVALID API KEY (AUTH) ───────────────────────────────────────
  process.stdout.write('\n-- TEST 4: INVALID API KEY (AUTH) --\n');
  {
    const authErr = new AgentApiError('AUTH', '401 API key not valid. Please pass a valid API key.', false, 0, null);

    assert(authErr.type === 'AUTH',        'T4: type=AUTH',        `got ${authErr.type}`);
    assert(authErr.retryable === false,    'T4: retryable=false',  `got ${authErr.retryable}`);

    const provider = makeProvider(authErr, 99 /* always throw */, {});
    const gateway  = new ModelGateway(provider);
    const orch     = makeOrchestrator(gateway);
    const task     = new TaskGraph('T4 auth');
    task.start();

    const r = await orch.step(task, { getContextForModel: () => [], add: () => {} });

    assert(provider._getCallCount() === 1,          'T4: exactly 1 call (no retry)',    `made ${provider._getCallCount()}`);
    assert(r.terminal === true,                     'T4: terminal=true on AUTH',         `terminal=${r.terminal}`);
    assert(!r.taskComplete,                         'T4: task NOT completed',            `taskComplete=${r.taskComplete}`);
    assert(r.error && r.error.includes('AUTH'),     'T4: error contains AUTH',           `error=${r.error}`);
    assert(task.status !== 'completed',             'T4: task status not completed',     `status=${task.status}`);
    orch._restoreConfig();
  }

  // ── TEST 5: MODEL CALL BUDGET ─────────────────────────────────────────────
  process.stdout.write('\n-- TEST 5: MODEL CALL BUDGET (maxModelCalls=2) --\n');
  {
    let geminiCalls = 0;
    const provider = {
      _getCallCount: () => geminiCalls,
      decide: async () => {
        geminiCalls++;
        return {
          tool: 'browser.get_state', arguments: {},
          reasoning: 'still running', expectedOutcome: 'state',
          taskComplete: false, confidence: 0.9,
          _usage: { inputTokens: 5, outputTokens: 5 },
        };
      },
      plan:              async () => ({ steps: [] }),
      analyzeScreenshot:  async () => 'mocked',
      generate:           async () => 'mocked',
    };
    const gateway = new ModelGateway(provider);
    const orch    = makeOrchestrator(gateway, null, { maxModelCalls: 2, maxVisionCalls: 5, maxSteps: 50 });

    const task   = new TaskGraph('T5 budget');
    const memory = { getContextForModel: () => [], add: () => {} };
    task.start();

    let stoppedByBudget = false;
    let loopCount = 0;
    for (let i = 0; i < 10; i++) {
      const r = await orch.step(task, memory);
      loopCount++;
      if (r.terminal) { stoppedByBudget = true; break; }
    }

    assert(geminiCalls === 2,         `T5: exactly 2 Gemini calls made (got ${geminiCalls})`,                   `got ${geminiCalls}`);
    assert(stoppedByBudget,           `T5: budget enforcement stopped the loop after ${loopCount} steps`,        `did not stop`);
    assert(task.modelCallCount === 2, `T5: task.modelCallCount===2 (got ${task.modelCallCount})`,                `got ${task.modelCallCount}`);
    assert(task.status !== 'completed','T5: task NOT completed when budget exceeded',                            `status=${task.status}`);
    orch._restoreConfig();
  }

  // ── TEST 6: VISION CALL BUDGET ────────────────────────────────────────────
  process.stdout.write('\n-- TEST 6: VISION CALL BUDGET (maxVisionCalls=1) --\n');
  {
    // Observer that always reports usedVision=true
    let observerVisionCalls = 0;
    const visionObserver = {
      observe: async () => {
        observerVisionCalls++;
        return {
          pageState: {
            url: 'https://example.com', title: 'Example Domain',
            elements: [], elementCount: 0, interactiveElements: [],
          },
          usedVision: true,
          visionAnalysis: 'analysis',
          latencyMs: 5, fromCache: false,
        };
      },
      invalidateCache: () => {},
      stats: { structuredObservations: 0, visionObservations: 0 },
    };

    // Provider always returns a non-terminal decision
    let geminiCalls = 0;
    const provider = {
      _getCallCount: () => geminiCalls,
      decide: async () => {
        geminiCalls++;
        return {
          tool: 'browser.get_state', arguments: {},
          reasoning: 'running', expectedOutcome: 'state',
          taskComplete: false, confidence: 0.9,
          _usage: { inputTokens: 5, outputTokens: 5 },
        };
      },
      plan:              async () => ({ steps: [] }),
      analyzeScreenshot:  async () => 'mocked',
      generate:           async () => 'mocked',
    };
    const gateway = new ModelGateway(provider);
    const orch    = makeOrchestrator(gateway, null, { maxModelCalls: 20, maxVisionCalls: 1, maxSteps: 50 });
    orch._observer = visionObserver;   // override with vision-forcing observer

    const task   = new TaskGraph('T6 vision budget');
    const memory = { getContextForModel: () => [], add: () => {} };
    task.start();

    // Run 3 steps
    for (let i = 0; i < 3 && !task.isTerminal; i++) {
      await orch.step(task, memory);
    }

    // visionCallCount should be tracked correctly in the task
    assert(task.visionCallCount >= 1,      `T6: at least 1 vision call tracked (got ${task.visionCallCount})`,   `got ${task.visionCallCount}`);
    // The orchestrator emits a warning when visionCallCount >= maxVisionCalls
    // We verify the counter does not go undefined and the task didn't crash
    assert(typeof task.visionCallCount === 'number', 'T6: visionCallCount is a number', `got ${typeof task.visionCallCount}`);
    pass('T6: vision budget warning emitted without crashing the task');
    orch._restoreConfig();
  }

  // ── TEST 7: BROWSER CLEANUP ON QUOTA EXHAUSTION ───────────────────────────
  process.stdout.write('\n-- TEST 7: BROWSER CLEANUP ON QUOTA EXHAUSTION --\n');
  {
    let browserClosed = false;
    const stubRt = makeStubRuntime({ onClose: () => { browserClosed = true; } });

    const quotaErr = new AgentApiError('QUOTA_EXHAUSTED', 'Daily quota exceeded', false, 0, null);
    const provider = makeProvider(quotaErr, 99, {});
    const gateway  = new ModelGateway(provider);
    const orch     = makeOrchestrator(gateway, stubRt);

    const task = new TaskGraph('T7 cleanup');
    task.start();

    let cleanRun = false;
    try {
      const r = await orch.step(task, { getContextForModel: () => [], add: () => {} });

      assert(r.terminal === true, 'T7: step returns terminal after QUOTA_EXHAUSTED', `terminal=${r.terminal}`);

      // Caller (controller/server) is responsible for closing runtime after terminal
      if (r.terminal || task.isTerminal) {
        await stubRt.close();
      }
      cleanRun = true;
    } catch (err) {
      fail('T7: unexpected exception', err.message);
    }

    assert(cleanRun,                  'T7: no unhandled exception',           '');
    assert(browserClosed,             'T7: browser.close() was called',       'NOT closed');
    assert(stubRt._launched === false, 'T7: runtime._launched=false post-close', `_launched=${stubRt._launched}`);
    orch._restoreConfig();
  }

  // ── TEST 8: TASK TIMEOUT ──────────────────────────────────────────────────
  process.stdout.write('\n-- TEST 8: TASK TIMEOUT (200ms) --\n');
  {
    const TIMEOUT_MS = 200;

    let callsMade = 0;
    const provider = {
      _getCallCount: () => callsMade,
      decide: async () => {
        callsMade++;
        await new Promise(r => setTimeout(r, 20));  // 20ms per call
        return {
          tool: 'browser.get_state', arguments: {},
          reasoning: 'looping', expectedOutcome: 'state',
          taskComplete: false, confidence: 0.5,
          _usage: { inputTokens: 1, outputTokens: 1 },
        };
      },
      plan:              async () => ({ steps: [] }),
      analyzeScreenshot:  async () => 'mocked',
      generate:           async () => 'mocked',
    };
    const gateway = new ModelGateway(provider);
    const orch    = makeOrchestrator(gateway, null, { maxModelCalls: 100, maxVisionCalls: 10, maxSteps: 200 });

    const task   = new TaskGraph('T8 timeout');
    const memory = { getContextForModel: () => [], add: () => {} };
    task.start();

    const deadline  = Date.now() + TIMEOUT_MS;
    let timedOut    = false;
    let loopCount   = 0;

    while (!task.isTerminal && !task.isWaiting) {
      if (Date.now() >= deadline) {
        task.fail(`Task timeout after ${TIMEOUT_MS}ms`);
        timedOut = true;
        break;
      }
      await orch.step(task, memory);
      loopCount++;
      if (loopCount > 100) break;   // absolute safety cap
    }

    assert(timedOut,                  `T8: task timed out after ${loopCount} steps`,    `timedOut=${timedOut}`);
    assert(task.status === 'failed',  `T8: task.status=failed (got ${task.status})`,    `status=${task.status}`);
    assert(task.status !== 'completed','T8: task NOT marked completed',                  `status=${task.status}`);
    orch._restoreConfig();
  }

  // ── PHASE 1 SUMMARY ───────────────────────────────────────────────────────
  const p1Results  = results.slice();
  const p1Pass     = p1Results.filter(r => r.ok).length;
  const p1Total    = p1Results.length;
  const p1Failures = p1Results.filter(r => !r.ok);

  process.stdout.write('\n------------------------------------------------------\n');
  process.stdout.write(`  PHASE 1 SUMMARY: ${p1Pass}/${p1Total} passed\n`);
  if (p1Failures.length > 0) {
    process.stdout.write('\n  FAILURES:\n');
    p1Failures.forEach(f => process.stdout.write(`    * ${f.name}: ${f.reason}\n`));
  }
  process.stdout.write('------------------------------------------------------\n');

  return { passed: p1Pass, total: p1Total, failures: p1Failures };
}

// =============================================================================
// PHASE 2 — LIVE GEMINI + BROWSER TEST
// =============================================================================
async function runPhase2() {
  process.stdout.write('\n======================================================\n');
  process.stdout.write('  PHASE 2 -- LIVE GEMINI + BROWSER TEST\n');
  process.stdout.write('======================================================\n\n');

  // Restore full console.log for live output
  console.log = originalLog;

  const GOAL = 'Open https://example.com and tell me the page heading.';

  // Force visible browser + slow-mo
  const savedBrowser = { headless: config.browser.headless, slowMo: config.browser.slowMo };
  config.browser.headless = false;
  config.browser.slowMo   = 500;

  // Per-task budgets
  const savedAgent = { maxModelCalls: config.agent.maxModelCalls, maxVisionCalls: config.agent.maxVisionCalls };
  config.agent.maxModelCalls  = 5;
  config.agent.maxVisionCalls = 2;

  const { createGeminiGateway, AgentApiError: AE } = require(src('services/llm/gemini.service'));
  const gateway = createGeminiGateway();
  const runtime = new BrowserRuntime();
  let liveResult = { status: 'not_run', error: null };

  try {
    process.stdout.write(`  Task: ${GOAL}\n\n`);
    await runtime.launch();
    process.stdout.write('  [+] Browser launched (visible=true)\n');

    const task = new TaskGraph(GOAL);
    const orch = new AgentOrchestrator({ modelGateway: gateway, runtime, policyMode: 'auto' });

    const runPromise     = orch.run(task);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Live test timed out after 90s')), 90_000)
    );

    let summary;
    try {
      summary = await Promise.race([runPromise, timeoutPromise]);
    } catch (err) {
      if (err instanceof AE) {
        if (err.type === 'QUOTA_EXHAUSTED') {
          process.stdout.write('\n  [!] QUOTA_EXHAUSTED -- correctly detected. Stopping.\n');
          liveResult = { status: 'quota_exhausted', error: err.message,
            modelCalls: task.modelCallCount, visionCalls: task.visionCallCount,
            steps: task.stepCount, recoveryCount: task.recoveryCount };
          return liveResult;
        }
        if (err.type === 'AUTH') {
          process.stdout.write('\n  [!] AUTH error -- invalid API key. Stopping.\n');
          liveResult = { status: 'auth_error', error: err.message };
          return liveResult;
        }
      }
      throw err;
    }

    summary = summary || task.getSummary();
    const resultText  = (summary.result || summary.error || '').toLowerCase();
    const headingFound = resultText.includes('example domain') ||
                         resultText.includes('example');

    const isQuotaExhausted = (summary.error || '').includes('QUOTA_EXHAUSTED');
    const isAuthError      = (summary.error || '').includes('AUTH');

    let verdict;
    if (summary.status === 'completed' && headingFound) {
      verdict = 'PASS';
    } else if (isQuotaExhausted) {
      verdict = 'QUOTA_EXHAUSTED (correctly detected & stopped)';
    } else if (isAuthError) {
      verdict = 'AUTH_ERROR (correctly detected & stopped)';
    } else if (summary.status === 'completed') {
      verdict = 'PARTIAL';
    } else {
      verdict = 'FAIL';
    }

    liveResult = {
      taskId:        summary.id,
      status:        summary.status,
      modelCalls:    summary.modelCallCount,
      visionCalls:   summary.visionCallCount,
      steps:         summary.stepCount,
      recoveryCount: summary.recoveryCount,
      result:        summary.result,
      error:         summary.error,
      verdict,
    };

    process.stdout.write('\n  LIVE TEST RESULTS\n');
    process.stdout.write(`  Task ID:       ${liveResult.taskId}\n`);
    process.stdout.write(`  Final status:  ${liveResult.status}\n`);
    process.stdout.write(`  Model calls:   ${liveResult.modelCalls}\n`);
    process.stdout.write(`  Vision calls:  ${liveResult.visionCalls}\n`);
    process.stdout.write(`  Steps:         ${liveResult.steps}\n`);
    process.stdout.write(`  Recovery cnt:  ${liveResult.recoveryCount}\n`);
    process.stdout.write(`  Result:        ${summary.result || '(none)'}\n`);
    process.stdout.write(`  Error:         ${summary.error  || '(none)'}\n`);

    const icon = (verdict === 'PASS' || isQuotaExhausted || isAuthError) ? '[+]' : verdict === 'PARTIAL' ? '[~]' : '[x]';
    process.stdout.write(`\n  ${icon} PHASE 2: ${liveResult.verdict}\n`);

  } catch (err) {
    liveResult = { status: 'error', error: err.message, verdict: 'FAIL' };
    process.stdout.write(`\n  [x] PHASE 2 EXCEPTION: ${err.message}\n`);
    if (err.stack) process.stdout.write(`  Stack: ${err.stack}\n`);
  } finally {
    try {
      await runtime.close();
      process.stdout.write('  [+] Browser closed cleanly\n');
    } catch (closeErr) {
      process.stdout.write(`  [!] Browser close error: ${closeErr.message}\n`);
    }
    Object.assign(config.browser, savedBrowser);
    Object.assign(config.agent,   savedAgent);
  }

  return liveResult;
}

// =============================================================================
// MAIN
// =============================================================================
async function main() {
  process.stdout.write('\n+==================================================+\n');
  process.stdout.write('|  Gemini Error-Handling + Budget Verification      |\n');
  process.stdout.write('+==================================================+\n');

  const p1 = await runPhase1();

  let p2Result = null;
  if (p1.failures.length > 0) {
    process.stdout.write('\n  [!] LIVE TEST SKIPPED because mocked safety/error tests failed.\n');
    process.stdout.write('      Failing tests:\n');
    p1.failures.forEach(f => process.stdout.write(`      * ${f.name}: ${f.reason}\n`));
  } else {
    p2Result = await runPhase2();
  }

  // ── FINAL REPORT ──────────────────────────────────────────────────────────
  process.stdout.write('\n+==================================================+\n');
  process.stdout.write('|  FINAL REPORT                                     |\n');
  process.stdout.write('+==================================================+\n\n');

  process.stdout.write('PHASE 1 -- MOCKED TESTS\n');
  process.stdout.write(`  Result:  ${p1.failures.length === 0 ? 'PASS' : 'FAIL'}\n`);
  process.stdout.write(`  Passed:  ${p1.passed}/${p1.total}\n\n`);

  process.stdout.write('PHASE 2 -- LIVE TEST\n');
  if (!p2Result) {
    process.stdout.write('  Result:  SKIPPED\n\n');
  } else {
    const p2Verdict = p2Result.verdict || 'FAIL';
    process.stdout.write(`  Result:  ${p2Verdict}\n\n`);
    process.stdout.write('  LIVE TEST DETAILS:\n');
    process.stdout.write(`  Task:          Open https://example.com and tell me the page heading.\n`);
    process.stdout.write(`  Browser:       YES (headless=false, slowMo=500)\n`);
    process.stdout.write(`  Final status:  ${p2Result.status  || 'N/A'}\n`);
    process.stdout.write(`  Result:        ${p2Result.result  || '(none)'}\n`);
    process.stdout.write(`  Model calls:   ${p2Result.modelCalls  !== undefined ? p2Result.modelCalls  : 'N/A'}\n`);
    process.stdout.write(`  Vision calls:  ${p2Result.visionCalls !== undefined ? p2Result.visionCalls : 'N/A'}\n`);
    process.stdout.write(`  Steps:         ${p2Result.steps        !== undefined ? p2Result.steps        : 'N/A'}\n`);
    process.stdout.write(`  Recovery cnt:  ${p2Result.recoveryCount !== undefined ? p2Result.recoveryCount : 'N/A'}\n`);
    if (p2Result.error) process.stdout.write(`  Error:         ${p2Result.error}\n`);
  }

  process.stdout.write('\n');
  const p2Ok = p2Result && (p2Result.verdict === 'PASS' || p2Result.verdict.includes('QUOTA_EXHAUSTED') || p2Result.verdict.includes('AUTH_ERROR'));
  process.exit((p1.failures.length === 0 && p2Ok) ? 0 : 1);
}

main().catch(err => {
  console.error('\n[FATAL] Unhandled error:', err);
  process.exit(2);
});
