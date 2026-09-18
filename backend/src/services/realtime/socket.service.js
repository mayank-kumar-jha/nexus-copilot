'use strict';

const { Server } = require('socket.io');

/**
 * SocketService
 *
 * Real-time event broadcasting over WebSockets for live agent telemetry.
 */
class SocketService {
  constructor() {
    this._io = null;
  }

  /**
   * Attach Socket.IO to an HTTP server.
   * @param {import('http').Server} httpServer
   * @param {object} [corsOptions]
   */
  init(httpServer, corsOptions = {}) {
    this._io = new Server(httpServer, {
      cors: corsOptions || { origin: '*' },
    });

    this._io.on('connection', (socket) => {
      console.log('[SocketService] Client connected: %s', socket.id);

      socket.on('subscribe:task', (taskId) => {
        socket.join(`task:${taskId}`);
        console.log(`[SocketService] Socket ${socket.id} joined task:${taskId}`);
      });

      socket.on('disconnect', () => {
        console.log('[SocketService] Client disconnected: %s', socket.id);
      });
    });

    console.log('[SocketService] Real-time gateway ready.');
  }

  /**
   * Broadcast an event to all connected clients or a specific task room.
   *
   * @param {string} event
   * @param {object} payload
   */
  emit(event, payload) {
    if (!this._io) return;
    this._io.emit(event, payload);
  }

  get io() {
    return this._io;
  }
}

module.exports = new SocketService();
