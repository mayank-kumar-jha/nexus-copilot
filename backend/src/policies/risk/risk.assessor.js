'use strict';

/**
 * RiskAssessor
 *
 * Maps tool risk levels to policy decisions.
 *
 * Risk levels:
 *   SAFE       — navigation, reading, scrolling, searching, screenshots
 *   SENSITIVE  — form submission, sending messages, file operations
 *   DANGEROUS  — system commands, destructive operations (blocked by default)
 *
 * Policy modes:
 *   auto       — execute SAFE automatically, pause on SENSITIVE, block DANGEROUS
 *   permissive — execute SAFE + SENSITIVE automatically, block DANGEROUS
 *   strict     — pause on everything above SAFE
 *   readonly   — only SAFE tools allowed
 */

const RISK_LEVELS = {
  SAFE: 0,
  SENSITIVE: 1,
  DANGEROUS: 2,
};

const POLICY_THRESHOLDS = {
  auto: { autoExecute: 0, requireApproval: 1, block: 2 },        // default
  permissive: { autoExecute: 1, requireApproval: -1, block: 2 },  // CI/testing
  strict: { autoExecute: -1, requireApproval: 0, block: 2 },      // high-trust needed
  readonly: { autoExecute: 0, requireApproval: -1, block: 1 },    // read-only
};

class RiskAssessor {
  constructor(mode = 'auto') {
    if (!POLICY_THRESHOLDS[mode]) {
      throw new Error(`RiskAssessor: Unknown mode "${mode}". Valid: ${Object.keys(POLICY_THRESHOLDS).join(', ')}`);
    }
    this._mode = mode;
    this._thresholds = POLICY_THRESHOLDS[mode];
    console.log('[RiskAssessor] Policy mode: %s', mode);
  }

  /**
   * Assess a tool action and return a policy decision.
   *
   * @param {object} tool - From the tool registry
   * @returns {{ decision: 'execute'|'require_approval'|'block', reason: string }}
   */
  assess(tool) {
    const level = RISK_LEVELS[tool.riskLevel] ?? 0;

    if (level > this._thresholds.block - 1) {
      return {
        decision: 'block',
        reason: `Tool "${tool.name}" has risk level ${tool.riskLevel} which is blocked in "${this._mode}" mode`,
      };
    }

    if (level > this._thresholds.autoExecute) {
      return {
        decision: 'require_approval',
        reason: `Tool "${tool.name}" (${tool.riskLevel}) requires human approval in "${this._mode}" mode`,
      };
    }

    return {
      decision: 'execute',
      reason: `Tool "${tool.name}" is ${tool.riskLevel} — auto-executing`,
    };
  }

  get mode() { return this._mode; }
}

module.exports = RiskAssessor;
