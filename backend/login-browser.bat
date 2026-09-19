@echo off
title AI Browser Agent - Persistent Profile Login
cd /d "%~dp0"
echo ======================================================
echo   OPENING PERSISTENT GOOGLE CHROME FOR ONE-TIME LOGIN
echo ======================================================
echo.
echo Log into your accounts (ChatGPT, Google, Amazon, etc.) in this Chrome window.
echo When finished logging in, just close the Chrome window.
echo.
node -e "
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');
(async () => {
  const baseLocalDir = process.env.LOCALAPPDATA || os.tmpdir();
  const appDir = path.join(baseLocalDir, 'NexusCopilot');
  if (!fs.existsSync(appDir)) fs.mkdirSync(appDir, { recursive: true });
  const stateFile = path.join(appDir, 'storage-state.json');
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: ['--start-maximized']
  });
  const context = await browser.newContext({
    viewport: null,
    storageState: fs.existsSync(stateFile) ? stateFile : undefined
  });
  const page = await context.newPage();
  await page.goto('https://www.google.com');
  console.log('Chrome is open. Log into your accounts, then close the browser.');
  await new Promise(r => page.on('close', r));
  await context.storageState({ path: stateFile }).catch(() => {});
  await browser.close().catch(() => {});
  console.log('Saved session successfully to ' + stateFile);
})();
"
pause
