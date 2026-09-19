'use strict';

/**
 * Nexus Persistent Login Helper
 *
 * Launches the official Chrome browser instance in interactive mode.
 * You can navigate to any website (e.g. ChatGPT, Google, GitHub, LinkedIn),
 * log in, and press Enter in the console (or close the browser) to save all
 * cookies, local storage, and authentication tokens permanently to:
 * %LOCALAPPDATA%\NexusCopilot\storage-state.json
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const os = require('os');

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
    console.log('[LoginTool] No previous session found. Starting fresh session...');
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
  } catch {
    browser = await chromium.launch({
      headless: false,
      args: extraArgs,
    });
  }

  const context = await browser.newContext({
    viewport: null,
    storageState: hasExistingState ? stateFile : undefined,
  });

  const page = await context.newPage();
  await page.goto('https://www.google.com');

  console.log('\n[LoginTool] Chrome window is now OPEN.');
  console.log('👉 Navigate to any website you want to log into (e.g. ChatGPT, Google, GitHub, etc.)');
  console.log('👉 Complete your login, 2FA, or CAPTCHA verification in the browser.');
  console.log('👉 Once you are logged in, come back here and PRESS [ENTER] to save your session.');
  console.log('----------------------------------------------------');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  await new Promise((resolve) => {
    rl.question('\nPress [ENTER] when you are finished logging in: ', async () => {
      rl.close();
      resolve();
    });

    context.on('close', () => {
      rl.close();
      resolve();
    });
  });

  console.log('\n[LoginTool] Saving authentication tokens and cookies...');
  try {
    await context.storageState({ path: stateFile });
    console.log(`[LoginTool] ✓ Session successfully saved to: ${stateFile}`);
    console.log('[LoginTool] Nexus Copilot will now automatically use these logins on all future tasks!');
  } catch (err) {
    console.error('[LoginTool] Error saving storage state:', err.message);
  }

  try {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  } catch {}

  console.log('[LoginTool] Done. You can close this window.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[LoginTool] Fatal error:', err);
  process.exit(1);
});
