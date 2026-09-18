'use strict';

/**
 * DesktopRuntime (Phase 15 - Abstract Interface)
 *
 * Provides OS-level computer-use capabilities (mouse, keyboard, window management)
 * alongside the browser runtime. Designed to integrate with OS automation tools
 * (e.g. robotjs, nut.js, pyobjc, xdotool) when native desktop execution is activated.
 */
class DesktopRuntime {
  constructor(options = {}) {
    this.options = options;
    this.isReady = false;
  }

  async launch() {
    this.isReady = true;
    console.log('[DesktopRuntime] Desktop control runtime initialized (abstract layer).');
    return { status: 'ready' };
  }

  async mouseMove(x, y) {
    this._assertReady();
    console.log(`[DesktopRuntime] Mouse move to (${x}, ${y})`);
    return { x, y };
  }

  async mouseClick(button = 'left') {
    this._assertReady();
    console.log(`[DesktopRuntime] Mouse click [${button}]`);
    return { button };
  }

  async keyPress(key) {
    this._assertReady();
    console.log(`[DesktopRuntime] Key press [${key}]`);
    return { key };
  }

  async type(text) {
    this._assertReady();
    console.log(`[DesktopRuntime] Typing text (length: ${text.length})`);
    return { typed: text.length };
  }

  async screenshot(filePath) {
    this._assertReady();
    console.log(`[DesktopRuntime] Desktop screenshot requested -> ${filePath || 'default'}`);
    return { path: filePath || null };
  }

  async close() {
    this.isReady = false;
  }

  _assertReady() {
    if (!this.isReady) {
      throw new Error('DesktopRuntime is not initialized. Call launch() first.');
    }
  }
}

module.exports = DesktopRuntime;
