'use strict';

const config = require('../../config');
const taskQueue = require('./task.queue');

/**
 * TaskWorker
 *
 * Runs queued background agent tasks.
 */
class TaskWorker {
  /**
   * @param {import('../session.service')} sessionService
   */
  constructor(sessionService) {
    this._sessionService = sessionService;
    this._worker = null;
    this._init();
  }

  _init() {
    const handler = async (jobData) => {
      const { taskId, goal, sessionId, policyMode } = jobData;
      console.log(`[TaskWorker] Starting background task ${taskId}: "${goal}"`);

      let session;
      let task;

      if (this._sessionService.getTask(taskId)) {
        task = this._sessionService.getTask(taskId);
        const sessionInfo = this._sessionService.tasks.get(taskId);
        session = sessionInfo.session;
      } else {
        const created = await this._sessionService.createTask(goal, sessionId);
        task = created.task;
        session = created.session;
      }

      await session.orchestrator.run(task);
      console.log(`[TaskWorker] Task ${taskId} finished with status: ${task.status}`);
    };

    // Register with in-memory runner
    taskQueue.setWorkerHandler(handler);

    // If Redis is enabled, start BullMQ Worker
    if (config.redis.enabled && config.redis.url) {
      try {
        const { Worker } = require('bullmq');
        const IORedis = require('ioredis');
        const connection = new IORedis(config.redis.url, {
          maxRetriesPerRequest: null,
          lazyConnect: true,
          enableOfflineQueue: false,
        });

        connection.on('error', (err) => {
          console.warn('[TaskWorker] Redis connection notice:', err.message);
        });

        this._worker = new Worker(
          'agent-tasks',
          async (job) => handler(job.data),
          { connection, concurrency: 2 }
        );

        this._worker.on('failed', (job, err) => {
          console.error(`[TaskWorker] Job ${job?.id} failed:`, err);
        });

        this._worker.on('error', (err) => {
          console.warn('[TaskWorker] Worker notice:', err.message);
        });

        console.log('[TaskWorker] BullMQ Worker started.');
      } catch (err) {
        console.warn('[TaskWorker] BullMQ worker init skipped:', err.message);
      }
    }
  }

  async close() {
    if (this._worker) {
      await this._worker.close().catch(() => {});
    }
  }
}

module.exports = TaskWorker;
