'use strict';

/**
 * TaskPlanner
 *
 * Breaks high-level user goals into structured, ordered steps.
 * Uses ModelGateway when available, with a resilient heuristic fallback.
 */
class TaskPlanner {
  /**
   * @param {import('../../services/llm/model.gateway')} [modelGateway]
   */
  constructor(modelGateway) {
    this._model = modelGateway || null;
  }

  /**
   * Create a step-by-step plan for a user goal.
   *
   * @param {string} goal
   * @param {object} [context]
   * @returns {Promise<Array<{ id: string, description: string, expectedTools?: string[] }>>}
   */
  async plan(goal, context = {}) {
    if (this._model) {
      try {
        const planResult = await this._model.plan(goal, context);
        if (planResult && Array.isArray(planResult.steps) && planResult.steps.length > 0) {
          return planResult.steps.map((step, idx) => ({
            id: step.id || `step_${idx + 1}`,
            description: step.description || `Step ${idx + 1}`,
            expectedTools: step.expectedTools || [],
          }));
        }
      } catch (err) {
        console.warn('[TaskPlanner] Model planning failed, falling back to heuristic plan:', err.message);
      }
    }

    // Resilient heuristic planner fallback
    return this._generateHeuristicPlan(goal);
  }

  /**
   * Replan steps when an obstacle or failure is encountered.
   *
   * @param {string} goal
   * @param {Array} completedSteps
   * @param {object} failedStep
   * @param {object} currentObservation
   * @returns {Promise<Array<{ id: string, description: string, expectedTools?: string[] }>>}
   */
  async replan(goal, completedSteps = [], failedStep, currentObservation = {}) {
    const context = {
      completedSteps: completedSteps.map((s) => s.description),
      failedStep: failedStep?.description || 'Unknown step',
      currentPage: {
        url: currentObservation?.pageState?.url,
        title: currentObservation?.pageState?.title,
      },
    };

    if (this._model) {
      try {
        const prompt = `Goal: "${goal}".\nFailed at: "${context.failedStep}".\nCurrent page: ${context.currentPage.url} (${context.currentPage.title}).\nCreate alternative recovery steps to accomplish the remaining goal.`;
        const planResult = await this._model.plan(prompt, context);
        if (planResult && Array.isArray(planResult.steps) && planResult.steps.length > 0) {
          return planResult.steps.map((step, idx) => ({
            id: `replan_${Date.now()}_${idx + 1}`,
            description: step.description,
            expectedTools: step.expectedTools || [],
          }));
        }
      } catch (err) {
        console.warn('[TaskPlanner] Model replan failed, falling back:', err.message);
      }
    }

    return [
      {
        id: `recovery_${Date.now()}`,
        description: `Recover from failure on "${failedStep?.description || 'current action'}" and re-examine page state`,
        expectedTools: ['browser.get_state', 'browser.screenshot'],
      },
      {
        id: `retry_goal_${Date.now()}`,
        description: `Proceed with goal: ${goal}`,
        expectedTools: ['browser.click', 'browser.type'],
      },
    ];
  }

  /**
   * Simple deterministic heuristic plan generator based on goal text.
   */
  _generateHeuristicPlan(goal) {
    const lower = (goal || '').toLowerCase();
    const steps = [];

    // Check if goal contains a URL
    const urlMatch = goal.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      steps.push({
        id: 'step_1_nav',
        description: `Navigate to ${urlMatch[0]}`,
        expectedTools: ['browser.navigate'],
      });
    } else if (lower.includes('search') || lower.includes('find') || lower.includes('google')) {
      steps.push({
        id: 'step_1_nav',
        description: 'Navigate to search engine',
        expectedTools: ['browser.navigate'],
      });
      steps.push({
        id: 'step_2_search',
        description: `Perform search query for: ${goal}`,
        expectedTools: ['browser.type', 'browser.click'],
      });
    } else {
      steps.push({
        id: 'step_1_start',
        description: `Inspect initial page and plan execution for: ${goal}`,
        expectedTools: ['browser.get_state'],
      });
    }

    steps.push({
      id: `step_${steps.length + 1}_interact`,
      description: 'Interact with relevant page elements to satisfy requirements',
      expectedTools: ['browser.click', 'browser.type', 'browser.scroll'],
    });

    steps.push({
      id: `step_${steps.length + 1}_verify`,
      description: 'Verify results and conclude task execution',
      expectedTools: ['browser.get_state', 'browser.screenshot'],
    });

    return steps;
  }
}

module.exports = TaskPlanner;
