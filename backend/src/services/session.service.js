'use strict';

let uuidv4;
try {
  uuidv4 = require('uuid').v4;
} catch {
  const crypto = require('crypto');
  uuidv4 = () => crypto.randomUUID();
}
const BrowserRuntime = require('../runtime/browser.runtime');
const TaskGraph = require('../agent/task/task.graph');
const AgentOrchestrator = require('../agent/orchestrator/orchestrator');
const { createGeminiGateway } = require('./llm/gemini.service');
const LongTermMemory = require('./memory/long-term.memory');

const socketService = require('./realtime/socket.service');
const dbService = require('./db.service');

/**
 * SessionService
 *
 * Manages active browser sessions, running agents, and task graphs.
 */
class SessionService {
  /**
   * @param {object} [options]
   * @param {import('./realtime/socket.service')} [options.socketService]
   * @param {import('./db.service')} [options.dbService]
   */
  constructor({ socketService: socket, dbService: db } = {}) {
    if (SessionService.instance) {
      return SessionService.instance;
    }
    SessionService.instance = this;

    this._socket = socket || socketService;
    this._db = db || dbService;

    /** @type {Map<string, { runtime: BrowserRuntime, orchestrator: AgentOrchestrator, tasks: Map<string, TaskGraph> }>} */
    this.sessions = new Map();

    /** Global task lookup */
    this.tasks = new Map();

    // Shared model gateway and long-term memory
    try {
      this._modelGateway = createGeminiGateway();
    } catch {
      this._modelGateway = null;
    }
    this._longTermMemory = new LongTermMemory(this._db);
  }

  /**
   * Get or launch a browser session.
   *
   * @param {string} [sessionId]
   * @param {object} [options]
   * @returns {Promise<{ sessionId: string, runtime: BrowserRuntime, orchestrator: AgentOrchestrator }>}
   */
  async getOrCreateSession(sessionId, options = {}) {
    const id = sessionId || uuidv4();

    if (this.sessions.has(id)) {
      const existing = this.sessions.get(id);
      if (existing.runtime) {
        await existing.runtime.ensureReady();
      }
      return { sessionId: id, ...existing };
    }

    const runtime = new BrowserRuntime(options.browserConfig || {});
    await runtime.launch();

    const orchestrator = new AgentOrchestrator({
      modelGateway: this._modelGateway,
      runtime,
      policyMode: options.policyMode || 'auto',
      socketService: this._socket,
      longTermMemory: this._longTermMemory,
    });

    const sessionData = {
      runtime,
      orchestrator,
      tasks: new Map(),
      createdAt: new Date().toISOString(),
    };

    this.sessions.set(id, sessionData);
    console.log('[SessionService] Session created: %s', id);
    return { sessionId: id, ...sessionData };
  }

  /**
   * Create a new task within a session.
   *
   * @param {string} goal
   * @param {string} [sessionId]
   * @returns {Promise<{ task: TaskGraph, session: object }>}
   */
  async createTask(goal, sessionId) {
    const session = await this.getOrCreateSession(sessionId);
    const task = new TaskGraph(goal, session.sessionId);

    session.tasks.set(task.id, task);
    this.tasks.set(task.id, { task, session });

    return { task, session };
  }

  /**
   * Get task by ID.
   * @param {string} taskId
   * @returns {TaskGraph|null}
   */
  getTask(taskId) {
    return this.tasks.get(taskId)?.task || null;
  }

  /**
   * Get all tasks across sessions.
   * @returns {Array<object>}
   */
  getAllTasks() {
    return Array.from(this.tasks.values()).map(({ task }) => task.getSummary());
  }

  /**
   * Close a browser session and free resources.
   * @param {string} sessionId
   */
  async closeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    try {
      await session.runtime.close();
    } catch (err) {
      console.warn('[SessionService] Runtime close error:', err.message);
    }

    this.sessions.delete(sessionId);
    console.log('[SessionService] Session closed: %s', sessionId);
    return true;
  }

  /**
   * Close all active sessions.
   */
  async closeAll() {
    for (const [id, session] of this.sessions.entries()) {
      try {
        await session.runtime.close();
      } catch (err) {
        console.warn(`[SessionService] Error closing session ${id}:`, err.message);
      }
    }
    this.sessions.clear();
  }
}

const defaultSessionService = new SessionService();
module.exports = defaultSessionService;
module.exports.SessionService = SessionService;
