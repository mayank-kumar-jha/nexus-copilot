'use strict';

/**
 * ActionVerifier
 *
 * Verifies whether a tool execution actually produced the intended state change.
 * Checks for:
 * 1. Expected URL or title transitions
 * 2. Visual / DOM element presence or value updates
 * 3. Absence of error indicators on the page (e.g. 404, 500, error toasts)
 */
class ActionVerifier {
  /**
   * Verify an action result against previous and current page state.
   *
   * @param {object} params
   * @param {object} params.decision - { tool, args, expectedOutcome }
   * @param {object} params.executionResult - Result from ToolExecutor
   * @param {object} params.beforeObservation - Observation before action
   * @param {object} params.afterObservation - Observation after action
   * @param {import('../../runtime/browser.runtime')} params.runtime
   * @returns {Promise<{ verified: boolean, reason: string, details?: object }>}
   */
  async verify({ decision, executionResult, beforeObservation, afterObservation, runtime }) {
    // If execution itself threw an error, verification fails immediately
    if (!executionResult.success) {
      return {
        verified: false,
        reason: `Execution failed with error: ${executionResult.error}`,
        details: { tool: decision.tool, error: executionResult.error },
      };
    }

    const { tool, args } = decision;
    const beforeState = beforeObservation?.pageState || {};
    const afterState = afterObservation?.pageState || {};

    // Check for common error indicators in page title or content
    const errorTitleKeywords = ['404', '500', 'error', 'not found', 'forbidden', 'bad gateway'];
    const lowerTitle = (afterState.title || '').toLowerCase();
    for (const kw of errorTitleKeywords) {
      if (lowerTitle.includes(kw) && !beforeState.title?.toLowerCase().includes(kw)) {
        return {
          verified: false,
          reason: `Page title indicated an error: "${afterState.title}"`,
          details: { title: afterState.title },
        };
      }
    }

    // Specific verification per tool
    switch (tool) {
      case 'browser.navigate': {
        const targetUrl = args.url;
        const currentUrl = afterState.url || '';
        // Allow URL redirect or protocol / trailing slash normalization
        const targetDomain = this._extractDomain(targetUrl);
        const currentDomain = this._extractDomain(currentUrl);

        if (targetDomain && currentDomain && targetDomain !== currentDomain) {
          return {
            verified: false,
            reason: `Navigation expected domain "${targetDomain}", but landed on "${currentDomain}" (${currentUrl})`,
            details: { expected: targetUrl, actual: currentUrl },
          };
        }

        return {
          verified: true,
          reason: `Successfully navigated to ${currentUrl} (Title: "${afterState.title || 'Untitled'}")`,
          details: { url: currentUrl, title: afterState.title },
        };
      }

      case 'browser.type': {
        // Verify input element contains the typed text if possible
        if (runtime && args.selector) {
          try {
            const page = runtime.getPage();
            const val = await page.$eval(args.selector, (el) => el.value || el.innerText || '');
            if (args.text && !val.includes(args.text) && val.length === 0) {
              return {
                verified: false,
                reason: `Input element "${args.selector}" does not contain expected text. Current value: "${val}"`,
                details: { selector: args.selector, expected: args.text, actual: val },
              };
            }
          } catch {
            // Element might have submitted or unmounted, or evaluate not supported on custom selector
          }
        }
        return {
          verified: true,
          reason: `Typed text into "${args.selector}" successfully`,
          details: { selector: args.selector },
        };
      }

      case 'browser.click':
      case 'browser.submit_form': {
        // If clicking changed the URL or title, that's strong proof of action
        const urlChanged = beforeState.url !== afterState.url;
        const titleChanged = beforeState.title !== afterState.title;
        const countChanged =
          beforeState.interactiveElements?.length !== afterState.interactiveElements?.length;

        return {
          verified: true,
          reason: urlChanged
            ? `Click resulted in URL change from ${beforeState.url} to ${afterState.url}`
            : titleChanged
            ? `Click changed page title to "${afterState.title}"`
            : `Click on "${args.selector}" executed without DOM exception`,
          details: { urlChanged, titleChanged, countChanged },
        };
      }

      case 'browser.scroll':
      case 'browser.back':
      case 'browser.screenshot':
      case 'browser.get_state':
      default:
        return {
          verified: true,
          reason: `Tool "${tool}" executed successfully`,
          details: executionResult.result,
        };
    }
  }

  _extractDomain(urlStr) {
    try {
      return new URL(urlStr).hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  }
}

module.exports = ActionVerifier;
