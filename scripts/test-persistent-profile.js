'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

let chromium;
try {
  chromium = require('playwright').chromium;
} catch {
  chromium = require(path.join(__dirname, '../backend/node_modules/playwright')).chromium;
}

async function test() {
  console.log('[Test] Testing Persistent Profile Launch...');

  const baseLocalDir = process.env.LOCALAPPDATA || os.tmpdir();
  const profileDir = path.join(baseLocalDir, 'NexusCopilot', 'UserProfile');
  if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });

  console.log('[Test] Profile Dir:', profileDir);

  // Kill any dangling nexus agent browser processes
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

  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: false,
    viewport: null,
    args: extraArgs,
  });

  console.log('[Test] ✓ Context launched successfully!');
  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();
  
  await page.goto('https://news.ycombinator.com', { waitUntil: 'domcontentloaded' });
  const title = await page.title();
  console.log('[Test] ✓ Page loaded! Title:', title);

  await new Promise(r => setTimeout(r, 2000));
  await context.close();
  console.log('[Test] ✓ Context closed cleanly without errors!');
}

test().catch(e => {
  console.error('[Test] Failed:', e);
  process.exit(1);
});
