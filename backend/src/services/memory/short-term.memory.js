'use strict';

/**
 * ShortTermMemory
 *
 * Per-task in-memory scratchpad.
 * Stores the execution history for the current task: observations, decisions, results.
 * Cleared when the task completes or is abandoned.
 *
 * This is passed to the model to provide context for its decisions.
 * The model only sees the last N entries to manage token count.
 */
class ShortTermMemory {
  constructor(maxEntries = 20) {
    this._maxEntries = maxEntries;
    /** @type {MemoryEntry[]} */
    this._entries = [];
  }

  /**
   * Add an entry (observation, decision, or result).
   * @param {MemoryEntry} entry
   */
  add(entry) {
    this._entries.push({
      ...entry,
      timestamp: new Date().toISOString(),
    });

    // Keep only the last N entries to avoid runaway token cost
    if (this._entries.length > this._maxEntries) {
      this._entries = this._entries.slice(-this._maxEntries);
    }
  }

  /**
   * Get entries for the model context (recent N steps).
   * @param {number} [n] - Number of recent entries to return
   */
  getRecent(n) {
    const entries = n ? this._entries.slice(-n) : this._entries;
    return entries.map((e) => ({
      type: e.type,
      action: e.action,
      outcome: e.outcome,
      pageUrl: e.pageUrl,
    }));
  }

  getContextForModel(n) {
    return this.getRecent(n);
  }

  /** Clear all entries. */
  clear() {
    this._entries = [];
  }

  get size() { return this._entries.length; }
}

/**
 * @typedef {Object} MemoryEntry
 * @property {'action'|'observation'|'error'|'recovery'} type
 * @property {string} [action] - What action was taken
 * @property {string} [outcome] - What happened
 * @property {string} [pageUrl] - Page URL at the time
 * @property {string} [timestamp]
 */

module.exports = ShortTermMemory;
