'use strict';

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const config = require('../config');

/**
 * BrowserRuntime
 *
 * The single authoritative abstraction over Playwright.
 * Nothing else in the codebase imports Playwright directly.
 *
 * Responsibilities:
 *  - Own the browser process lifecycle (launch / close)
 *  - Own the active page reference
 *  - Expose only the operations the agent is permitted to perform
 *  - Never expose arbitrary JavaScript execution to callers
 *
 * Design note:
 *  The AI model never calls this class directly.
 *  The tool executor calls it via the tool registry (Phase 3+).
 */
class BrowserRuntime {
  constructor() {
    /** @type {import('playwright').Browser | null} */
    this._browser = null;

    /** @type {import('playwright').BrowserContext | null} */
    this._context = null;

    /** @type {import('playwright').Page | null} */
    this._page = null;

    this._launched = false;
  }

  /**
   * Save storage state (cookies, local storage, logins) to disk safely.
   */
  async saveStorageState() {
    try {
      if (this._context) {
        const os = require('os');
        const baseLocalDir = process.env.LOCALAPPDATA || os.tmpdir();
        const appDir = path.join(baseLocalDir, 'NexusCopilot');
        if (!fs.existsSync(appDir)) fs.mkdirSync(appDir, { recursive: true });
        const stateFile = path.join(appDir, 'storage-state.json');
        await this._context.storageState({ path: stateFile }).catch(() => {});
      }
    } catch {}
  }

  /**
   * Launch Google Chrome or bundled Chromium instance.
   * Safe to call even if already launched (returns existing).
   */
  async launch() {
    if (this._launched && this._browser && this._browser.isConnected() && this._context && this._page && !this._page.isClosed()) {
      try {
        await this._page.bringToFront().catch(() => {});
        this._forceWindowVisible().catch(() => {});
        return;
      } catch {}
    }

    // Clean up any stale handles first
    if (this._context || this._browser) {
      try { await this.close(); } catch {}
    }

    const os = require('os');
    const baseLocalDir = process.env.LOCALAPPDATA || os.tmpdir();
    const appDir = path.join(baseLocalDir, 'NexusCopilot');
    if (!fs.existsSync(appDir)) fs.mkdirSync(appDir, { recursive: true });
    const stateFile = path.join(appDir, 'storage-state.json');

    // ── Common launch args ────────────────────────────────────────────────────
    const extraArgs = [
      '--nexus-agent-browser',
      '--start-maximized',
      '--window-size=1280,800',
      '--window-position=60,60',
      '--no-first-run',
      '--no-default-browser-check',
      '--no-restore-session-state',
      '--disable-restore-session-state',
      '--disable-popup-blocking',
      '--disable-notifications',
      '--disable-backgrounding-occluded-windows',
      '--disable-breakpad',
      '--disable-component-update',
      '--disable-session-crashed-bubble',
      '--disable-infobars',
      '--disable-blink-features=AutomationControlled',
    ];

    const baseOpts = {
      headless: false,
      args: extraArgs,
      slowMo: config.browser.slowMo || 0,
    };

    const tried = [];

    // ── Strategy 1: Real Google Chrome via channel:'chrome' (PRIMARY) ─────────
    try {
      this._browser = await chromium.launch({
        ...baseOpts,
        channel: 'chrome',
      });
      console.log('[BrowserRuntime] ✓ Launched Google Chrome (primary).');
    } catch (e) {
      tried.push(`Chrome channel: ${e.message.split('\n')[0]}`);
    }

    // ── Strategy 2: Real Google Chrome via explicit executablePath ───────────
    if (!this._browser) {
      const chromeExe = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA
          ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
          : null,
      ].filter(Boolean).find(p => fs.existsSync(p)) || null;

      if (chromeExe) {
        try {
          this._browser = await chromium.launch({
            ...baseOpts,
            executablePath: chromeExe,
          });
          console.log(`[BrowserRuntime] ✓ Launched Google Chrome via executablePath: ${chromeExe}`);
        } catch (e) {
          tried.push(`Chrome executablePath: ${e.message.split('\n')[0]}`);
        }
      }
    }

    // ── Strategy 3: Bundled Playwright Chromium ──────────────────────────────
    if (!this._browser) {
      try {
        this._browser = await chromium.launch({ ...baseOpts });
        console.log('[BrowserRuntime] ✓ Launched Playwright Chromium fallback.');
      } catch (e) {
        tried.push(`Bundled Chromium: ${e.message.split('\n')[0]}`);
        throw new Error(
          `[BrowserRuntime] All browser launch strategies failed.\n${tried.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}`
        );
      }
    }

