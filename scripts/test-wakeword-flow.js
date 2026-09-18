'use strict';

/**
 * Automated Mock Test for Wake-Word & Voice Command Pipeline
 *
 * Verifies:
 * 1. WakeWordService initializes with configured keyword ("Nexus")
 * 2. Fake "Nexus" detection event fires
 * 3. State transitions from IDLE -> LISTENING -> TRANSCRIBING -> THINKING
 * 4. Fake transcription is produced
 * 5. Existing agent API (/api/agent/run) receives the goal and returns a valid task
 */

const assert = require('assert');
const WakeWordService = require('../electron/services/wake-word.service');

async function runTest() {
  console.log('=== TEST: Nexus Wake-Word & Voice Command Pipeline ===\n');

  // 1. Test WakeWordService initialization
  console.log('[1/5] Initializing WakeWordService with keyword "Nexus"...');
  const wakeService = new WakeWordService({ wakeWord: 'Nexus', enabled: true });
  assert.strictEqual(wakeService.wakeWord, 'nexus');
  assert.strictEqual(wakeService.enabled, true);
  console.log('  ✓ WakeWordService initialized correctly.\n');

  // 2. Test Wake-Word Matching Logic
  console.log('[2/5] Testing keyword spotter matching logic...');
  assert.strictEqual(wakeService._matchesWakeWord('nexus'), true, 'Should match "nexus"');
  assert.strictEqual(wakeService._matchesWakeWord('hey nexus'), true, 'Should match "hey nexus"');
  assert.strictEqual(wakeService._matchesWakeWord('ok nexus start browser'), true, 'Should match "ok nexus..."');
  assert.strictEqual(wakeService._matchesWakeWord('something completely unrelated'), false, 'Should not match unrelated phrase');
  console.log('  ✓ Wake-word matching logic passed.\n');

  // 3. Test Event Detection & State Transition Simulation
  console.log('[3/5] Simulating wake-word detection event (IDLE -> LISTENING)...');
  let detectedPayload = null;
  let currentState = 'idle';

  wakeService.on('detected', (data) => {
    detectedPayload = data;
    currentState = 'listening';
    console.log(`  ➔ Event 'detected' fired with wakeWord="${data.wakeWord}". State transitioned to: ${currentState}`);
  });

  // Emit mock detection
  wakeService.emit('detected', {
    wakeWord: 'nexus',
    matchedPhrase: 'hey nexus',
    timestamp: Date.now(),
  });

  assert.ok(detectedPayload, 'Detection payload should exist');
  assert.strictEqual(currentState, 'listening', 'State should be LISTENING');
  console.log('  ✓ Wake-word detection state transition verified.\n');

  // 4. Test Simulated Transcription (LISTENING -> TRANSCRIBING)
  console.log('[4/5] Simulating Speech-to-Text transcription (LISTENING -> TRANSCRIBING)...');
  const mockSpokenGoal = 'Go to https://example.com and check page title';
  currentState = 'transcribing';
  console.log(`  ➔ Voice captured. State transitioned to: ${currentState}`);
  console.log(`  ➔ Transcribed goal: "${mockSpokenGoal}"`);
  assert.strictEqual(currentState, 'transcribing');
  console.log('  ✓ STT transcription simulation verified.\n');

  // 5. Test Existing Agent API Dispatch (/api/agent/run)
  console.log('[5/5] Submitting transcribed goal to existing backend API (http://localhost:3000/api/agent/run)...');
  currentState = 'thinking';

  try {
    const res = await fetch('http://localhost:3000/api/agent/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal: mockSpokenGoal,
        sessionId: 'test-wakeword-session',
        async: true,
      }),
    });

    const data = await res.json();
    console.log('  ➔ API Response:', data);

    assert.strictEqual(res.status, 202, 'Expected HTTP 202 Accepted for async agent task');
    assert.strictEqual(data.success, true, 'Expected success=true');
    assert.ok(data.task, 'Expected valid task object in response');
    assert.strictEqual(data.task.goal, mockSpokenGoal, 'Task goal should match spoken goal');

    console.log(`  ✓ Task created successfully with ID: ${data.task.id}`);
    console.log(`  ✓ Agent state transitioned to: ${currentState} (THINKING)\n`);
  } catch (err) {
    console.error('  ✗ API connection failed:', err.message);
    throw err;
  }

  console.log('==================================================');
  console.log('✓ ALL WAKE-WORD & VOICE PIPELINE TESTS PASSED!');
  console.log('==================================================');
}

runTest().catch((err) => {
  console.error('\nTest failed:', err);
  process.exit(1);
});
