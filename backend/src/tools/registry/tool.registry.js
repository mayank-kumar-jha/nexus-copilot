'use strict';

/**
 * ToolRegistry
 *
 * Central registry for all tools the agent is allowed to use.
 * Every tool must be explicitly registered before the agent can request it.
 *
 * Tool contract:
 * {
 *   name: string           — unique identifier e.g. "browser.navigate"
 *   description: string    — human+model readable description
 *   schema: object         — input parameter definitions
 *   riskLevel: string      — SAFE | SENSITIVE | DANGEROUS
 *   execute: async fn      — the actual executor
 * }
 *
 * The registry validates action requests before execution.
 * The AI model never calls tools directly — it requests them by name+args,
 * and this registry validates and dispatches.
 */
class ToolRegistry {
  constructor() {
    /** @type {Map<string, ToolDefinition>} */
    this._tools = new Map();
  }

  /**
   * Register a tool.
   * @param {ToolDefinition} tool
   */
  register(tool) {
    if (!tool.name || !tool.execute || !tool.riskLevel) {
      throw new Error(`ToolRegistry: tool missing required fields: ${JSON.stringify(Object.keys(tool))}`);
    }
    if (this._tools.has(tool.name)) {
      throw new Error(`ToolRegistry: tool "${tool.name}" already registered`);
    }
    this._tools.set(tool.name, tool);
    console.log('[ToolRegistry] Registered: %s (%s)', tool.name, tool.riskLevel);
  }

  /**
   * Get a tool by name.
   * @param {string} name
   * @returns {ToolDefinition | undefined}
   */
  get(name) {
    return this._tools.get(name);
  }

  /**
   * Check if a tool exists.
   */
  has(name) {
    return this._tools.has(name);
  }

  /**
   * Validate a requested action against the registry.
   * Returns { valid, tool, errors }
   *
   * @param {{ tool: string, arguments: object }} action
   */
  validate(action) {
    if (!action || !action.tool) {
      return { valid: false, errors: ['action.tool is required'] };
    }

    const tool = this._tools.get(action.tool);
    if (!tool) {
      return {
        valid: false,
        errors: [`Unknown tool: "${action.tool}". Available: ${[...this._tools.keys()].join(', ')}`],
      };
    }

    const args = action.arguments || {};
    const errors = [];

    // Validate required fields from schema
    if (tool.schema) {
      for (const [field, def] of Object.entries(tool.schema)) {
        if (def.required && (args[field] === undefined || args[field] === null || args[field] === '')) {
          errors.push(`Missing required argument: "${field}"`);
        }
        if (args[field] !== undefined && def.type && typeof args[field] !== def.type) {
          errors.push(`Argument "${field}" must be ${def.type}, got ${typeof args[field]}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      tool,
      errors,
    };
  }

  /**
   * Validate and execute a tool by name.
   *
   * @param {string} name
   * @param {object} args
   * @param {object} context
   * @returns {Promise<any>}
   */
  async execute(name, args = {}, context = {}) {
    const validation = this.validate({ tool: name, arguments: args });
    if (!validation.valid) {
      throw new Error(`Tool validation failed: ${validation.errors.join(', ')}`);
    }
    return validation.tool.execute(args, context);
  }

  /**
   * List all registered tools (for the model's system prompt).
   * @returns {ToolSummary[]}
   */
  list() {
    return [...this._tools.values()].map((t) => ({
      name: t.name,
      description: t.description,
      schema: t.schema,
      riskLevel: t.riskLevel,
    }));
  }
}

/**
 * @typedef {Object} ToolDefinition
 * @property {string} name
 * @property {string} description
 * @property {Object} schema
 * @property {'SAFE'|'SENSITIVE'|'DANGEROUS'} riskLevel
 * @property {Function} execute
 */

/**
 * @typedef {Object} ToolSummary
 * @property {string} name
 * @property {string} description
 * @property {Object} schema
 * @property {string} riskLevel
 */

module.exports = ToolRegistry;
