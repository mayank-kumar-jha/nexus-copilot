const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
require('dotenv').config();

/**
 * Centralized configuration — all env vars read here, nowhere else.
 */
const config = {
  server: {
    port: parseInt(process.env.PORT, 10) || 3000,
    env: process.env.NODE_ENV || 'development',
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  },

  browser: {
    headless: process.env.BROWSER_HEADLESS === 'true', // false by default -> visible Chrome window opens!
    slowMo: parseInt(process.env.BROWSER_SLOW_MO, 10) || 0,
    navigationTimeout: parseInt(process.env.BROWSER_NAVIGATION_TIMEOUT, 10) || 30000,
    userDataDir: process.env.BROWSER_USER_DATA_DIR || path.join(require('os').tmpdir(), 'nexus-browser-profile'),
    screenshotsDir: process.env.SCREENSHOTS_DIR || 'screenshots',
  },

  ai: {
    geminiApiKey: process.env.GEMINI_API_KEY || null,
    geminiApiKeyFallback: process.env.GEMINI_API_KEY_FALLBACK || null,
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview',
    maxTokens: parseInt(process.env.GEMINI_MAX_TOKENS, 10) || 8192,
    timeoutMs: parseInt(process.env.GEMINI_TIMEOUT_MS, 10) || 30000,
    maxRetries: parseInt(process.env.GEMINI_MAX_RETRIES, 10) || 3,
  },

  agent: {
    maxSteps: parseInt(process.env.AGENT_MAX_STEPS, 10) || 50,
    taskTimeoutMs: parseInt(process.env.AGENT_TASK_TIMEOUT_MS, 10) || 300000,
    maxStepRetries: parseInt(process.env.AGENT_MAX_STEP_RETRIES, 10) || 3,
    // Per-task budgets — how many Gemini calls a single task may make
    maxModelCalls: parseInt(process.env.AGENT_MAX_MODEL_CALLS, 10) || 20,
    maxVisionCalls: parseInt(process.env.AGENT_MAX_VISION_CALLS, 10) || 5,
    // How long to pause before giving up on quota-exhausted tasks (ms)
    quotaExhaustedBackoffMs: parseInt(process.env.AGENT_QUOTA_BACKOFF_MS, 10) || 0,
  },

  db: {
    url: process.env.DATABASE_URL || null,
    enabled: Boolean(process.env.DATABASE_URL),
  },

  redis: {
    url: process.env.REDIS_URL || null,
    enabled: Boolean(process.env.REDIS_URL),
  },
};

module.exports = config;
