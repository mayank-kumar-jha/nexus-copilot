'use strict';

const taskQueue = require('../services/queue/task.queue');

/**
 * AgentController
 *
 * REST API handlers for running, stepping, inspecting, and approving agent tasks.
 */
class AgentController {
  /**
   * @param {import('../services/session.service')} sessionService
   */
  constructor(sessionService) {
    this._sessions = sessionService;
  }

  /**
   * POST /api/agent/run
   * Start a task. If async=true, enqueues in background. Otherwise runs synchronously.
   */
  run = async (req, res, next) => {
    try {
      const { goal, sessionId, async: isAsync, policyMode } = req.body || {};
      if (!goal) {
        return res.status(400).json({ success: false, error: 'Field "goal" is required' });
      }

      const { task, session } = await this._sessions.createTask(goal, sessionId);

      if (isAsync) {
        await taskQueue.enqueue(task.id, { goal, sessionId: session.sessionId, policyMode });
        return res.status(202).json({
          success: true,
          message: 'Task queued for background execution',
          task: task.getSummary(),
        });
      }

      // Synchronous run
      const summary = await session.orchestrator.run(task);
      return res.json({
        success: true,
        task: summary,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/agent/step
   * Trigger a single step on an existing or new task.
   */
  step = async (req, res, next) => {
    try {
      const { taskId, goal, sessionId, bypassApproval } = req.body || {};

      let task;
      let session;

      if (taskId) {
        task = this._sessions.getTask(taskId);
        if (!task) {
          return res.status(404).json({ success: false, error: `Task "${taskId}" not found` });
        }
        const sessionInfo = this._sessions.tasks.get(taskId);
        session = sessionInfo.session;
      } else {
        if (!goal) {
          return res.status(400).json({ success: false, error: 'Either "taskId" or "goal" is required' });
        }
        const created = await this._sessions.createTask(goal, sessionId);
        task = created.task;
        session = created.session;
        task.start();
      }

      const ShortTermMemory = require('../services/memory/short-term.memory');
      const memory = new ShortTermMemory(task.id);

      const stepResult = await session.orchestrator.step(task, memory, Boolean(bypassApproval));
      return res.json({
        success: true,
        task: task.getSummary(),
        stepResult,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/agent/tasks
   * List all tasks.
   */
  listTasks = async (_req, res) => {
    const tasks = this._sessions.getAllTasks();
    res.json({ success: true, count: tasks.length, tasks });
  };

  /**
   * GET /api/agent/tasks/:id
   * Get task details with planned steps and execution history.
   */
  getTask = async (req, res) => {
    const { id } = req.params;
    const task = this._sessions.getTask(id);
    if (!task) {
      return res.status(404).json({ success: false, error: `Task "${id}" not found` });
    }

    res.json({
      success: true,
      task: {
        ...task.getSummary(),
        plannedSteps: task.plannedSteps,
        executionHistory: task.executionHistory,
      },
    });
  };

  /**
   * POST /api/agent/tasks/:id/approve
   * Approve a pending action that requires human confirmation.
   */
  approveAction = async (req, res, next) => {
    try {
      const { id } = req.params;
      const task = this._sessions.getTask(id);
      if (!task) {
        return res.status(404).json({ success: false, error: `Task "${id}" not found` });
      }

      if (task.status !== 'waiting_for_user') {
        return res.status(400).json({
          success: false,
          error: `Task is not waiting for approval (current status: ${task.status})`,
        });
      }

      const userResponse = req.body?.response || req.body?.input || 'Approved / Access Granted';
      const approvedAction = task.approve('human_api', userResponse);
      const sessionInfo = this._sessions.tasks.get(id);

      // Continue execution
      sessionInfo.session.orchestrator.run(task).catch((err) => {
        console.error(`[AgentController] Error continuing approved task ${id}:`, err);
      });

      res.json({
        success: true,
        message: 'Action approved, task resumed',
        approvedAction,
        task: task.getSummary(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/agent/tasks/:id/cancel
   * Cancel a running or waiting task.
   */
  cancelTask = async (req, res) => {
    const { id } = req.params;
    const task = this._sessions.getTask(id);
    if (!task) {
      return res.status(404).json({ success: false, error: `Task "${id}" not found` });
    }

    task.cancel();
    const sessionInfo = this._sessions.tasks.get(id);
    if (sessionInfo?.session) {
      if (sessionInfo.session.runtime) {
        sessionInfo.session.runtime.stop().catch(() => {});
      }
      if (sessionInfo.session.orchestrator) {
        sessionInfo.session.orchestrator._emitRealtime('task:cancelled', { taskId: task.id, status: 'cancelled' });
        sessionInfo.session.orchestrator._emitRealtime('task:updated', task.getSummary());
      }
    }
    res.json({
      success: true,
      message: 'Task cancelled',
      task: task.getSummary(),
    });
  };
}

module.exports = AgentController;
