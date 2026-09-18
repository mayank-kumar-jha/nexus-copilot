'use strict';

/**
 * PermissionPolicy
 *
 * Enforces domain allowlists/blocklists, dangerous action rules,
 * and custom per-task permissions.
 */
class PermissionPolicy {
  /**
   * @param {object} [options]
   * @param {string[]} [options.allowedDomains] - If specified, only these domains can be navigated to
   * @param {string[]} [options.blockedDomains] - Specific domains that can never be visited
   * @param {boolean} [options.allowSensitiveActions] - Whether sensitive actions are permitted
   * @param {string[]} [options.blockedTools] - Tool names that cannot be invoked
   */
  constructor(options = {}) {
    this.allowedDomains = options.allowedDomains || [];
    this.blockedDomains = options.blockedDomains || [
      'malware.com',
      'phishing.com',
    ];
    this.allowSensitiveActions = options.allowSensitiveActions ?? true;
    this.blockedTools = new Set(options.blockedTools || []);
  }

  /**
   * Check if navigating to a specific URL is permitted.
   * @param {string} url
   * @returns {{ allowed: boolean, reason?: string }}
   */
  checkNavigation(url) {
    if (!url) return { allowed: false, reason: 'URL is required' };

    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();

      // Check blocked domains
      for (const blocked of this.blockedDomains) {
        if (hostname === blocked || hostname.endsWith(`.${blocked}`)) {
          return {
            allowed: false,
            reason: `Domain ${hostname} is blocked by safety policy`,
          };
        }
      }

      // Check allowlist if configured
      if (this.allowedDomains.length > 0) {
        const isAllowed = this.allowedDomains.some(
          (d) => hostname === d || hostname.endsWith(`.${d}`)
        );
        if (!isAllowed) {
          return {
            allowed: false,
            reason: `Domain ${hostname} is not in the allowed domains list`,
          };
        }
      }

      return { allowed: true };
    } catch (err) {
      return { allowed: false, reason: `Invalid URL: ${err.message}` };
    }
  }

  /**
   * Check if a tool execution is permitted.
   * @param {string} toolName
   * @param {object} args
   * @returns {{ allowed: boolean, reason?: string }}
   */
  checkTool(toolName, args = {}) {
    if (this.blockedTools.has(toolName)) {
      return {
        allowed: false,
        reason: `Tool "${toolName}" is explicitly blocked by permission policy`,
      };
    }

    if (toolName === 'browser.navigate' && args.url) {
      return this.checkNavigation(args.url);
    }

    return { allowed: true };
  }
}

module.exports = PermissionPolicy;
