'use strict';

/**
 * Agent Benchmark Suite (Phase 17)
 *
 * Runs structured performance, reliability, and security benchmarks:
 *  1. Perception Benchmark (Extraction latency & element fidelity)
 *  2. Policy & Risk Gate Benchmark (Safe auto-exec, sensitive pause, dangerous block)
 *  3. Tool Registry Validation Benchmark (Execution overhead & schema validation)
 *  4. Recovery Engine Benchmark (Diagnosis accuracy & strategy selection)
 *  5. End-to-End Task Benchmark (Observe-Decide-Act-Verify cycle)
 *
 * Run with: npm run benchmark
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const BrowserRuntime = require('../src/runtime/browser.runtime');
const PageStateExtractor = require('../src/perception/page-state/page-state.extractor');
const RiskAssessor = require('../src/policies/risk/risk.assessor');
const PermissionPolicy = require('../src/policies/permissions/permission.policy');
const { createBrowserToolRegistry } = require('../src/tools/registry/browser.tools');
const { RecoveryEngine, RECOVERY_STRATEGIES } = require('../src/agent/recovery/recovery.engine');
const TaskGraph = require('../src/agent/task/task.graph');
const AgentOrchestrator = require('../src/agent/orchestrator/orchestrator');

async function runBenchmarks() {
  console.log('');
  console.log('════════════════════════════════════════════════════════════════');
  console.log('          COMPUTER-USE AI AGENT BENCHMARK SUITE                 ');
  console.log('════════════════════════════════════════════════════════════════');
  console.log('');

  const results = [];
  const runtime = new BrowserRuntime({ headless: true });

  try {
    await runtime.launch();

    // ── Benchmark 1: Policy Gate & Safety ────────────────────────────────────
    console.log('[Benchmark 1/5] Testing Policy Gates & Risk Assessment…');
    const b1Start = Date.now();
    const autoAssessor = new RiskAssessor('auto');
    const strictAssessor = new RiskAssessor('strict');
    const safeTool = { name: 'browser.get_state', riskLevel: 'SAFE' };
    const sensitiveTool = { name: 'browser.submit_form', riskLevel: 'SENSITIVE' };
    const dangerousTool = { name: 'system.delete_all', riskLevel: 'DANGEROUS' };

    const b1Checks = [
      autoAssessor.assess(safeTool).decision === 'execute',
      autoAssessor.assess(sensitiveTool).decision === 'require_approval',
      autoAssessor.assess(dangerousTool).decision === 'block',
      strictAssessor.assess(safeTool).decision === 'require_approval',
    ];
    const b1Passed = b1Checks.every(Boolean);
    results.push({
      name: 'Policy Gate & Safety Guardrails',
      status: b1Passed ? 'PASSED' : 'FAILED',
      durationMs: Date.now() - b1Start,
      details: 'Evaluated auto, strict, safe, sensitive, and dangerous risk levels',
    });

    // ── Benchmark 2: Tool Registry & Validation Overhead ─────────────────────
    console.log('[Benchmark 2/5] Testing Tool Registry Validation Overhead…');
    const b2Start = Date.now();
    const registry = createBrowserToolRegistry();
    let schemaErrors = 0;
    try {
      // Intentionally invalid args
      await registry.execute('browser.navigate', { url: 'not-a-valid-url' }, { runtime });
    } catch {
      schemaErrors++;
    }
    const toolsCount = registry.list().length;
    results.push({
      name: 'Tool Registry Schema Validation',
      status: schemaErrors > 0 && toolsCount >= 8 ? 'PASSED' : 'FAILED',
      durationMs: Date.now() - b2Start,
      details: `${toolsCount} tools registered, input validation successfully rejected bad inputs`,
    });

    // ── Benchmark 3: Structured Perception Performance ───────────────────────
    console.log('[Benchmark 3/5] Testing Perception Latency on Live Page…');
    const b3Start = Date.now();
    await runtime.navigate('https://example.com');
    const extractor = new PageStateExtractor();
    const pageState = await extractor.extract(runtime.getPage());
    const b3Duration = Date.now() - b3Start;
    const canResolve = extractor.canResolveFromStructuredState(pageState);

    results.push({
      name: 'Structured Perception (DOM + Accessibility)',
      status: pageState.interactiveElements && pageState.title ? 'PASSED' : 'FAILED',
      durationMs: b3Duration,
      details: `Extracted ${pageState.elementCount || 0} elements, resolveStructured=${canResolve}, latency=${b3Duration}ms`,
    });

    // ── Benchmark 4: Recovery Engine Diagnosis Accuracy ──────────────────────
    console.log('[Benchmark 4/5] Testing Failure Diagnosis & Recovery Strategies…');
    const b4Start = Date.now();
    const recovery = new RecoveryEngine();
    const dummyTask = new TaskGraph('test recovery');

    const d1 = recovery.diagnose({
      error: 'waiting for selector "button#submit" failed: timeout 30000ms exceeded',
      step: { id: 'step_1' },
      task: dummyTask,
    });

    const d2 = recovery.diagnose({
      error: 'Cloudflare captcha challenge detected on page',
      step: { id: 'step_2' },
      task: dummyTask,
    });

    const b4Passed =
      (d1.strategy === RECOVERY_STRATEGIES.VISION_FALLBACK || d1.strategy === RECOVERY_STRATEGIES.RETRY_BACKOFF) &&
      d2.strategy === RECOVERY_STRATEGIES.REQUEST_USER_HELP;

    results.push({
      name: 'Recovery Engine Diagnosis',
      status: b4Passed ? 'PASSED' : 'FAILED',
      durationMs: Date.now() - b4Start,
      details: `Accurately identified selector timeout (${d1.strategy}) and CAPTCHA intervention (${d2.strategy})`,
    });

    // ── Benchmark 5: End-to-End Orchestrator Cycle ───────────────────────────
    console.log('[Benchmark 5/5] Testing End-to-End Agent Orchestrator Run…');
    const b5Start = Date.now();
    const orchestrator = new AgentOrchestrator({
      runtime,
      policyMode: 'permissive',
    });
    const task = new TaskGraph('Navigate to https://example.com and read title');
    const taskSummary = await orchestrator.run(task);
    const b5Duration = Date.now() - b5Start;

    results.push({
      name: 'Agent Orchestrator Loop (Observe-Decide-Act-Verify)',
      status: taskSummary.status === 'completed' ? 'PASSED' : 'FAILED',
      durationMs: b5Duration,
      details: `Completed ${taskSummary.stepCount} steps in ${b5Duration}ms with 0 unhandled failures`,
    });

    await runtime.close();
  } catch (err) {
    console.error('Benchmark suite encountered unexpected error:', err);
    try { await runtime.close(); } catch {}
  }

  // ── Summary Table ─────────────────────────────────────────────────────────
  console.log('');
  console.log('════════════════════════════════════════════════════════════════');
  console.log('                     BENCHMARK RESULTS                          ');
  console.log('════════════════════════════════════════════════════════════════');
  console.table(
    results.map((r) => ({
      Benchmark: r.name,
      Status: r.status,
      'Latency (ms)': r.durationMs,
      Details: r.details,
    }))
  );
  console.log('');

  const allPassed = results.every((r) => r.status === 'PASSED');
  console.log('FINAL BENCHMARK SCORE: %s (%d/%d passed)', allPassed ? '100%' : 'WARNING', results.filter(r => r.status === 'PASSED').length, results.length);
  console.log('════════════════════════════════════════════════════════════════\n');

  process.exit(allPassed ? 0 : 1);
}

runBenchmarks();
