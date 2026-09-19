'use strict';

const Observer = require('../observer/observer');
const ToolExecutor = require('../executor/executor');
const ActionVerifier = require('../verifier/verifier');
const { RecoveryEngine, RECOVERY_STRATEGIES } = require('../recovery/recovery.engine');
const TaskPlanner = require('../planner/task.planner');
const ShortTermMemory = require('../../services/memory/short-term.memory');
const RiskAssessor = require('../../policies/risk/risk.assessor');
const PermissionPolicy = require('../../policies/permissions/permission.policy');
const { createBrowserToolRegistry } = require('../../tools/registry/browser.tools');
const config = require('../../config');
const { AgentApiError } = require('../../services/llm/gemini.service');

/**
 * AgentOrchestrator
 *
 * Implements the full Observe -> Decide -> Act -> Verify -> Recover loop.
 */
class AgentOrchestrator {
  /**
   * @param {object} options
   * @param {import('../../services/llm/model.gateway')} [options.modelGateway]
   * @param {import('../../runtime/browser.runtime')} options.runtime
   * @param {string} [options.policyMode='auto']
   * @param {import('../../services/realtime/socket.service')} [options.socketService]
   * @param {import('../../services/memory/long-term.memory')} [options.longTermMemory]
   */
  constructor({ modelGateway, runtime, policyMode = 'auto', socketService, longTermMemory }) {
    if (!runtime) throw new Error('AgentOrchestrator: runtime is required');
    this._runtime = runtime;
    this._model = modelGateway || null;
    this._socket = socketService || null;
    this._longTermMemory = longTermMemory || null;

    // Components
    this._observer = new Observer(this._model);
    this._registry = createBrowserToolRegistry();
    this._riskAssessor = new RiskAssessor(policyMode);
    this._permissionPolicy = new PermissionPolicy();
    this._executor = new ToolExecutor({
      registry: this._registry,
      riskAssessor: this._riskAssessor,
      permissionPolicy: this._permissionPolicy,
    });
    this._verifier = new ActionVerifier();
    this._recovery = new RecoveryEngine();
    this._planner = new TaskPlanner(this._model);

    this.maxSteps = config.agent.maxSteps || 25;
    this._maxModelCalls = config.agent.maxModelCalls;
    this._maxVisionCalls = config.agent.maxVisionCalls;
  }

  /**
   * Run a full task until completion, failure, pause, or max steps.
   *
   * @param {import('../task/task.graph')} task
   * @returns {Promise<object>}
   */
  async run(task) {
    if (task.status === 'pending') {
      task.start();
      this._emitRealtime('task:started', task.getSummary());

      // Initial task planning
      try {
        const plannedSteps = await this._planner.plan(task.goal);
        task.setPlannedSteps(plannedSteps);
        this._emitRealtime('task:planned', { taskId: task.id, steps: plannedSteps });
      } catch (err) {
        console.warn('[Orchestrator] Planning failed, proceeding with direct decisions:', err.message);
      }
    }

    const memory = new ShortTermMemory(task.id);

    while (!task.isTerminal && !task.isWaiting) {
      if (task.stepCount >= this.maxSteps) {
        task.fail(`Exceeded maximum allowed steps (${this.maxSteps})`);
        break;
      }

      const stepResult = await this.step(task, memory);

      if (task.isTerminal || task.status === 'cancelled') {
        break;
      }

      if (stepResult.requiresApproval) {
        // Paused waiting for human in the loop
        break;
      }

      if (stepResult.taskComplete) {
        task.complete(stepResult.result || 'Task completed successfully');
        if (this._longTermMemory) {
          this._longTermMemory.recordTaskOutcome({
            goal: task.goal,
            stepsCount: task.stepCount,
            success: true,
            summary: stepResult.result || 'Task completed successfully',
          }).catch(() => {});
        }
        break;
      }

      if (stepResult.error && stepResult.terminal) {
        task.fail(stepResult.error);
        break;
      }
    }

    this._emitRealtime('task:updated', task.getSummary());
    return task.getSummary();
  }