    // Create context with preserved storage state if exists
    const hasState = fs.existsSync(stateFile);
    this._context = await this._browser.newContext({
      viewport: null,
      storageState: hasState ? stateFile : undefined,
    });

    this._context.on('close', () => {
      this._launched = false;
      this._context = null;
      this._page = null;
    });

    // Auto-track new tabs and popups
    this._context.on('page', async (newPage) => {
      console.log('[BrowserRuntime] New tab/window opened. Switching focus.');
      this._page = newPage;
      this._page.setDefaultNavigationTimeout(config.browser.navigationTimeout || 30000);
      this._page.setDefaultTimeout(config.browser.navigationTimeout || 30000);
      try { await newPage.bringToFront(); await newPage.waitForLoadState('domcontentloaded'); } catch {}
      this._forceWindowVisible().catch(() => {});
    });

    const pages = this._context.pages().filter(p => !p.isClosed());
    if (pages.length > 1) {
      for (let i = 0; i < pages.length - 1; i++) {
        try { await pages[i].close(); } catch {}
      }
    }
    const finalPages = this._context.pages().filter(p => !p.isClosed());
    this._page = finalPages.length > 0 ? finalPages[finalPages.length - 1] : await this._context.newPage();
    this._page.setDefaultNavigationTimeout(config.browser.navigationTimeout || 30000);
    this._page.setDefaultTimeout(config.browser.navigationTimeout || 30000);

    try { await this._page.bringToFront(); } catch {}

    // Force window to front
    await this._forceWindowVisible();

