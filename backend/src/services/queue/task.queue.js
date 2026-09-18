'use strict';

const config = require('../../config');

/**
 * TaskQueue
 *
 * Distributed job queue using BullMQ when Redis is available,
 * with an in-memory asynchronous job dispatcher fallback when Redis is absent.
 */
class TaskQueue {
  constructor() {
    this.isRedis = false;
    this._queue = null;
    this._inMemoryQueue = [];
    this._processing = false;
    this._handler = null;

    if (config.redis.enabled && config.redis.url) {
      try {
        const { Queue } = require('bullmq');
        const IORedis = require('ioredis');
        const connection = new IORedis(config.redis.url, {
          maxRetriesPerRequest: null,
          lazyConnect: true,
          enableOfflineQueue: false,
        });

        connection.on('error', (err) => {
          console.warn('[TaskQueue] Redis unavailable (using in-memory queue):', err.message);
          this.isRedis = false;
        });

        this._queue = new Queue('agent-tasks', { connection });
        this.isRedis = true;
        console.log('[TaskQueue] BullMQ queue initialized with Redis.');
      } catch (err) {
        console.warn('[TaskQueue] Redis queue init skipped, using in-memory queue:', err.message);
      }
    } else {
      console.log('[TaskQueue] Running with in-memory task queue (no Redis).');
    }
  }

  /**
   * Register the worker handler for executing queued jobs.
   * @param {Function} handler - async (jobData) => Promise<void>
   */
  setWorkerHandler(handler) {
    this._handler = handler;
  }

  /**
   * Add a task to the queue for background execution.
   *
   * @param {string} taskId
   * @param {object} payload - { goal, sessionId, policyMode }
   * @returns {Promise<{ jobId: string }>}
   */
  async enqueue(taskId, payload) {
    if (this.isRedis && this._queue) {
      const job = await this._queue.add('run-task', { taskId, ...payload }, {
        jobId: taskId,
        removeOnComplete: 100,
        removeOnFail: 200,
      });
      return { jobId: job.id };
    }

    // In-memory queue dispatch
    this._inMemoryQueue.push({ taskId, ...payload });
    this._processInMemoryQueue();
    return { jobId: taskId };
  }

  async _processInMemoryQueue() {
    if (this._processing || this._inMemoryQueue.length === 0) return;
    this._processing = true;

    while (this._inMemoryQueue.length > 0) {
      const item = this._inMemoryQueue.shift();
      if (this._handler) {
        try {
          await this._handler(item);
        } catch (err) {
          console.error(`[TaskQueue] Error executing in-memory task ${item.taskId}:`, err);
        }
      }
    }

    this._processing = false;
  }

  async close() {
    if (this._queue) {
      await this._queue.close().catch(() => {});
    }
  }
}

module.exports = new TaskQueue();
