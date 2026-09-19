'use strict';

/**
 * RecoveryStrategy Enum
 */
const RECOVERY_STRATEGIES = {
  RETRY_BACKOFF: 'RETRY_BACKOFF',
  FALLBACK_SELECTOR: 'FALLBACK_SELECTOR',
  RELOAD_PAGE: 'RELOAD_PAGE',
  NAVIGATE_BACK: 'NAVIGATE_BACK',
  VISION_FALLBACK: 'VISION_FALLBACK',
  REQUEST_USER_HELP: 'REQUEST_USER_HELP',
  REPLAN: 'REPLAN',
  ABORT: 'ABORT',
};

/**
 * RecoveryEngine
 *
 * Diagnoses action/verification failures and selects remediation strategies.
 */
class RecoveryEngine {
  /**
   * @param {object} [options]
   * @param {number} [options.maxStepRetries=3]
   * @param {number} [options.maxTaskRecoveries=5]
   */
  constructor(options = {}) {
    this.maxStepRetries = options.maxStepRetries || 3;
    this.maxTaskRecoveries = options.maxTaskRecoveries || 5;
    this._stepRetryCounts = new Map();
  }

  /**
   * Diagnose failure and determine the best recovery strategy.
   *
   * @param {object} params
   * @param {Error|string} params.error
   * @param {object} params.step - Current step in task
   * @param {import('../task/task.graph')} params.task
   * @param {object} [params.observation] - Current page observation
   * @returns {{ strategy: string, reason: string, backoffMs?: number, alternateSelector?: string }}
   */
  diagnose({ error, step, task, observation }) {
    const stepId = step?.id || 'current';
    const currentRetries = (this._stepRetryCounts.get(stepId) || 0) + 1;
    this._stepRetryCounts.set(stepId, currentRetries);

    const errorMessage = (typeof error === 'string' ? error : error?.message || '').toLowerCase();

    // Check task-wide recovery limit
    if (task.recoveryCount >= this.maxTaskRecoveries) {
      return {
        strategy: RECOVERY_STRATEGIES.ABORT,
        reason: `Exceeded maximum task recovery limit (${this.maxTaskRecoveries} recoveries)`,
      };
    }

    // Check step-specific retry limit
    if (currentRetries > this.maxStepRetries) {
      return {
        strategy: RECOVERY_STRATEGIES.REPLAN,
        reason: `Step "${stepId}" failed ${currentRetries - 1} times. Escalating to planner for replanning.`,
      };
    }

    // 1. CAPTCHA / Bot detection / Cloudflare
    if (observation?.pageState?.title?.toLowerCase().includes('just a moment...')) {
      if (currentRetries <= 2) {
        return {
          strategy: RECOVERY_STRATEGIES.RETRY_BACKOFF,
          backoffMs: 2500,
          reason: 'Waiting for Cloudflare security transition to complete...',
        };
      }
      return {
        strategy: RECOVERY_STRATEGIES.REQUEST_USER_HELP,
        reason: 'Cloudflare challenge page detected. Human intervention required.',
      };
    }

    if (
      errorMessage.includes('captcha') ||
      errorMessage.includes('cloudflare') ||
      errorMessage.includes('verify you are human')
    ) {
      return {
        strategy: RECOVERY_STRATEGIES.REQUEST_USER_HELP,
        reason: 'Bot detection or CAPTCHA detected on page. Human intervention required.',
      };
    }

    // 2. Element Not Found / Invalid Selector / Detached
    if (
      errorMessage.includes('no element found') ||
      errorMessage.includes('waiting for selector') ||
      errorMessage.includes('element is not visible') ||
      errorMessage.includes('not interactable') ||
      errorMessage.includes('target closed')
    ) {
      // Suggest vision fallback or selector adaptation
      if (!observation?.usedVision) {
        return {
          strategy: RECOVERY_STRATEGIES.VISION_FALLBACK,
          reason: 'Element could not be resolved from DOM. Falling back to visual screenshot observation.',
        };
      }

      return {
        strategy: RECOVERY_STRATEGIES.RETRY_BACKOFF,
        backoffMs: 1500 * currentRetries,
        reason: 'Element selector lookup timed out. Retrying with delay for dynamic rendering.',
      };
    }

    // 3. Navigation / Network Timeout
    if (
      errorMessage.includes('timeout') ||
      errorMessage.includes('net::err') ||
      errorMessage.includes('connection refused')
    ) {
      return {
        strategy: RECOVERY_STRATEGIES.RETRY_BACKOFF,
        backoffMs: 2000 * currentRetries,
        reason: 'Network operation timed out. Retrying with exponential backoff.',
      };
    }

    // 4. Stale or Blank Page
    if (observation?.pageState?.interactiveElements?.length === 0) {
      return {
        strategy: RECOVERY_STRATEGIES.RELOAD_PAGE,
        reason: 'Page has no detectable interactive elements. Reloading page.',
      };
    }

    // Default: Exponential backoff retry
    return {
      strategy: RECOVERY_STRATEGIES.RETRY_BACKOFF,
      backoffMs: 1000 * currentRetries,
      reason: `Transient failure: ${errorMessage}. Retrying (attempt ${currentRetries}/${this.maxStepRetries}).`,
    };
  }

  /**
   * Reset retry count for a completed step.
   * @param {string} stepId
   */
  resetStep(stepId) {
    this._stepRetryCounts.delete(stepId);
  }

  /**
   * Execute an automated recovery action on the runtime if applicable.
   *
   * @param {string} strategy
   * @param {import('../../runtime/browser.runtime')} runtime
   * @returns {Promise<void>}
   */
  async executeRecovery(strategy, runtime) {
    if (!runtime) return;

    switch (strategy) {
      case RECOVERY_STRATEGIES.RELOAD_PAGE: {
        try {
          const page = runtime.getPage();
          if (page) await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
        } catch (err) {
          console.warn('[RecoveryEngine] Reload failed:', err.message);
        }
        break;
      }
      case RECOVERY_STRATEGIES.NAVIGATE_BACK: {
        try {
          await runtime.goBack();
        } catch (err) {
          console.warn('[RecoveryEngine] Navigate back failed:', err.message);
        }
        break;
      }
      default:
        break;
    }
  }
}

module.exports = {
  RecoveryEngine,
  RECOVERY_STRATEGIES,
};
