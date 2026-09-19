'use strict';

const path = require('path');
const { spawn } = require('child_process');

const rootDir = __dirname;
const electronBinary = path.join(rootDir, 'node_modules', 'electron', 'dist', 'electron.exe');
const mainScript = path.join(rootDir, 'electron', 'main.js');
const serverScript = path.join(rootDir, 'backend', 'src', 'server.js');

const http = require('http');

async function isServerRunning() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:3000/api/health', { timeout: 1000 }, (res) => {
      resolve(res.statusCode === 200 || res.statusCode === 404);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

let globalServerProc = null;

async function startServer() {
  console.log('[Nexus] Starting backend agent server...');
  globalServerProc = spawn('node', [serverScript], {
    cwd: path.join(rootDir, 'backend'),
    stdio: 'inherit',
    detached: false,
  });

  globalServerProc.on('error', (err) => {
    console.error('[Nexus] Backend server process error:', err.message);
  });

  // Wait for server to become responsive
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 400));
    if (await isServerRunning()) {
      console.log('[Nexus] Backend server online at http://localhost:3000');
      return globalServerProc;
    }
  }
  console.warn('[Nexus] Backend server start timeout, proceeding with overlay launch...');
  return globalServerProc;
}

async function startElectron() {
  console.log('[Nexus] Launching Desktop Floating Overlay...');
  
  const electronExe = require('fs').existsSync(electronBinary) ? electronBinary : 'electron';
  const child = spawn(electronExe, [mainScript], {
    cwd: rootDir,
    stdio: 'inherit',
    windowsHide: false,
  });

  child.on('error', (err) => {
    console.error('[Nexus] Failed to start Electron overlay:', err.message);
  });

  child.on('exit', (code) => {
    console.log(`[Nexus] Desktop overlay exited with code ${code}`);
    if (globalServerProc) {
      try { globalServerProc.kill(); } catch {}
    }
    process.exit(code || 0);
  });
}

async function main() {
  const running = await isServerRunning();
  if (!running) {
    await startServer();
  } else {
    console.log('[Nexus] Backend server already running on port 3000');
  }

  await startElectron();
}

main().catch((err) => {
  console.error('[Nexus] Launch fatal error:', err);
  process.exit(1);
});
