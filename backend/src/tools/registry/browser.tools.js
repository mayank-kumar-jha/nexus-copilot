'use strict';

const ToolRegistry = require('./tool.registry');

// ─── Individual tool definitions ──────────────────────────────────────────────

const navigateTool = {
  name: 'browser.navigate',
  description: 'Navigate the browser to an absolute URL. Use for going to new pages.',
  schema: {
    url: { type: 'string', required: true, description: 'Absolute URL to navigate to (must start with http)' },
  },
  riskLevel: 'SAFE',
  execute: async (args, { runtime }) => {
    return runtime.navigate(args.url);
  },
};

const getStateTool = {
  name: 'browser.get_state',
  description: 'Get the current page URL and title without interacting.',
  schema: {},
  riskLevel: 'SAFE',
  execute: async (_args, { runtime }) => {
    return runtime.getPageState();
  },
};

const clickTool = {
  name: 'browser.click',
  description: 'Click an element identified by a CSS selector or accessible name.',
  schema: {
    selector: { type: 'string', required: true, description: 'CSS selector or text to click' },
  },
  riskLevel: 'SAFE',
  execute: async (args, { runtime }) => {
    await runtime.click(args.selector);
    return { clicked: args.selector };
  },
};

const typeTool = {
  name: 'browser.type',
  description: 'Type text into an input field identified by a CSS selector.',
  schema: {
    selector: { type: 'string', required: true, description: 'CSS selector of the input element' },
    text: { type: 'string', required: true, description: 'Text to type into the field' },
    pressEnter: { type: 'boolean', required: false, description: 'If true, press Enter after typing' },
  },
  riskLevel: 'SAFE',
  execute: async (args, { runtime }) => {
    await runtime.type(args.selector, args.text);
    if (args.pressEnter) {
      await runtime.pressKey('Enter');
    }
    return { typed: args.text, selector: args.selector };
  },
};

const scrollTool = {
  name: 'browser.scroll',
  description: 'Scroll the page. Use positive deltaY to scroll down, negative to scroll up.',
  schema: {
    deltaY: { type: 'number', required: true, description: 'Pixels to scroll vertically (positive=down)' },
    deltaX: { type: 'number', required: false, description: 'Pixels to scroll horizontally' },
  },
  riskLevel: 'SAFE',
  execute: async (args, { runtime }) => {
    await runtime.scroll(args.deltaX || 0, args.deltaY);
    return { scrolled: { deltaX: args.deltaX || 0, deltaY: args.deltaY } };
  },
};

const backTool = {
  name: 'browser.back',
  description: 'Go back to the previous page in browser history.',
  schema: {},
  riskLevel: 'SAFE',
  execute: async (_args, { runtime }) => {
    return runtime.goBack();
  },
};

const screenshotTool = {
  name: 'browser.screenshot',
  description: 'Capture a screenshot of the current page for debugging or visual analysis.',
  schema: {
    filename: { type: 'string', required: false, description: 'Optional filename for the screenshot' },
  },
  riskLevel: 'SAFE',
  execute: async (args, { runtime }) => {
    const path = await runtime.screenshot(args.filename);
    return { path };
  },
};

const submitFormTool = {
  name: 'browser.submit_form',
  description: 'Submit a form or prompt button.',
  schema: {
    selector: { type: 'string', required: true, description: 'CSS selector of the form or submit button' },
  },
  riskLevel: 'SAFE',
  execute: async (args, { runtime }) => {
    await runtime.click(args.selector);
    return { submitted: args.selector };
  },
};

const waitTool = {
  name: 'browser.wait',
  description: 'Wait for dynamic content to load (e.g. AI generating answer, search results rendering, modal appearing).',
  schema: {
    ms: { type: 'number', required: false, description: 'Milliseconds to wait (default 3000, max 15000)' },
  },
  riskLevel: 'SAFE',
  execute: async (args, { runtime }) => {
    await runtime.wait(args.ms || 3000);
    return { waitedMs: args.ms || 3000 };
  },
};

const pressKeyTool = {
  name: 'browser.press_key',
  description: 'Press a keyboard key such as Enter, Escape, Tab, or ArrowDown.',
  schema: {
    key: { type: 'string', required: true, description: 'Key to press e.g. "Enter", "Escape", "Tab"' },
  },
  riskLevel: 'SAFE',
  execute: async (args, { runtime }) => {
    await runtime.pressKey(args.key);
    return { pressedKey: args.key };
  },
};

const extractTextTool = {
  name: 'browser.extract_text',
  description: 'Extract text content from a specific element or the entire page.',
  schema: {
    selector: { type: 'string', required: false, description: 'CSS selector of the element to read text from (omit for full page)' },
  },
  riskLevel: 'SAFE',
  execute: async (args, { runtime }) => {
    const text = await runtime.getText(args.selector);
    return { text: text.substring(0, 4000) };
  },
};

const askUserTool = {
  name: 'ask_user',
  description: 'Ask the user a question, request missing credentials, or ask for access permission (e.g. asking for login details or asking for access permission on ChatGPT), and pause execution until the user answers.',
  schema: {
    question: { type: 'string', required: true, description: 'The clear, conversational question to ask the user' },
    context: { type: 'string', required: false, description: 'Context or reason why this information or access is needed' },
  },
  riskLevel: 'SAFE',
  execute: async (args) => {
    return { question: args.question, context: args.context, waitingForUser: true };
  },
};

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create and populate a tool registry with all built-in browser tools.
 * @returns {ToolRegistry}
 */
function createBrowserToolRegistry() {
  const registry = new ToolRegistry();
  registry.register(navigateTool);
  registry.register(getStateTool);
  registry.register(clickTool);
  registry.register(typeTool);
  registry.register(waitTool);
  registry.register(pressKeyTool);
  registry.register(extractTextTool);
  registry.register(scrollTool);
  registry.register(backTool);
  registry.register(screenshotTool);
  registry.register(submitFormTool);
  registry.register(askUserTool);
  return registry;
}

module.exports = { createBrowserToolRegistry, ToolRegistry };
