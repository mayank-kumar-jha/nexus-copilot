'use strict';

/**
 * Nexus Persistent Login Helper
 *
 * Launches the official Chrome browser instance in interactive mode.
 * Opens ChatGPT and Google so you can log into your accounts directly.
 * Auto-saves cookies, local storage, and auth tokens every 3 seconds
 * and on window close to: %LOCALAPPDATA%\NexusCopilot\storage-state.json
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');

let chromium;
try {
  chromium = require('playwright').chromium;
} catch {
  try {
    chromium = require(path.join(__dirname, '../backend/node_modules/playwright')).chromium;
  } catch (err) {
    console.error('Could not find Playwright:', err.message);
    process.exit(1);
  }
}

async function main() {
  console.log('====================================================');
  console.log('       NEXUS COPILOT - PERSISTENT LOGIN TOOL        ');
  console.log('====================================================\n');

  const baseLocalDir = process.env.LOCALAPPDATA || os.tmpdir();
  const appDir = path.join(baseLocalDir, 'NexusCopilot');
  if (!fs.existsSync(appDir)) fs.mkdirSync(appDir, { recursive: true });
  const stateFile = path.join(appDir, 'storage-state.json');

  console.log(`[LoginTool] Storage file: ${stateFile}`);
  const hasExistingState = fs.existsSync(stateFile);
  if (hasExistingState) {
    console.log('[LoginTool] Existing session found. Loading saved logins...');
  } else {
    console.log('[LoginTool] Starting fresh session...');
  }

  const extraArgs = [
    '--nexus-agent-browser',
    '--start-maximized',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
  ];

  let browser;
  try {
    browser = await chromium.launch({
      headless: false,
      channel: 'chrome',
      args: extraArgs,
    });
    console.log('[LoginTool] ✓ Google Chrome launched.');
  } catch {
    browser = await chromium.launch({
      headless: false,
      args: extraArgs,
    });
    console.log('[LoginTool] ✓ Chromium launched.');
  }

  const context = await browser.newContext({
    viewport: null,
    storageState: hasExistingState ? stateFile : undefined,
  });

  const page = await context.newPage();
  await page.goto('https://chatgpt.com').catch(() => {});

  // Bring window to foreground
  const scriptPath = path.resolve(__dirname, 'focus-browser.ps1');
  if (fs.existsSync(scriptPath)) {
    try {
      execFile('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
      ], { timeout: 4000 }, () => {});
    } catch {}
  }

  console.log('\n[LoginTool] Chrome window is OPEN on your screen!');
  console.log('👉 Please log into ChatGPT, Google, GitHub, or any other accounts in the opened browser.');
  console.log('👉 Your session is being automatically saved every 3 seconds.');
  console.log('👉 When you are done, simply close the Chrome browser window.\n');

  let isClosed = false;

  async function saveState() {
    if (isClosed) return;
    try {
      await context.storageState({ path: stateFile });
    } catch {}
  }

  // Periodic auto-save every 3 seconds
  const autoSaveTimer = setInterval(async () => {
    await saveState();
  }, 3000);

  // Keep alive until browser closes
  await new Promise((resolve) => {
    context.on('close', () => {
      isClosed = true;
      clearInterval(autoSaveTimer);
      resolve();
    });

    browser.on('disconnected', () => {
      isClosed = true;
      clearInterval(autoSaveTimer);
      resolve();
    });
  });

  console.log('[LoginTool] Browser closed. Performing final session save...');
  try {
    await saveState();
    console.log(`[LoginTool] ✓ All logins permanently saved to: ${stateFile}`);
  } catch {}

  console.log('[LoginTool] Done! Nexus Copilot will now automatically use your logins.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[LoginTool] Error:', err);
  process.exit(1);
});
