'use strict';

/**
 * DomExtractor
 *
 * Extracts interactive elements directly from the DOM using Playwright's
 * evaluate() API. Used as a supplement to accessibility extraction when
 * elements lack proper ARIA attributes.
 *
 * Runs a localized script inside the page context — no arbitrary code
 * is passed in from outside; the script is hardcoded here.
 */
class DomExtractor {
  /**
   * @param {import('playwright').Page} page
   * @returns {Promise<DomElement[]>}
   */
  async extract(page) {
    try {
      const elements = await page.evaluate(() => {
        const results = [];
        let idCounter = 0;

        const isVisible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0'
          );
        };

        const getLabel = (el) => {
          if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim();
          if (el.id) {
            try {
              const safeId = window.CSS && CSS.escape ? CSS.escape(el.id) : el.id.replace(/["\\]/g, '\\$&');
              const label = document.querySelector(`label[for="${safeId}"]`);
              if (label) return label.textContent.trim();
            } catch {}
          }
          if (el.placeholder) return el.placeholder.trim();
          const text = el.textContent?.trim();
          if (text && text.length < 200) return text;
          return '';
        };

        const buildSelector = (el) => {
          const tag = el.tagName.toLowerCase();
          
          // Check for enclosing or child anchor link (e.g. YouTube video-title, search cards)
          const anchor = (tag === 'a' && el.getAttribute('href')) 
            ? el 
            : (el.closest('a[href]') || el.querySelector('a[href]'));

          if (anchor) {
            if (anchor.id && !/[\s"':<>()\\[\\]#=,.]/.test(anchor.id) && !anchor.id.startsWith('__')) {
              return `#${anchor.id}`;
            }
            const href = anchor.getAttribute('href');
            if (href && href.length < 120 && !href.startsWith('javascript:')) {
              return `a[href="${href.replace(/"/g, '\\"')}"]`;
            }
          }

          if (el.getAttribute('aria-label')) {
            const cleanAria = el.getAttribute('aria-label').replace(/"/g, '\\"').trim();
            if (cleanAria.length < 80) return `[aria-label="${cleanAria}"]`;
          }

          if (el.getAttribute('title')) {
            const cleanTitle = el.getAttribute('title').replace(/"/g, '\\"').trim();
            if (cleanTitle.length < 100) return `[title="${cleanTitle}"]`;
          }

          if (el.id && !/[\s"':<>()\\[\\]#=,.]/.test(el.id) && !el.id.startsWith('__')) {
            return `#${el.id}`;
          }

          if (el.name) return `${tag}[name="${el.name}"]`;

          const text = el.textContent?.trim() || '';
          if (tag.startsWith('h') && text.length > 0) {
            const cleanText = text.replace(/["'\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
            if (cleanText.length > 0) {
              return `${tag}:has-text("${cleanText.slice(0, 35)}")`;
            }
          }

          if (el.className && typeof el.className === 'string') {
            const validClasses = el.className
              .split(/\s+/)
              .filter((c) => c && !c.includes(':') && !c.includes('/') && !c.includes('.'))
              .slice(0, 2);
            if (validClasses.length > 0) return `${tag}.${validClasses.join('.')}`;
          }

          return tag;
        };

        const selectors = [
          'h1, h2, h3, h4, h5, h6, [role="heading"]',
          'input:not([type="hidden"])',
          'textarea',
          'select',
          'button',
          'a[href]',
          '[role="button"]',
          '[role="link"]',
          '[role="textbox"]',
          '[role="searchbox"]',
          '[role="checkbox"]',
          '[role="combobox"]',
          '[role="option"]',
          '[role="tab"]',
          '[contenteditable="true"]',
          'p',
          '[role="alert"]',
          '[role="status"]',
        ];

        const seen = new Set();
        for (const selector of selectors) {
          const nodes = document.querySelectorAll(selector);
          for (const el of nodes) {
            if (seen.has(el) || !isVisible(el)) continue;
            seen.add(el);

            const tag = el.tagName.toLowerCase();
            const type = el.type || tag;
            let role = el.getAttribute('role') || tag;
            if (tag.startsWith('h')) role = 'heading';

            const name = getLabel(el);
            if (!name && !['input', 'textarea', 'select'].includes(tag)) continue;

            results.push({
              id: `d${++idCounter}`,
              tag,
              type,
              role,
              name,
              value: el.value || el.textContent?.trim().substring(0, 200) || '',
              visible: true,
              disabled: el.disabled || false,
              placeholder: el.placeholder || '',
              href: el.href || '',
              selector: buildSelector(el),
              source: 'dom',
            });
          }
        }

        return results;
      });

      return elements;
    } catch (err) {
      console.warn('[DomExtractor] Failed:', err.message);
      return [];
    }
  }
}

/**
 * @typedef {Object} DomElement
 * @property {string} id
 * @property {string} tag
 * @property {string} type
 * @property {string} role
 * @property {string} name
 * @property {string} value
 * @property {boolean} visible
 * @property {boolean} disabled
 * @property {string} placeholder
 * @property {string} href
 * @property {'dom'} source
 */

module.exports = DomExtractor;
