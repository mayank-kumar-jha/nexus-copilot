'use strict';

const AccessibilityExtractor = require('../accessibility/accessibility.extractor');
const DomExtractor = require('../dom/dom.extractor');

const accessibilityExtractor = new AccessibilityExtractor();
const domExtractor = new DomExtractor();

/**
 * PageStateExtractor
 *
 * Orchestrates the full perception pipeline:
 *   1. Accessibility snapshot (primary — semantic, reliable)
 *   2. DOM extraction (supplement — catches elements missing ARIA)
 *   3. Merge and deduplicate
 *
 * Returns a normalized PageState that represents what the agent can "see".
 * This is the primary input to the agent's decision-making.
 *
 * Vision/screenshot is NOT triggered here — that lives in the Observer (Phase 7).
 */
class PageStateExtractor {
  /**
   * @param {import('playwright').Page} page
   * @returns {Promise<PageState>}
   */
  async extract(page) {
    if (!page) throw new Error('PageStateExtractor: page is required');

    let url = 'about:blank';
    let title = '';
    try {
      url = page.url();
      title = await page.title();
    } catch {
      // Safely handle transient navigation states
    }

    const [a11yElements, domElements] = await Promise.all([
      accessibilityExtractor.extract(page).catch(() => []),
      domExtractor.extract(page).catch(() => []),
    ]);

    const elements = this._merge(a11yElements, domElements);

    return {
      url,
      title,
      timestamp: new Date().toISOString(),
      elements,
      elementCount: elements.length,
      interactiveElements: elements,
    };
  }

  /**
   * Merge accessibility and DOM elements.
   * Accessibility results take precedence; DOM fills gaps.
   * Simple deduplication by name+role.
   */
  _merge(a11yElements, domElements) {
    const seen = new Set();
    const result = [];

    for (const el of a11yElements) {
      const key = `${el.role}:${el.name.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(el);
      }
    }

    for (const el of domElements) {
      const key = `${el.role}:${el.name.toLowerCase()}`;
      if (!seen.has(key) && el.name) {
        seen.add(key);
        result.push(el);
      }
    }

    return result;
  }

  /**
   * Quick check — can the agent understand this page without a screenshot?
   * Returns false if the page has no meaningful elements (canvas-heavy, empty page, etc.)
   */
  canResolveFromStructuredState(pageState) {
    if (!pageState) return false;
    if (pageState.url === 'about:blank' || pageState.url === '') return true;
    if (!pageState.elements) return false;
    return pageState.elements.length >= 1 || Boolean(pageState.title);
  }
}

/**
 * @typedef {Object} PageState
 * @property {string} url
 * @property {string} title
 * @property {string} timestamp
 * @property {Array} elements
 * @property {number} elementCount
 */

module.exports = PageStateExtractor;
