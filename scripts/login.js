'use strict';

/**
 * Nexus Persistent Login Helper
 *
 * Launches the official Chrome browser instance using the native persistent profile:
 * %LOCALAPPDATA%\NexusCopilot\UserProfile
 *
 * Auto-saves cookies, SQLite databases, IndexedDB, local storage, and auth tokens.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile, execSync } = require('child_process');

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
  const profileDir = path.join(appDir, 'UserProfile');
  const stateFile = path.join(appDir, 'storage-state.json');

  if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });

  console.log(`[LoginTool] Persistent User Profile: ${profileDir}`);

  // Kill any dangling chrome processes using this profile
  try {
    execSync('powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like \'*nexus-agent-browser*\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"', { stdio: 'ignore' });
  } catch {}

  const extraArgs = [
    '--nexus-agent-browser',
    '--start-maximized',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
  ];

  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      channel: 'chrome',
      viewport: null,
      args: extraArgs,
    });
    console.log('[LoginTool] ✓ Google Chrome launched with Persistent User Profile.');
  } catch {
    context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      viewport: null,
      args: extraArgs,
    });
    console.log('[LoginTool] ✓ Chromium launched with Persistent User Profile.');
  }

  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();
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
  console.log('👉 When you are done, simply close the Chrome browser window.\n');

  let isClosed = false;

  async function saveState() {
    if (isClosed) return;
    try {
      await context.storageState({ path: stateFile });
    } catch {}
  }

  // Periodic auto-save storage-state backup every 3 seconds
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
  });

  console.log('[LoginTool] Browser closed.');
  try {
    await saveState();
    console.log(`[LoginTool] ✓ Session profile saved to: ${profileDir}`);
  } catch {}

  console.log('[LoginTool] Done! Nexus Copilot will now automatically use your logins.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[LoginTool] Error:', err);
  process.exit(1);
});
