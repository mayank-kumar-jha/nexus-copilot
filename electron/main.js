'use strict';

const path = require('path');
const os = require('os');
const { app, BrowserWindow, ipcMain, screen, session, systemPreferences, globalShortcut } = require('electron');

// Set isolated user data directory to prevent Windows cache lock conflicts
app.setName('nexus-desktop-assistant');
const customUserData = path.join(os.tmpdir(), 'nexus-overlay-profile');
app.setPath('userData', customUserData);

// Chromium flags for clean, fast transparent rendering and speech/audio permissions
app.commandLine.appendSwitch('disable-gpu-cache');
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('enable-speech-dispatcher');
app.commandLine.appendSwitch('enable-features', 'WebSpeechAPI,SpeechRecognition');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream'); // Auto-accept audio permission prompts
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let mainWindow = null;

// Generous window dimensions so subtle shadows have space without any rectangular clipping
const SIZES = {
  COLLAPSED: { width: 340, height: 72 },
  EXPANDED: { width: 600, height: 510 },
};

function getCenteredX(width) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth } = primaryDisplay.workAreaSize;
  return Math.round((screenWidth - width) / 2);
}

const { spawn } = require('child_process');
const http = require('http');

let backendProcess = null;

async function isBackendRunning() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:3000/api/health', { timeout: 1000 }, (res) => {
      resolve(res.statusCode === 200 || res.statusCode === 404);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function startBackendServer() {
  const rootDir = path.resolve(__dirname, '..');
  const serverScript = path.join(rootDir, 'backend', 'src', 'server.js');
  
  backendProcess = spawn('node', [serverScript], {
    cwd: path.join(rootDir, 'backend'),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: false,
  });

  backendProcess.stdout?.on('data', (d) => console.log(`[Backend] ${d.toString().trim()}`));
  backendProcess.stderr?.on('data', (d) => console.error(`[Backend ERR] ${d.toString().trim()}`));

  backendProcess.on('error', (err) => {
    console.error('[Electron] Backend server spawn error:', err);
  });
}

function stopBackendServer() {
  if (backendProcess) {
    try {
      backendProcess.kill('SIGTERM');
      process.kill(backendProcess.pid);
    } catch {}
    backendProcess = null;
  }
}

function createWindow() {
  const initialWidth = SIZES.COLLAPSED.width;
  const initialHeight = SIZES.COLLAPSED.height;
  const initialX = getCenteredX(initialWidth);
  const initialY = 12;

  mainWindow = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    x: initialX,
    y: initialY,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    focusable: true,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      allowRunningInsecureContent: true,
    },
  });

  // Keep window floating on top without blocking foreground browser windows
  mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });

  const startUrl = 'http://localhost:3000';
  mainWindow.loadURL(startUrl).catch(() => {
    mainWindow.loadFile(path.join(__dirname, '../frontend/index.html'));
  });

  // Prevent navigating away
  mainWindow.webContents.on('will-navigate', (e) => {
    e.preventDefault();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── IPC Handlers for Dynamic Resizing & Wake Word ───────────────────────────
ipcMain.on('nexus:expand', (_event, { height } = {}) => {
  if (!mainWindow) return;
  const width = SIZES.EXPANDED.width;
  const targetHeight = height || SIZES.EXPANDED.height;
  const x = getCenteredX(width);
  mainWindow.setBounds({ x, y: 12, width, height: targetHeight });
});

ipcMain.on('nexus:collapse', () => {
  if (!mainWindow) return;
  const width = SIZES.COLLAPSED.width;
  const height = SIZES.COLLAPSED.height;
  const x = getCenteredX(width);
  mainWindow.setBounds({ x, y: 12, width, height });
});

ipcMain.on('nexus:wakeword-triggered', () => {
  if (!mainWindow) return;
  const width = SIZES.EXPANDED.width;
  const height = SIZES.EXPANDED.height;
  const x = getCenteredX(width);
  mainWindow.setBounds({ x, y: 12, width, height });
  mainWindow.show();
  mainWindow.focus();
});

ipcMain.on('nexus:resize', (_event, { width, height }) => {
  if (!mainWindow) return;
  const w = width || SIZES.EXPANDED.width;
  const h = height || SIZES.EXPANDED.height;
  const x = getCenteredX(w);
  mainWindow.setBounds({ x, y: 12, width, height: h });
});

ipcMain.on('nexus:close', () => {
  if (mainWindow) {
    mainWindow.close();
  }
  stopBackendServer();
  app.quit();
});

// ─── App Lifecycle & Explicit Microphone Permission Grant ───────────────────
app.whenReady().then(async () => {
  // Check and grant media permissions
  if (session.defaultSession) {
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      return callback(true);
    });

    session.defaultSession.setPermissionCheckHandler(() => true);
  }

  const running = await isBackendRunning();
  if (!running) {
    startBackendServer();
    // Wait for server to listen
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 400));
      if (await isBackendRunning()) break;
    }
  }

  createWindow();

  try {
    const triggerPushToTalk = () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send('nexus:global-voice-trigger');
      }
    };
    globalShortcut.register('Shift+num1', triggerPushToTalk);
    globalShortcut.register('Shift+1', triggerPushToTalk);
  } catch (err) {
    console.warn('[Electron] Global shortcut registration notice:', err.message);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  try { globalShortcut.unregisterAll(); } catch {}
  stopBackendServer();
});

app.on('window-all-closed', () => {
  try { globalShortcut.unregisterAll(); } catch {}
  stopBackendServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