    this._launched = true;
  }

  /**
   * Return the latest unclosed active page in the browser context.
   * Automatically switches this._page to the newest foreground window if a popup/tab exists.
   */
  getActivePage() {
    if (!this._context) return null;
    try {
      const pages = this._context.pages().filter((p) => !p.isClosed());
      if (pages.length === 0) return null;

      // Always focus the newest active page (e.g. job details/apply window)
      const latest = pages[pages.length - 1];
      if (this._page !== latest || !this._page || this._page.isClosed()) {
        this._page = latest;
        this._page.setDefaultNavigationTimeout(config.browser.navigationTimeout || 30000);
        this._page.setDefaultTimeout(config.browser.navigationTimeout || 30000);
      }
      return this._page;
    } catch {
      return this._page;
    }
  }

  /**
   * Force the Playwright browser window to be visible on screen.
   * Uses Win32 API to show, restore, un-minimize, and foreground the Chrome_WidgetWin_1 window.
   */
  async _forceWindowVisible() {
    const { execFile } = require('child_process');
    const scriptPath = path.resolve(__dirname, '../../../scripts/focus-browser.ps1');
    if (!fs.existsSync(scriptPath)) return;

    try {
      execFile('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
      ], { timeout: 4000 }, () => {});
    } catch {}
  }

  /**
   * Ensure the browser and active page are running and ready.
   * If closed or crashed, automatically re-launches without throwing.
   */
  async ensureReady() {
    if (this._context && this._browser && this._browser.isConnected()) {
      const pages = this._context.pages().filter(p => !p.isClosed());
      if (pages.length > 1) {
        const active = pages[pages.length - 1];
        for (let i = 0; i < pages.length - 1; i++) {
          try { await pages[i].close(); } catch {}
        }
        this._page = active;
      } else if (pages.length === 1) {
        this._page = pages[0];
      } else {
        this._page = await this._context.newPage();
      }

      if (this._page && !this._page.isClosed()) {
        try {
          await this._page.bringToFront().catch(() => {});
          return this._page;
        } catch {}
      }
    }

    // If context died or has no active pages, cleanly re-launch a fresh visible window
    try {
      if (this._context) await this._context.close().catch(() => {});
      if (this._browser) await this._browser.close().catch(() => {});
    } catch {}
    this._context = null;
    this._browser = null;
    this._page = null;
    this._launched = false;

    await this.launch();
    return this.getActivePage() || this._page;
  }

  /**
   * Close the browser and release all resources.
   * Safe to call even if the browser was never launched.
   */
  async close() {
    try {
      await this.saveStorageState().catch(() => {});
      if (this._context) await this._context.close().catch(() => {});
      if (this._browser) await this._browser.close().catch(() => {});
    } finally {
      this._context = null;
      this._browser = null;
      this._page = null;
      this._launched = false;
      console.log('[BrowserRuntime] Closed.');
    }
  }

  /**
   * Stop/abort any current page activity immediately.
   */
  async stop() {
    try {
      if (this._page && !this._page.isClosed()) {
        await this._page.evaluate(() => window.stop()).catch(() => {});
      }
    } catch {}
  }

  // ─── Navigation ───────────────────────────────────────────────────────────

  /**
   * Navigate to a URL.
   * Waits until the DOM content is loaded or page is committed.
   *
   * @param {string} url - Must be an absolute URL.
   * @returns {Promise<{ url: string, title: string }>}
   */
  async navigate(url) {
    await this.ensureReady();
    const page = this.getActivePage() || this._page;

    if (!url || !url.startsWith('http')) {
      throw new Error(`BrowserRuntime.navigate: invalid URL "${url}"`);
    }

    console.log('[BrowserRuntime] Navigating to %s', url);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    } catch (err) {
      console.warn('[BrowserRuntime] Navigation notice (falling back to commit):', err.message);
      try {
        if (!page.isClosed()) {
          await page.goto(url, { waitUntil: 'commit', timeout: 15000 });
        }
      } catch {}
    }

    try { await page.bringToFront().catch(() => {}); } catch {}
    this.saveStorageState().catch(() => {});

    const result = {
      url: page.url(),
      title: await page.title().catch(() => ''),
    };

    console.log('[BrowserRuntime] Navigation complete. title="%s"', result.title);
    return result;
  }

  /**
   * Go back in the browser history.
   * @returns {Promise<{ url: string, title: string }>}
   */
  async goBack() {
    await this.ensureReady();
    const page = this.getActivePage() || this._page;
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    return {
      url: page.url(),
      title: await page.title().catch(() => ''),
    };
  }

  // ─── Page State ───────────────────────────────────────────────────────────

  /**
   * Return the current URL and title.
   * This is a lightweight check — no DOM traversal.
   * Use the perception layer (Phase 2+) for full element extraction.
   *
   * @returns {Promise<{ url: string, title: string, timestamp: string }>}
   */
  async getPageState() {
    await this.ensureReady();
    return {
      url: this._page.url(),
      title: await this._page.title(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Click an element identified by a CSS selector, text, or accessible label.
   * Handles multi-tab popups, iframes/embedded widgets, and complex event listeners (Indeed, LinkedIn, Amazon).
   *
   * @param {string} selector
   */
  async click(selector) {
    await this.ensureReady();
    if (!selector || typeof selector !== 'string') {
      throw new Error('BrowserRuntime.click: selector must be a non-empty string');
    }
    console.log('[BrowserRuntime] Click: %s', selector);

    const initialUrl = this._page.url();
    const initialPagesCount = this._context.pages().length;

    // Watch for new popup tab if triggered by click
    const popupPromise = new Promise((resolve) => {
      const handler = (newPage) => resolve(newPage);
      this._context.once('page', handler);
      setTimeout(() => resolve(null), 3000);
    });

    let success = false;
    let targetHref = null;

    // Strategy 1: Standard Playwright click with force & coordinate fallback
    try {
      const loc = this._page.locator(selector).first();
      if ((await loc.count()) > 0) {
        await loc.scrollIntoViewIfNeeded({ timeout: 2500 }).catch(() => {});
        
        // Extract href from element, child anchor, or parent anchor
        targetHref = await loc.evaluate((el) => {
          const a = (el.tagName === 'A' && el.getAttribute('href')) 
            ? el 
            : (el.closest('a[href]') || el.querySelector('a[href]'));
          return a ? a.getAttribute('href') : null;
        }).catch(() => null);

        try {
          await loc.click({ timeout: 3000 });
          success = true;
        } catch {
          await loc.click({ force: true, timeout: 2000 }).catch(() => {});
          const box = await loc.boundingBox().catch(() => null);
          if (box) {
            await this._page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            success = true;
          }
        }
      }
    } catch (err1) {
      console.log('[BrowserRuntime] Strategy 1 failed, trying next:', err1.message);
    }

    // Strategy 2: Search across all iframes (Indeed job details pane & embedded application widgets)
    if (!success) {
      try {
        const frames = this._page.frames();
        for (const frame of frames) {
          try {
            const loc = frame.locator(selector).first();
            if ((await loc.count()) > 0) {
              await loc.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
              await loc.click({ force: true, timeout: 3000 });
              console.log('[BrowserRuntime] Successfully clicked element inside iframe: %s', frame.url());
              success = true;
              break;
            }
          } catch {}
        }
      } catch (errFrames) {
        console.log('[BrowserRuntime] Frame search error:', errFrames.message);
      }
    }

    // Strategy 3: Text or aria match
    if (!success) {
      try {
        const cleanText = selector.replace(/^[#[\]'".:=]+/, '').trim();
        if (cleanText) {
          const textLoc = this._page.getByText(cleanText, { exact: false }).first();
          if ((await textLoc.count()) > 0) {
            targetHref = await textLoc.evaluate((el) => {
              const a = el.closest('a[href]') || el.querySelector('a[href]') || (el.tagName === 'A' ? el : null);
              return a ? a.getAttribute('href') : null;
            }).catch(() => null);
            await textLoc.click({ timeout: 3000, force: true });
            success = true;
          }
        }
      } catch (err3) {
        // Continue to next strategy
      }
    }

    // Strategy 4: Deep DOM evaluate click dispatch + direct link extraction
    if (!success || targetHref) {
      try {
        const evalResult = await this._page.evaluate((sel) => {
          let target = document.querySelector(sel);
          if (!target) {
            const candidates = Array.from(
              document.querySelectorAll('a, button, [role="button"], [role="link"], ytd-video-renderer, ytd-thumbnail, #video-title, .job_seen_beacon, .jcs-JobTitle, [data-jk], [id*="job"], [id*="apply"], [class*="apply"]')
            );
            target = candidates.find((e) =>
              (e.innerText || e.getAttribute('title') || e.getAttribute('aria-label') || '').toLowerCase().includes(sel.toLowerCase())
            );
          }
          if (target) {
            target.scrollIntoView({ block: 'center' });
            const anchor = target.closest('a[href]') || target.querySelector('a[href]') || (target.tagName === 'A' ? target : null);
            ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(evt => {
              target.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }));
              if (anchor && anchor !== target) {
                anchor.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }));
              }
            });
            if (typeof target.click === 'function') target.click();
            if (anchor && typeof anchor.click === 'function') anchor.click();
            const href = anchor ? anchor.getAttribute('href') : (target.getAttribute('href') || target.closest('a')?.getAttribute('href'));
            return { clicked: true, href: href && !href.startsWith('javascript:') ? href : null };
          }
          return null;
        }, selector);

        if (evalResult?.clicked) {
          success = true;
          if (evalResult.href) targetHref = evalResult.href;
        }
      } catch (err4) {
        console.log('[BrowserRuntime] Evaluate click failed:', err4.message);
      }
    }

    // Check if a popup/tab was opened by the click
    const popupPage = await popupPromise;
    if (popupPage && !popupPage.isClosed()) {
      console.log('[BrowserRuntime] Click opened new tab! Switched focus.');
      this._page = popupPage;
      this._page.setDefaultNavigationTimeout(config.browser.navigationTimeout || 30000);
      this._page.setDefaultTimeout(config.browser.navigationTimeout || 30000);
      await this._page.bringToFront().catch(() => {});
      await this._page.waitForLoadState('domcontentloaded').catch(() => {});
      return;
    }

    // Check if context has any new page that wasn't caught by popupPromise
    const currentPages = this._context.pages().filter(p => !p.isClosed());
    if (currentPages.length > initialPagesCount) {
      const latestPage = currentPages[currentPages.length - 1];
      console.log('[BrowserRuntime] Detected new page in context, switching focus.');
      this._page = latestPage;
      await this._page.bringToFront().catch(() => {});
      await this._page.waitForLoadState('domcontentloaded').catch(() => {});
      return;
    }

    // Fallback: If URL hasn't changed and we have a target link (e.g. YouTube video /watch link or job apply link)
    if (targetHref) {
      await new Promise((r) => setTimeout(r, 600));
      if (this._page.url() === initialUrl) {
        try {
          const dest = new URL(targetHref, this._page.url()).href;
          console.log('[BrowserRuntime] URL unchanged after click. Navigating directly to destination href: %s', dest);
          await this._page.goto(dest, { waitUntil: 'domcontentloaded' }).catch(() => {});
        } catch (navErr) {
          console.log('[BrowserRuntime] Direct destination navigation error:', navErr.message);
        }
      }
    }

    // Brief settling pause to allow SPA / DOM to update
    await new Promise((r) => setTimeout(r, 1000));
  }

  /**
   * Type text into an element identified by a CSS selector.
   * Handles regular inputs, textareas, and contenteditable editors (e.g. ChatGPT, Claude, Docs).
   *
   * @param {string} selector
   * @param {string} text
   */
  async type(selector, text) {
    await this.ensureReady();
    if (!selector || typeof selector !== 'string') {
      throw new Error('BrowserRuntime.type: selector must be a non-empty string');
    }
    if (typeof text !== 'string') {
      throw new Error('BrowserRuntime.type: text must be a string');
    }
    console.log('[BrowserRuntime] Type into "%s"', selector);
    try {
      await this._page.fill(selector, text);
    } catch (err) {
      console.log('[BrowserRuntime] fill() fallback to click + keyboard typing:', err.message);
      try {
        await this._page.click(selector);
        await this._page.keyboard.type(text, { delay: 10 });
      } catch {
        // Last resort: evaluate set value or dispatch input event
        await this._page.evaluate(({ sel, txt }) => {
          const el = document.querySelector(sel);
          if (el) {
            el.focus();
            if ('value' in el) el.value = txt;
            else el.innerText = txt;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, { sel: selector, txt: text });
      }
    }
  }

  /**
   * Wait for a specified number of milliseconds.
   * Useful for dynamic AI streaming (ChatGPT), loading spinners, and search results.
   * @param {number} [ms=3000]
   */
  async wait(ms = 3000) {
    await this.ensureReady();
    const duration = Math.min(Math.max(ms, 500), 15000);
    console.log('[BrowserRuntime] Waiting %dms', duration);
    await this._page.waitForTimeout(duration);
  }

  /**
   * Extract text content from an element or the entire page.
   * @param {string} [selector]
   * @returns {Promise<string>}
   */
  async getText(selector) {
    await this.ensureReady();
    if (!selector || selector === 'body') {
      return await this._page.innerText('body');
    }
    try {
      return await this._page.innerText(selector);
    } catch {
      return (await this._page.textContent(selector)) || '';
    }
  }

  /**
   * Scroll the page by a given pixel amount.
   * Positive deltaY scrolls down; negative scrolls up.
   *
   * @param {number} deltaX
   * @param {number} deltaY
   */
  async scroll(deltaX, deltaY) {
    await this.ensureReady();
    await this._page.mouse.wheel(deltaX || 0, deltaY || 0);
  }

  /**
   * Press a keyboard key.
   * @param {string} key - Playwright key name e.g. 'Enter', 'Tab', 'Escape'
   */
  async pressKey(key) {
    await this.ensureReady();
    if (!key || typeof key !== 'string') {
      throw new Error('BrowserRuntime.pressKey: key must be a non-empty string');
    }
    console.log('[BrowserRuntime] Press key: %s', key);
    await this._page.keyboard.press(key);
  }

  /**
   * Wait for the page to finish loading.
   * @param {'domcontentloaded'|'load'|'networkidle'} [event='domcontentloaded']
   */
  async waitForLoad(event = 'domcontentloaded') {
    await this.ensureReady();
    await this._page.waitForLoadState(event);
  }

  // ─── Debug ────────────────────────────────────────────────────────────────

  /**
   * Capture a screenshot for debugging.
   *
   * IMPORTANT: Screenshots are NEVER taken automatically.
   * They are only captured when explicitly requested (debug / vision fallback).
   * Phase 7 will add the vision-fallback decision logic.
   *
   * @param {string} [filename] - Optional filename (without path). Defaults to timestamp.
   * @returns {Promise<string>} Absolute path to the saved file.
   */
  async screenshot(filename) {
    await this.ensureReady();

    const screenshotsDir = path.resolve(
      __dirname,
      '../../',
      config.browser.screenshotsDir,
    );

    // Ensure the directory exists
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    const name = filename || `screenshot-${Date.now()}.png`;
    const outputPath = path.join(screenshotsDir, name);

    await this._page.screenshot({ path: outputPath, fullPage: false });

    console.log('[BrowserRuntime] Screenshot saved: %s', outputPath);
    return outputPath;
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  /**
   * Expose the raw Playwright page to trusted internal modules only.
   * The AI model must NEVER receive this reference.
   *
   * @returns {import('playwright').Page}
   */
  getPage() {
    return this.getActivePage() || this._page;
  }

  /**
   * @returns {boolean}
   */
  get isReady() {
    return Boolean(this._context && this._page && !this._page.isClosed());
  }

  async _assertReady() {
    await this.ensureReady();
  }
}

module.exports = BrowserRuntime;
