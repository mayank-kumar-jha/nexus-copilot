const path = require('path');
// Load environment variables before anything else
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config();

const http = require('http');
const app = require('./app');
const config = require('./config');
const socketService = require('./services/realtime/socket.service');
const dbService = require('./services/db.service');
const sessionService = require('./services/session.service');
const TaskWorker = require('./services/queue/task.worker');

const { port, env } = config.server;

const server = http.createServer(app);

// ─── Initialize Realtime Gateway (Phase 13) ──────────────────────────────────
socketService.init(server, {
  cors: {
    origin: config.server.corsOrigin,
    methods: ['GET', 'POST'],
  },
});

// ─── Initialize Background Worker (Phase 12) ─────────────────────────────────
const taskWorker = new TaskWorker(sessionService);

// ─── Connect Database (Phase 9) ──────────────────────────────────────────────
dbService.connect().catch((err) => {
  console.warn('[Server] DB initialization notice:', err.message);
});

// ─── Start HTTP & WebSocket Server ───────────────────────────────────────────
server.listen(port, () => {
  console.log('[Server] Started in %s mode on port %d', env, port);
  console.log('[Server] Health check:       http://localhost:%d/api/health', port);
  console.log('[Server] Tools list:         http://localhost:%d/api/tools', port);
  console.log('[Server] Agent run endpoint: POST http://localhost:%d/api/agent/run', port);
  console.log('[Server] Realtime WebSocket: ws://localhost:%d (Socket.IO)', port);
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('[Server] Received %s. Shutting down gracefully…', signal);

  try {
    await taskWorker.close();
    await sessionService.closeAll();
    await dbService.disconnect();
  } catch (err) {
    console.warn('[Server] Error during component cleanup:', err.message);
  }

  server.close(() => {
    console.log('[Server] HTTP server closed.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('[Server] Forced exit after timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled rejection:', reason);
});
