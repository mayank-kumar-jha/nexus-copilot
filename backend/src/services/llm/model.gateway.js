'use strict';

/**
 * ModelGateway
 *
 * Provider-independent AI abstraction.
 * The rest of the codebase depends ONLY on this interface — never on Gemini directly.
 *
 * To swap providers: implement the same interface in a new service file,
 * update the factory at the bottom of this file.
 *
 * Methods:
 *   generate(prompt)                    — raw text generation
 *   decide(goal, pageState, history)    — structured action decision
 *   plan(goal, context)                 — break goal into steps
 *   analyzeScreenshot(imageBuffer, prompt) — vision analysis
 */
class ModelGateway {
  /**
   * @param {object} provider - An object implementing the provider interface
   */
  constructor(provider) {
    if (!provider) throw new Error('ModelGateway: provider is required');
    this._provider = provider;

    // Instrumentation counters
    this.stats = {
      totalCalls: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalLatencyMs: 0,
      visionCalls: 0,
      errors: 0,
    };
  }

  /**
   * Raw text generation.
   * @param {string} prompt
   * @returns {Promise<string>}
   */
  async generate(prompt) {
    return this._call(() => this._provider.generate(prompt));
  }

  /**
   * Agent decision — given goal + page state + history, return a structured action.
   *
   * @param {string} goal
   * @param {object} pageState
   * @param {Array} history
   * @param {Array} availableTools
   * @returns {Promise<AgentDecision>}
   */
  async decide(goal, pageState, history, availableTools) {
    return this._call(() => this._provider.decide(goal, pageState, history, availableTools));
  }

  /**
   * Task planner — break a goal into concrete steps.
   *
   * @param {string} goal
   * @param {object} context
   * @returns {Promise<TaskPlan>}
   */
  async plan(goal, context) {
    return this._call(() => this._provider.plan(goal, context));
  }

  /**
   * Vision analysis — only called when structured perception is insufficient.
   *
   * @param {Buffer} imageBuffer
   * @param {string} prompt
   * @returns {Promise<string>}
   */
  async analyzeScreenshot(imageBuffer, prompt) {
    this.stats.visionCalls++;
    return this._call(() => this._provider.analyzeScreenshot(imageBuffer, prompt));
  }

  /**
   * Wrapper that tracks instrumentation for every model call.
   */
  async _call(fn) {
    const start = Date.now();
    this.stats.totalCalls++;

    try {
      const result = await fn();

      // Provider should attach token usage to result if available
      if (result && result._usage) {
        this.stats.totalInputTokens += result._usage.inputTokens || 0;
        this.stats.totalOutputTokens += result._usage.outputTokens || 0;
      }

      this.stats.totalLatencyMs += Date.now() - start;
      return result;
    } catch (err) {
      this.stats.errors++;
      this.stats.totalLatencyMs += Date.now() - start;
      throw err;
    }
  }

  /** Return a snapshot of current stats. */
  getStats() {
    return { ...this.stats };
  }
}

/**
 * @typedef {Object} AgentDecision
 * @property {string|null} tool - Tool name, or null if task is complete
 * @property {object} arguments - Tool arguments
 * @property {string} reasoning
 * @property {string} expectedOutcome
 * @property {boolean} taskComplete
 * @property {number} confidence
 * @property {string} [result] - Summary when taskComplete=true
 */

/**
 * @typedef {Object} TaskPlan
 * @property {TaskStep[]} steps
 */

module.exports = ModelGateway;