  /**
   * Execute a single step in the Observe -> Decide -> Act -> Verify cycle.
   *
   * @param {import('../task/task.graph')} task
   * @param {ShortTermMemory} memory
   * @param {boolean} [bypassApproval=false]
   * @returns {Promise<object>}
   */
  async step(task, memory, bypassApproval = false) {
    const stepNumber = task.stepCount + 1;
    if (task.isTerminal || task.status === 'cancelled') {
      return { error: 'Task cancelled by user', terminal: true };
    }

    if (task.lastUserResponse) {
      memory.add({
        action: 'user_response',
        reasoning: 'User responded to agent question or granted authorization',
        outcome: `User response: "${task.lastUserResponse}"`,
        success: true,
      });
      task.lastUserResponse = null;
    }

    this._emitRealtime('step:started', { taskId: task.id, stepNumber });

    // ── 1. OBSERVE ────────────────────────────────────────────────────────────
    let observation;
    try {
      if (task.visionCallCount >= this._maxVisionCalls) {
        console.warn(
          '[Orchestrator] Vision budget exhausted (%d/%d). Vision will be skipped by observer if supported.',
          task.visionCallCount, this._maxVisionCalls
        );
      }
      observation = await this._observer.observe(this._runtime, { goal: task.goal });
      if (task.isTerminal || task.status === 'cancelled') {
        return { error: 'Task cancelled by user', terminal: true };
      }
      if (observation.usedVision) {
        task.visionCallCount++;
      }
      this._emitRealtime('observation:ready', { taskId: task.id, observation });
    } catch (err) {
      if (task.isTerminal || task.status === 'cancelled') {
        return { error: 'Task cancelled by user', terminal: true };
      }
      console.error('[Orchestrator] Observation error:', err);
      return { error: `Observation failed: ${err.message}`, terminal: true };
    }

    // ── 2. DECIDE ─────────────────────────────────────────────────────────────
    if (task.isTerminal || task.status === 'cancelled') {
      return { error: 'Task cancelled by user', terminal: true };
    }
    let decision;
    const history = memory.getContextForModel();
    const availableTools = this._registry.list();

    if (this._model) {
      // Model call budget guard — fail the task (not silently complete it)
      if (task.modelCallCount >= this._maxModelCalls) {
        const budgetMsg = `Model call budget exhausted (${task.modelCallCount}/${this._maxModelCalls}). Task stopped to avoid quota waste.`;
        console.error('[Orchestrator] %s', budgetMsg);
        return { error: budgetMsg, terminal: true };
      }

      task.modelCallCount++;
      try {
        let memoryContext = null;
        if (this._longTermMemory) {
          try {
            let domain = '';
            if (observation.pageState?.url && observation.pageState.url.startsWith('http')) {
              try { domain = new URL(observation.pageState.url).hostname; } catch {}
            }
            const [domainPattern, relevantHistory] = await Promise.all([
              domain ? this._longTermMemory.getDomainPattern(domain) : null,
              this._longTermMemory.searchRelevant(task.goal, 2),
            ]);
            if (domainPattern || (relevantHistory && relevantHistory.length > 0)) {
              memoryContext = { domainPattern, relevantHistory };
            }
          } catch {}
        }

        decision = await this._model.decide(
          task.goal,
          observation.pageState,
          history,
          availableTools,
          memoryContext
        );
      } catch (err) {
        if (task.isTerminal || task.status === 'cancelled') {
          return { error: 'Task cancelled by user', terminal: true };
        }
        const apiErr = err instanceof AgentApiError ? err : null;
        const errType = apiErr ? apiErr.type : 'UNKNOWN';

        console.error('[Orchestrator] Model decision failed (type=%s): %s', errType, err.message);
        this._emitRealtime('model:error', { taskId: task.id, errorType: errType, message: err.message });

        // Errors that mean the agent cannot make progress — stop immediately
        if (apiErr && !apiErr.retryable) {
          return {
            error: `${errType}: ${err.message}`,
            terminal: true,
          };
        }

        // Transient / unknown — fall back to heuristic for this one step only
        console.warn('[Orchestrator] Falling back to heuristic decision for this step.');
        decision = this._fallbackDecision(task.goal, observation.pageState, history);
      }
    } else {
      decision = this._fallbackDecision(task.goal, observation.pageState, history);
    }

    if (task.isTerminal || task.status === 'cancelled') {
      return { error: 'Task cancelled by user', terminal: true };
    }

    this._emitRealtime('decision:made', { taskId: task.id, decision });

    // Check if model declared the task complete
    if (decision.taskComplete) {
      if (task.isTerminal || task.status === 'cancelled') {
        return { error: 'Task cancelled by user', terminal: true };
      }
      task.recordStep({
        tool: 'none',
        arguments: {},
        outcome: decision.reasoning || 'Goal completed',
        success: true,
        verified: true,
      });
      return { taskComplete: true, result: decision.result || decision.reasoning };
    }

    // If no tool was chosen
    if (!decision.tool) {
      return { error: 'No tool decided by agent', terminal: false };
    }

    // ── 3. APPROVAL CHECK & INTERACTIVE USER QUESTIONS ───────────────────────
    if (decision.tool === 'ask_user') {
      const q = decision.arguments?.question || decision.reasoning || 'Nexus is requesting your input or access permission to continue.';
      task.waitForApproval({
        stepNumber,
        tool: 'ask_user',
        arguments: decision.arguments || {},
        question: q,
        context: decision.arguments?.context || '',
        reason: q,
        reasoning: decision.reasoning,
        isQuestion: true,
      });
      this._emitRealtime('task:approval_required', task.pendingApproval);
      return { requiresApproval: true, approvalRequest: task.pendingApproval };
    }

    if (!bypassApproval) {
      const toolDef = this._registry.get(decision.tool);
      if (toolDef) {
        const assessment = this._riskAssessor.assess(toolDef);
        if (assessment.decision === 'require_approval') {
          task.waitForApproval({
            stepNumber,
            tool: decision.tool,
            arguments: decision.arguments,
            reason: assessment.reason,
            reasoning: decision.reasoning,
          });
          this._emitRealtime('task:approval_required', task.pendingApproval);
          return { requiresApproval: true, approvalRequest: task.pendingApproval };
        } else if (assessment.decision === 'block') {
          task.block(assessment.reason);
          this._emitRealtime('task:blocked', { taskId: task.id, reason: assessment.reason });
          return { error: assessment.reason, terminal: true };
        }
      }
    }

    // ── 4. ACT ────────────────────────────────────────────────────────────────
    if (task.isTerminal || task.status === 'cancelled') {
      return { error: 'Task cancelled by user', terminal: true };
    }

    const executionContext = {
      runtime: this._runtime,
      task,
    };

    const executionResult = await this._executor.execute(
      { tool: decision.tool, args: decision.arguments },
      executionContext,
      bypassApproval
    );

    if (task.isTerminal || task.status === 'cancelled') {
      return { error: 'Task cancelled by user', terminal: true };
    }

    // Invalidate observation cache on page-altering actions
    if (['browser.navigate', 'browser.click', 'browser.submit_form', 'browser.back'].includes(decision.tool)) {
      this._observer.invalidateCache();
    }

    // ── 5. VERIFY ─────────────────────────────────────────────────────────────
    let afterObservation;
    try {
      afterObservation = await this._observer.observe(this._runtime, { goal: task.goal });
    } catch {
      afterObservation = observation;
    }

    if (task.isTerminal || task.status === 'cancelled') {
      return { error: 'Task cancelled by user', terminal: true };
    }

    const verification = await this._verifier.verify({
      decision: { tool: decision.tool, args: decision.arguments, expectedOutcome: decision.expectedOutcome },
      executionResult,
      beforeObservation: observation,
      afterObservation,
      runtime: this._runtime,
    });

    if (task.isTerminal || task.status === 'cancelled') {
      return { error: 'Task cancelled by user', terminal: true };
    }

    this._emitRealtime('verification:result', { taskId: task.id, verification });

    // ── 6. RECOVER (if verification or execution failed) ───────────────────────
    if (!verification.verified || !executionResult.success) {
      if (task.isTerminal || task.status === 'cancelled') {
        console.log('[Orchestrator] Task was cancelled by user. Halting execution without retry.');
        return { error: 'Task cancelled by user', terminal: true };
      }

      task.recoveryCount++;
      const failureError = executionResult.error || verification.reason;

      const diagnosis = this._recovery.diagnose({
        error: failureError,
        step: { id: `step_${stepNumber}`, description: decision.reasoning },
        task,
        observation: afterObservation,
      });

      console.log('[Orchestrator] Failure diagnosed. Recovery strategy: %s (%s)', diagnosis.strategy, diagnosis.reason);
      this._emitRealtime('recovery:triggered', { taskId: task.id, diagnosis });

      if (diagnosis.strategy === RECOVERY_STRATEGIES.ABORT) {
        task.recordStep({
          tool: decision.tool,
          arguments: decision.arguments,
          outcome: `Failed & Aborted: ${failureError}`,
          success: false,
          verified: false,
        });
        return { error: diagnosis.reason, terminal: true };
      }

      if (diagnosis.strategy === RECOVERY_STRATEGIES.REQUEST_USER_HELP) {
        task.waitForApproval({
          stepNumber,
          tool: decision.tool,
          arguments: decision.arguments,
          reason: diagnosis.reason,
          needsHumanAction: true,
        });
        return { requiresApproval: true, approvalRequest: task.pendingApproval };
      }

      // Execute automated recovery action only if not cancelled
      if (!task.isTerminal && task.status !== 'cancelled') {
        await this._recovery.executeRecovery(diagnosis.strategy, this._runtime);
      }

      if (diagnosis.backoffMs && !task.isTerminal) {
        await new Promise((r) => setTimeout(r, diagnosis.backoffMs));
      }
    }

    // ── 7. RECORD STEP IN HISTORY & MEMORY ────────────────────────────────────
    const stepRecord = {
      tool: decision.tool,
      arguments: decision.arguments,
      outcome: verification.verified ? verification.reason : `Warning: ${verification.reason}`,
      success: executionResult.success,
      verified: verification.verified,
    };

    task.recordStep(stepRecord);
    memory.add({
      action: `${decision.tool}(${JSON.stringify(decision.arguments || {})})`,
      reasoning: decision.reasoning,
      outcome: stepRecord.outcome,
      success: stepRecord.success && stepRecord.verified,
    });

    this._emitRealtime('step:completed', { taskId: task.id, stepNumber, record: stepRecord });

    return {
      success: executionResult.success && verification.verified,
      decision,
      executionResult,
      verification,
      taskComplete: false,
    };
  }

