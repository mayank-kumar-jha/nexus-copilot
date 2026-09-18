@echo off
title AI Browser Agent - Persistent Profile Login
cd /d "%~dp0backend"
echo ======================================================
echo   OPENING PERSISTENT GOOGLE CHROME FOR ONE-TIME LOGIN
echo ======================================================
echo.
echo Log into your accounts (ChatGPT, Google, Amazon, etc.) in this Chrome window.
echo Everything is saved permanently in backend\user-data\
echo When finished logging in, just close the Chrome window.
echo.
node -e "
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const userDataDir = path.resolve('./user-data');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'chrome',
    args: ['--start-maximized']
  });
  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://chatgpt.com');
  console.log('Chrome is open. Log into your accounts, then close Chrome.');
  await new Promise(r => context.on('close', r));
  console.log('Saved profile successfully!');
})();
"
pause
