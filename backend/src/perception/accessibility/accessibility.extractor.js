'use strict';

/**
 * AccessibilityExtractor
 *
 * Uses Playwright's built-in accessibility snapshot API to extract
 * a structured representation of all accessible elements on the page.
 *
 * Why accessibility first?
 *   Accessibility trees are designed for machine consumption.
 *   They expose semantic roles, labels, and values without needing CSS selectors.
 *   This is far more reliable than DOM scraping for understanding page intent.
 */
class AccessibilityExtractor {
  /**
   * Extract interactive elements from the page's accessibility tree.
   *
   * @param {import('playwright').Page} page
   * @returns {Promise<AccessibilityNode[]>}
   */
  async extract(page) {
    try {
      if (!page || !page.accessibility || typeof page.accessibility.snapshot !== 'function') {
        return [];
      }
      const snapshot = await page.accessibility.snapshot({ interestingOnly: true });
      if (!snapshot) return [];

      const elements = [];
      let idCounter = 0;

      const walk = (node, depth = 0) => {
        if (!node) return;

        const role = node.role || 'unknown';
        const name = node.name || '';
        const value = node.value ?? '';
        const checked = node.checked;
        const disabled = node.disabled || false;
        const focused = node.focused || false;
        const expanded = node.expanded;
        const level = node.level;

        // Only include nodes that are meaningfully interactive or informative
        const isInteresting = this._isInteresting(role, name);

        if (isInteresting && depth <= 10) {
          elements.push({
            id: `a${++idCounter}`,
            role,
            name: name.trim(),
            value: String(value).trim(),
            checked,
            disabled,
            focused,
            expanded,
            level,
            source: 'accessibility',
          });
        }

        if (node.children) {
          for (const child of node.children) {
            walk(child, depth + 1);
          }
        }
      };

      walk(snapshot);
      return elements;
    } catch (err) {
      console.warn('[AccessibilityExtractor] Failed to extract snapshot:', err.message);
      return [];
    }
  }

  _isInteresting(role, name) {
    const interactiveRoles = new Set([
      'button', 'link', 'textbox', 'searchbox', 'combobox',
      'listbox', 'option', 'checkbox', 'radio', 'switch',
      'menuitem', 'menuitemcheckbox', 'menuitemradio',
      'tab', 'treeitem', 'spinbutton', 'slider',
    ]);
    const informativeRoles = new Set([
      'heading', 'alert', 'status', 'dialog', 'img',
    ]);

    if (interactiveRoles.has(role)) return true;
    if (informativeRoles.has(role) && name) return true;
    return false;
  }
}

/**
 * @typedef {Object} AccessibilityNode
 * @property {string} id
 * @property {string} role
 * @property {string} name
 * @property {string} value
 * @property {boolean|undefined} checked
 * @property {boolean} disabled
 * @property {boolean} focused
 * @property {boolean|undefined} expanded
 * @property {number|undefined} level
 * @property {'accessibility'} source
 */

module.exports = AccessibilityExtractor;
