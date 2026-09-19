'use strict';

let uuidv4;
try {
  uuidv4 = require('uuid').v4;
} catch {
  const crypto = require('crypto');
  uuidv4 = () => crypto.randomUUID();
}

/**
 * TaskGraph
 *
 * Represents a running task as a state machine.
 * Each task has a goal, a series of planned steps, and a live execution history.
 *
 * Statuses:
 *   pending          — created but not started
 *   running          — actively being executed
 *   completed        — goal achieved
 *   failed           — could not complete, max retries exceeded
 *   blocked          — policy blocked an action
 *   waiting_for_user — paused, awaiting human approval
 *   cancelled        — explicitly stopped
 */

const VALID_STATUSES = new Set([
  'pending', 'running', 'completed', 'failed',
  'blocked', 'waiting_for_user', 'cancelled',
]);

class TaskGraph {
  /**
   * @param {string} goal - Natural language goal
   * @param {string} [sessionId]
   */
  constructor(goal, sessionId) {
    this.id = uuidv4();
    this.sessionId = sessionId || uuidv4();
    this.goal = goal;
    this.status = 'pending';

    /** @type {TaskStep[]} */
    this.plannedSteps = [];

    /** @type {ExecutionRecord[]} */
    this.executionHistory = [];

    this.stepCount = 0;
    this.recoveryCount = 0;
    this.visionCallCount = 0;
    this.modelCallCount = 0;

    // Approval gate — set when waiting_for_user
    this.pendingApproval = null;

    this.error = null;
    this.result = null;

    this.createdAt = new Date().toISOString();
    this.startedAt = null;
    this.completedAt = null;
    this.updatedAt = new Date().toISOString();
  }

  // ─── Status transitions ───────────────────────────────────────────────────

  start() {
    if (this.status === 'cancelled') return;
    this._transition('running');
    this.startedAt = new Date().toISOString();
  }

  complete(result) {
    if (this.status === 'cancelled') return;
    this.result = result;
    this._transition('completed');
    this.completedAt = new Date().toISOString();
  }

  fail(reason) {
    if (this.status === 'cancelled') return;
    this.error = reason;
    this._transition('failed');
    this.completedAt = new Date().toISOString();
  }

  block(reason) {
    if (this.status === 'cancelled') return;
    this.error = reason;
    this._transition('blocked');
  }

  waitForApproval(approvalRequest) {
    this.pendingApproval = {
      ...approvalRequest,
      requestedAt: new Date().toISOString(),
    };
    this._transition('waiting_for_user');
  }

  approve(approvedBy = 'user', userResponse = null) {
    if (this.status !== 'waiting_for_user') {
      throw new Error(`TaskGraph: Cannot approve task in status "${this.status}"`);
    }
    const approval = this.pendingApproval;
    this.pendingApproval = null;
    this.lastUserResponse = userResponse || 'Approved / Access Granted';
    this._transition('running');
    return approval;
  }

  cancel() {
    this._transition('cancelled');
    this.completedAt = new Date().toISOString();
  }

  // ─── Planned steps ────────────────────────────────────────────────────────

  setPlannedSteps(steps) {
    this.plannedSteps = steps.map((s, i) => ({
      id: s.id || `step_${i + 1}`,
      description: s.description,
      expectedTools: s.expectedTools || [],
      status: 'pending',
      startedAt: null,
      completedAt: null,
      retries: 0,
    }));
  }

  // ─── Execution history ────────────────────────────────────────────────────

  recordStep(record) {
    this.stepCount++;
    this.updatedAt = new Date().toISOString();
    this.executionHistory.push({
      stepNumber: this.stepCount,
      ...record,
      timestamp: new Date().toISOString(),
    });
  }

  // ─── Getters ──────────────────────────────────────────────────────────────

  get isTerminal() {
    return ['completed', 'failed', 'blocked', 'cancelled'].includes(this.status);
  }

  get isWaiting() {
    return this.status === 'waiting_for_user';
  }

  getSummary() {
    return {
      id: this.id,
      sessionId: this.sessionId,
      goal: this.goal,
      status: this.status,
      stepCount: this.stepCount,
      recoveryCount: this.recoveryCount,
      modelCallCount: this.modelCallCount,
      visionCallCount: this.visionCallCount,
      result: this.result,
      error: this.error,
      pendingApproval: this.pendingApproval,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
    };
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  _transition(newStatus) {
    if (!VALID_STATUSES.has(newStatus)) {
      throw new Error(`TaskGraph: Invalid status "${newStatus}"`);
    }
    console.log('[TaskGraph] %s: %s → %s', this.id.substring(0, 8), this.status, newStatus);
    this.status = newStatus;
    this.updatedAt = new Date().toISOString();
  }
}

/**
 * @typedef {Object} TaskStep
 * @property {string} id
 * @property {string} description
 * @property {string[]} expectedTools
 * @property {'pending'|'running'|'completed'|'failed'} status
 * @property {string|null} startedAt
 * @property {string|null} completedAt
 * @property {number} retries
 */

/**
 * @typedef {Object} ExecutionRecord
 * @property {number} stepNumber
 * @property {string} tool
 * @property {object} arguments
 * @property {string} outcome
 * @property {boolean} success
 * @property {boolean} verified
 * @property {string} timestamp
 */

module.exports = TaskGraph;
