'use strict';

require('dotenv').config();
const path = require('path');
const config = require('../src/config');
const BrowserRuntime = require('../src/runtime/browser.runtime');
const TaskGraph = require('../src/agent/task/task.graph');
const AgentOrchestrator = require('../src/agent/orchestrator/orchestrator');
const { createGeminiGateway } = require('../src/services/llm/gemini.service');

async function main() {
  console.log('\n======================================================');
  console.log('  LIVE PRACTICAL FORM TEST (WATCH CHROMIUM WINDOW)');
  console.log('======================================================\n');

  // Enforce visible browser and slowMo speed for clear visibility
  config.browser.headless = false;
  config.browser.slowMo = 1500;

  const goal = process.argv[2] || 'Open https://httpbin.org/forms/post and type "Jane Doe" into Customer name field';

  console.log('Target Goal: %s', goal);
  console.log('Launching maximized Chromium window...\n');

  const gateway = createGeminiGateway();
  const runtime = new BrowserRuntime();

  await runtime.launch();

  const task = new TaskGraph(goal);
  const orchestrator = new AgentOrchestrator({
    modelGateway: gateway,
    runtime,
    policyMode: 'auto',
  });

  try {
    const summary = await orchestrator.run(task);
    console.log('\n======================================================');
    console.log('  TASK COMPLETED!');
    console.log('  Status: %s', summary.status);
    console.log('  Result: %s', summary.result || '(none)');
    console.log('======================================================\n');
  } catch (err) {
    console.error('\n[FATAL] Task execution failed:', err);
  } finally {
    console.log('Keeping Chrome open for 60 seconds so you can see it on screen...');
    await new Promise((r) => setTimeout(r, 60000));
    await runtime.close();
    console.log('Browser closed cleanly.');
  }
}

main().catch(console.error);