  /**
   * Fallback decision logic when model is not configured or fails.
   */
  _fallbackDecision(goal, pageState, history) {
    // If not yet on a webpage
    if (!pageState.url || pageState.url === 'about:blank') {
      const urlMatch = goal.match(/https?:\/\/[^\s]+/);
      return {
        tool: 'browser.navigate',
        arguments: { url: urlMatch ? urlMatch[0] : 'https://www.google.com' },
        reasoning: 'Navigating to initial target page',
        expectedOutcome: 'Page loads',
        taskComplete: false,
        confidence: 0.9,
      };
    }

    // If search goal and on google
    if (pageState.url.includes('google.com') && history.length === 1) {
      const inputEl = (pageState.interactiveElements || []).find(
        (el) => el.role === 'textbox' || el.tagName === 'textarea' || el.tagName === 'input'
      );
      if (inputEl) {
        return {
          tool: 'browser.type',
          arguments: {
            selector: inputEl.selector || 'textarea[name="q"], input[name="q"]',
            text: goal,
            pressEnter: true,
          },
          reasoning: 'Typing search query into search box',
          expectedOutcome: 'Search results displayed',
          taskComplete: false,
          confidence: 0.85,
        };
      }
    }

    // Complete if already visited and interacted
    if (history.length >= 2) {
      return {
        tool: null,
        reasoning: 'Initial operations completed based on page state',
        taskComplete: true,
        confidence: 0.8,
        result: `Visited ${pageState.url} and completed goal actions.`,
      };
    }

    return {
      tool: 'browser.get_state',
      arguments: {},
      reasoning: 'Inspecting current page state',
      expectedOutcome: 'Obtain page metadata',
      taskComplete: false,
      confidence: 0.5,
    };
  }

  _emitRealtime(event, payload) {
    if (this._socket) {
      try {
        this._socket.emit(event, payload);
      } catch (err) {
        console.warn('[Orchestrator] Socket emit failed:', err.message);
      }
    }
  }
}

module.exports = AgentOrchestrator;
