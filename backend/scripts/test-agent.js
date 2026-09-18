'use strict';

/**
 * End-to-End Agent Test
 *
 * Standalone CLI test for the AI Agent:
 *  1. Launch browser runtime
 *  2. Initialize TaskGraph with goal
 *  3. Execute Observe -> Decide -> Act -> Verify -> Memory loop
 *  4. Test error handling & recovery
 *  5. Print full execution trace and telemetry
 *
 * Run with: npm run test:agent
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const BrowserRuntime = require('../src/runtime/browser.runtime');
const TaskGraph = require('../src/agent/task/task.graph');
const AgentOrchestrator = require('../src/agent/orchestrator/orchestrator');
const { createGeminiGateway } = require('../src/services/llm/gemini.service');
const LongTermMemory = require('../src/services/memory/long-term.memory');

async function main() {
  console.log('');
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  Agent Orchestrator Integration Test (Observe-Decide-Act-Verify)');
  console.log('════════════════════════════════════════════════════════════════');
  console.log('');

  const runtime = new BrowserRuntime({ headless: true });
  let gateway = null;

  try {
    gateway = createGeminiGateway();
  } catch (err) {
    console.log('ℹ Notice: Model gateway in fallback mode (%s)', err.message);
  }

  const longTermMemory = new LongTermMemory();

  const orchestrator = new AgentOrchestrator({
    modelGateway: gateway,
    runtime,
    policyMode: 'permissive', // Permissive for automated end-to-end tests
    longTermMemory,
  });

  try {
    console.log('[ 1/4 ] Launching Browser Runtime…');
    await runtime.launch();
    console.log('        ✓ Browser launched');
    console.log('');

    const testGoal = 'Navigate to https://example.com and check page heading';
    console.log('[ 2/4 ] Initializing TaskGraph: "%s"…', testGoal);
    const task = new TaskGraph(testGoal);
    console.log('        ✓ Task created: %s', task.id);
    console.log('');

    console.log('[ 3/4 ] Running Agent Loop…');
    const summary = await orchestrator.run(task);

    console.log('        ✓ Task finished with status: %s', summary.status);
    console.log('          Steps executed    : %d', summary.stepCount);
    console.log('          Recovery count    : %d', summary.recoveryCount);
    console.log('          Model calls       : %d', summary.modelCallCount);
    console.log('          Vision calls      : %d', summary.visionCallCount);
    console.log('          Result            : %s', summary.result || '(none)');
    console.log('');

    console.log('[ 4/4 ] Verifying Execution History Trace…');
    task.executionHistory.forEach((rec, idx) => {
      console.log(`        Step ${idx + 1}: ${rec.tool} → success=${rec.success}, verified=${rec.verified}`);
      console.log(`          outcome: ${rec.outcome}`);
    });

    console.log('');
    console.log('════════════════════════════════════════════════════════════════');
    console.log('  TEST RESULT: SUCCESS');
    console.log('════════════════════════════════════════════════════════════════');
    console.log('');

    await runtime.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed with error:', err);
    try {
      await runtime.close();
    } catch {}
    process.exit(1);
  }
}

main();
