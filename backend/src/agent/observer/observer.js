'use strict';

const PageStateExtractor = require('../../perception/page-state/page-state.extractor');
const fs = require('fs');

const extractor = new PageStateExtractor();

/**
 * Observer
 *
 * Gathers the current state of the browser page and decides whether
 * structured perception is sufficient or a screenshot is needed.
 *
 * Decision hierarchy (Phase 7):
 *   1. Extract structured page state (accessibility + DOM)
 *   2. If canResolveFromStructuredState() → return structured state
 *   3. Otherwise → capture screenshot → pass to vision model
 */
class Observer {
  /**
   * @param {object} [modelGateway] - Optional — used for vision fallback
   */
  constructor(modelGateway) {
    this._model = modelGateway || null;

    this.stats = {
      structuredObservations: 0,
      visionObservations: 0,
      screenshotsCaptured: 0,
    };

    // Cache: avoid re-analyzing screenshots if the page hasn't changed
    this._lastObservationUrl = null;
    this._lastObservationTitle = null;
    this._cachedPageState = null;
  }

  /**
   * Observe the current page and return a normalized observation.
   *
   * @param {import('../../runtime/browser.runtime')} runtime
   * @param {{ forceVision?: boolean, goal?: string }} [options]
   * @returns {Promise<Observation>}
   */
  async observe(runtime, options = {}) {
    const start = Date.now();

    // Always ensure browser and active page are running
    await runtime.ensureReady();
    const page = runtime.getPage();
    const pageState = await extractor.extract(page);

    // Check if the page is cached (URL + title unchanged)
    const isCached =
      pageState.url === this._lastObservationUrl &&
      pageState.title === this._lastObservationTitle;

    if (!options.forceVision && isCached && this._cachedPageState) {
      return {
        ...this._cachedPageState,
        fromCache: true,
        latencyMs: Date.now() - start,
      };
    }

    // Update cache keys
    this._lastObservationUrl = pageState.url;
    this._lastObservationTitle = pageState.title;

    const canUseStructured =
      pageState.url === 'about:blank' ||
      pageState.url === '' ||
      extractor.canResolveFromStructuredState(pageState);

    if (canUseStructured && !options.forceVision) {
      // Structured state is sufficient — no screenshot needed
      this.stats.structuredObservations++;

      const observation = {
        pageState,
        usedVision: false,
        visionAnalysis: null,
        latencyMs: Date.now() - start,
        fromCache: false,
      };

      this._cachedPageState = observation;
      return observation;
    }

    // ── Vision fallback (Phase 7) ──────────────────────────────────────────
    // Only reaches here if structured state is insufficient
    console.log('[Observer] Structured state insufficient — using vision fallback');
    this.stats.visionObservations++;

    let visionAnalysis = null;

    const screenshotPath = await runtime.screenshot(`observe-${Date.now()}.png`);
    this.stats.screenshotsCaptured++;

    if (this._model) {
      try {
        const imageBuffer = fs.readFileSync(screenshotPath);
        const prompt = options.goal
          ? `You are helping an agent accomplish: "${options.goal}"\nDescribe the interactive elements visible and what actions are possible.`
          : 'Describe the interactive elements visible on this page and what actions are possible.';

        visionAnalysis = await this._model.analyzeScreenshot(imageBuffer, prompt);
      } catch (err) {
        console.warn('[Observer] Vision analysis failed:', err.message);
      }
    }

    const observation = {
      pageState,
      usedVision: true,
      visionAnalysis,
      screenshotPath,
      latencyMs: Date.now() - start,
      fromCache: false,
    };

    this._cachedPageState = observation;
    return observation;
  }

  /** Invalidate the observation cache (call after navigation or major page change). */
  invalidateCache() {
    this._lastObservationUrl = null;
    this._lastObservationTitle = null;
    this._cachedPageState = null;
  }

  getStats() { return { ...this.stats }; }
}

/**
 * @typedef {Object} Observation
 * @property {object} pageState
 * @property {boolean} usedVision
 * @property {string|null} visionAnalysis
 * @property {string} [screenshotPath]
 * @property {number} latencyMs
 * @property {boolean} fromCache
 */

module.exports = Observer;
