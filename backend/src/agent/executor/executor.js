'use strict';

/**
 * ToolExecutor
 *
 * Dispatches decisions to registered tools, handling schema validation,
 * policy evaluation (RiskAssessor + PermissionPolicy), and execution telemetry.
 */
class ToolExecutor {
  /**
   * @param {object} options
   * @param {import('../../tools/registry/tool.registry')} options.registry
   * @param {import('../../policies/risk/risk.assessor')} [options.riskAssessor]
   * @param {import('../../policies/permissions/permission.policy')} [options.permissionPolicy]
   */
  constructor({ registry, riskAssessor, permissionPolicy }) {
    if (!registry) throw new Error('ToolExecutor requires a ToolRegistry');
    this._registry = registry;
    this._riskAssessor = riskAssessor || null;
    this._permissionPolicy = permissionPolicy || null;
  }

  /**
   * Execute an agent decision.
   *
   * @param {object} decision - { tool: string, args: object, reasoning?: string }
   * @param {object} context - Execution context, e.g. { runtime, task }
   * @param {boolean} [bypassApproval=false] - True if human approved this action
   * @returns {Promise<ExecutionResult>}
   */
  async execute(decision, context, bypassApproval = false) {
    const { tool: toolName, args = {} } = decision;
    const startTime = Date.now();

    // 1. Verify tool exists in registry
    const tool = this._registry.get(toolName);
    if (!tool) {
      return {
        success: false,
        tool: toolName,
        args,
        result: null,
        error: `Tool "${toolName}" is not registered in ToolRegistry`,
        durationMs: Date.now() - startTime,
        requiresApproval: false,
      };
    }

    // 2. Permission Policy Check
    if (this._permissionPolicy) {
      const permCheck = this._permissionPolicy.checkTool(toolName, args);
      if (!permCheck.allowed) {
        return {
          success: false,
          tool: toolName,
          args,
          result: null,
          error: `Permission denied: ${permCheck.reason}`,
          durationMs: Date.now() - startTime,
          requiresApproval: false,
        };
      }
    }

    // 3. Risk Assessment Check
    if (this._riskAssessor && !bypassApproval) {
      const assessment = this._riskAssessor.assess(tool);
      if (assessment.decision === 'block') {
        return {
          success: false,
          tool: toolName,
          args,
          result: null,
          error: `Security blocked: ${assessment.reason}`,
          durationMs: Date.now() - startTime,
          requiresApproval: false,
        };
      }

      if (assessment.decision === 'require_approval') {
        return {
          success: false,
          tool: toolName,
          args,
          result: null,
          error: assessment.reason,
          durationMs: Date.now() - startTime,
          requiresApproval: true,
          approvalReason: assessment.reason,
        };
      }
    }

    // 4. Dispatch tool execution
    try {
      const result = await this._registry.execute(toolName, args, context);
      return {
        success: true,
        tool: toolName,
        args,
        result,
        error: null,
        durationMs: Date.now() - startTime,
        requiresApproval: false,
      };
    } catch (err) {
      return {
        success: false,
        tool: toolName,
        args,
        result: null,
        error: err.message || String(err),
        durationMs: Date.now() - startTime,
        requiresApproval: false,
      };
    }
  }
}

/**
 * @typedef {Object} ExecutionResult
 * @property {boolean} success
 * @property {string} tool
 * @property {object} args
 * @property {*} result
 * @property {string|null} error
 * @property {number} durationMs
 * @property {boolean} requiresApproval
 * @property {string} [approvalReason]
 */

module.exports = ToolExecutor;
