'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../../config');
const ModelGateway = require('./model.gateway');

// ── Prompts ───────────────────────────────────────────────────────────────────

const DECISION_SYSTEM_PROMPT = `You are Nexus, an intelligent, polite, and highly capable autonomous AI assistant controlling a web browser to accomplish user goals.
You receive structured page state (URL, title, interactive & text elements) and recent action history, and must choose the best next action.

CORE GUIDELINES:
1. HUMAN-FRIENDLY REASONING:
   - In "reasoning", always write natural, conversational, human-friendly narratives (e.g., "Navigating to ChatGPT...", "Entering your prompt into the chat box...", "Waiting for the generated result to load..."). Avoid raw code selectors or robotic logs.

2. ASKING THE USER QUESTIONS & ASKING FOR ACCESS / CREDENTIALS (Tool: "ask_user"):
   - When you encounter a login screen, authentication barrier, 2FA prompt, CAPTCHA, account gate (e.g. on ChatGPT, Claude, GitHub, Amazon, or private portals), or missing information:
     - Use the "ask_user" tool to ask the user politely and conversationally.
     - Example: { "tool": "ask_user", "arguments": { "question": "ChatGPT requires login authorization to proceed. Should I continue with your access or do you want to provide credentials?", "context": "ChatGPT Auth Gate" }, "reasoning": "Detected ChatGPT login screen. Asking user for access authorization." }
     - When the user replies (e.g. "access", "proceed", "yes", or gives details in history), continue execution smoothly!

3. POPUPS & COOKIE BANNERS:
   - If a simple cookie consent, modal popup, "Stay logged out", "Accept all", or "Close" button appears, click it to dismiss it before interacting with the main page content.

4. HANDLING AI PLATFORMS (ChatGPT, Claude, Bing Image Creator):
   - When asked to generate an image or ask ChatGPT something:
     - Navigate to https://chatgpt.com
     - If a login barrier blocks access, ask the user with "ask_user" or click "Stay logged out" / sign-in as appropriate.
     - Find the chat textarea (e.g. "#prompt-textarea", "textarea", or "[contenteditable]")
     - Type the prompt verbatim with pressEnter: true.
     - Use "browser.wait" ({"ms": 5000}) to allow the AI to generate the response.
     - Once generated text or image appears, extract it and mark taskComplete: true.

5. FINISHING TASKS:
   - When the user's goal is accomplished, set taskComplete: true, put a warm, complete, beautifully formatted answer in "result", and provide concise conversational "reasoning".

RESPONSE FORMAT (JSON ONLY):
{
  "tool": "<tool name or ask_user>",
  "arguments": { <tool-specific args> },
  "reasoning": "<natural, human-friendly summary of what you are doing>",
  "expectedOutcome": "<what should happen on screen>",
  "taskComplete": false,
  "confidence": 0.95
}

If task is complete:
{
  "tool": null,
  "reasoning": "<warm summary of completed mission>",
  "taskComplete": true,
  "confidence": 1.0,
  "result": "<detailed, rich findings, answer, or extracted response>"
}`;

const PLAN_SYSTEM_PROMPT = `You are a task planner for a browser automation agent.
Break the given goal into a sequence of concrete, achievable steps.
Each step should correspond to one or a few browser actions.

Return ONLY a valid JSON object:
{
  "steps": [
    { "id": "step_1", "description": "<what to do>", "expectedTools": ["browser.navigate"] },
    { "id": "step_2", "description": "<what to do>", "expectedTools": ["browser.click"] }
  ]
}`;

// ── Error classification ──────────────────────────────────────────────────────

/**
 * Normalized API error. Thrown by GeminiService so callers can react
 * to the *type* of failure instead of raw HTTP codes.
 *
 * types: TRANSIENT | RATE_LIMIT | QUOTA_EXHAUSTED | AUTH | INVALID_REQUEST | UNKNOWN
 */
class AgentApiError extends Error {
  /**
   * @param {string} type
   * @param {string} message
   * @param {boolean} retryable
   * @param {number} [retryAfterMs]
   * @param {Error} [cause]
   */
  constructor(type, message, retryable, retryAfterMs = 0, cause = null) {
    super(message);
    this.name = 'AgentApiError';
    this.type = type;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
    this.cause = cause;
  }
}

// ── GeminiService ─────────────────────────────────────────────────────────────

class GeminiService {
  constructor() {
    // Build a pool of API keys: primary first, fallback second.
    this._keys = [
      config.ai.geminiApiKey,
      config.ai.geminiApiKeyFallback,
    ].filter(k => k && k !== 'your_gemini_api_key_here');

    if (this._keys.length === 0) {
      console.warn('[GeminiService] No API key configured. AI features will fail.');
      this._client = null;
      return;
    }

    const preferred = config.ai.geminiModel || 'gemini-3.1-flash-lite-preview';
    this._models = Array.from(new Set([
      preferred,
      'gemini-3.1-flash-lite-preview',
      'gemini-3-flash-preview',
      'gemini-flash-latest',
      'gemini-3.5-flash'
    ]));

    this._keyIndex = 0; // which key is currently active
    this._modelIndex = 0;
    this._modelName = this._models[0];
    this._initClient(this._keyIndex);
    console.log(
      '[GeminiService] Initialized. model=%s  keys=%d  fallbackModels=%s',
      this._modelName, this._keys.length, this._models.join(',')
    );
  }

  /** (Re-)initialise the Google client for a given key slot. */
  _initClient(index) {
    this._client = new GoogleGenerativeAI(this._keys[index]);
    this._keyIndex = index;
    this._lastCallAt = 0; // reset call timestamp when key changes
    console.log('[GeminiService] Using API key slot %d/%d (model: %s)', index + 1, this._keys.length, this._modelName);
  }

  /** Try to rotate to the next candidate model. Returns true if rotated. */
  _rotateModel() {
    const next = this._modelIndex + 1;
    if (next < this._models.length) {
      this._modelIndex = next;
      this._modelName = this._models[next];
      console.warn('[GeminiService] Switching to candidate model: %s', this._modelName);
      return true;
    }
    return false;
  }

  /** Try to rotate to the next available key. Returns true if rotated. */
  _rotateKey() {
    const next = this._keyIndex + 1;
    if (next < this._keys.length) {
      console.warn(
        '[GeminiService] Key slot %d exhausted — switching to slot %d.',
        this._keyIndex + 1, next + 1
      );
      this._modelIndex = 0;
      this._modelName = this._models[0];
      this._initClient(next);
      return true;
    }
    console.error('[GeminiService] All %d API key(s) and candidate models exhausted.', this._keys.length);
    return false;
  }

  /**
   * Enforce a minimum gap between successive API calls to stay under RPM limits.
   * Free tier = 15 RPM → one call per 2000 ms is safe.
   */
  async _rateLimit() {
    const minGapMs = parseInt(process.env.GEMINI_MIN_CALL_GAP_MS, 10) || 2000;
    const now = Date.now();
    const wait = minGapMs - (now - (this._lastCallAt || 0));
    if (wait > 0) {
      await new Promise(r => setTimeout(r, wait));
    }
    this._lastCallAt = Date.now();
  }

  _assertConfigured() {
    if (!this._client) {
      throw new Error('GeminiService: GEMINI_API_KEY is not configured. Set it in .env');
    }
  }

  /**
   * Get a configured model instance.
   * @param {boolean} jsonMode - Whether to request JSON output
   */
  _getModel(jsonMode = false) {
    this._assertConfigured();
    return this._client.getGenerativeModel({
      model: this._modelName,
      generationConfig: {
        maxOutputTokens: config.ai.maxTokens,
        ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
      },
    });
  }

  /**
   * Map a raw Google SDK / HTTP error into an AgentApiError.
   * @param {Error} err
   * @returns {AgentApiError}
   */
  static _classifyError(err) {
    const status = err.status || err.code || 0;
    const msg = (err.message || '').toLowerCase();

    // Daily / project-level quota exhausted
    if (
      status === 429 &&
      (msg.includes('quota') || msg.includes('daily') || msg.includes('per_day') || msg.includes('requests/day') || msg.includes('limit: 20'))
    ) {
      return new AgentApiError('QUOTA_EXHAUSTED', err.message, false, 0, err);
    }

    // Short-term rate limit — retryable after a cooldown
    if (status === 429 || msg.includes('rate limit') || msg.includes('too many requests')) {
      const retryAfterMs = err.retryAfterSecs ? err.retryAfterSecs * 1000 : 5000;
      return new AgentApiError('RATE_LIMIT', err.message, true, retryAfterMs, err);
    }

    // Model temporary overload / unavailable
    if (status === 503 || msg.includes('high demand') || msg.includes('service unavailable')) {
      return new AgentApiError('MODEL_OVERLOADED', err.message, true, 3000, err);
    }

    // Model not found / unsupported method
    if (status === 404 || msg.includes('not found') || msg.includes('not supported for generatecontent')) {
      return new AgentApiError('MODEL_NOT_FOUND', err.message, true, 0, err);
    }

    // Auth / key problems — not retryable on same key
    if (status === 401 || status === 403 || msg.includes('api key') || msg.includes('permission denied')) {
      return new AgentApiError('AUTH', err.message, false, 0, err);
    }

    // Bad request
    if (status === 400 || msg.includes('invalid')) {
      return new AgentApiError('INVALID_REQUEST', err.message, false, 0, err);
    }

    // Server-side transient errors — retryable
    if (status >= 500 || err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED' || msg.includes('timeout')) {
      return new AgentApiError('TRANSIENT', err.message, true, 0, err);
    }

    // Fallback — treat as transient so the retry loop can decide
    return new AgentApiError('UNKNOWN', err.message, true, 0, err);
  }

  /**
   * Retry wrapper with exponential backoff + automatic model and key rotation.
   */
  async _withRetry(fn, maxRetries = config.ai.maxRetries) {
    let lastErr;
    const totalAttempts = (maxRetries + 1) * this._models.length * this._keys.length;

    for (let attempt = 0; attempt < totalAttempts; attempt++) {
      try {
        await this._rateLimit();
        return await fn();
      } catch (raw) {
        const err = raw instanceof AgentApiError ? raw : GeminiService._classifyError(raw);
        lastErr = err;

        // Model not found or overloaded -> try next model first
        if (err.type === 'MODEL_NOT_FOUND' || err.type === 'MODEL_OVERLOADED') {
          if (this._rotateModel()) {
            continue;
          }
        }

        // Quota, auth, or all models failed on this key -> rotate key
        if (err.type === 'QUOTA_EXHAUSTED' || err.type === 'AUTH' || err.type === 'MODEL_NOT_FOUND') {
          if (this._rotateKey()) {
            continue;
          }
          console.error('[GeminiService] All keys and models exhausted.');
          throw err;
        }

        if (!err.retryable || attempt >= totalAttempts - 1) {
          console.error('[GeminiService] Non-retryable error (type=%s): %s', err.type, err.message);
          throw err;
        }

        const delay = err.retryAfterMs > 0 ? err.retryAfterMs : Math.min(Math.pow(2, attempt % 4) * 500, 5000);
        console.warn(
          '[GeminiService] Retrying in %dms (type=%s, attempt %d/%d)…',
          delay, err.type, attempt + 1, totalAttempts
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastErr;
  }

  /**
   * Raw text generation.
   */
  async generate(prompt) {
    return this._withRetry(async () => {
      const model = this._getModel(false);
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      // Attach usage metadata for the gateway to track
      const usage = response.usageMetadata;
      return Object.assign(text, {
        _usage: {
          inputTokens: usage?.promptTokenCount || 0,
          outputTokens: usage?.candidatesTokenCount || 0,
        },
      });
    });
  }

  /**
   * Agent decision — structured JSON response.
   */
  async decide(goal, pageState, history, availableTools, memoryContext = null) {
    const toolList = (availableTools || [])
      .map((t) => `- ${t.name}: ${t.description} (risk: ${t.riskLevel})`)
      .join('\n');

    const recentHistory = (history || []).slice(-5).map((h, i) => ({
      step: i + 1,
      action: h.action,
      outcome: h.outcome,
    }));

    const memorySnippet = memoryContext
      ? `\nLONG-TERM MEMORY & RELEVANT EXPERIENCES:\n${JSON.stringify(memoryContext, null, 2)}\n`
      : '';

    const prompt = `${DECISION_SYSTEM_PROMPT}

GOAL: ${goal}

CURRENT PAGE STATE:
URL: ${pageState.url}
Title: ${pageState.title}
Elements (${pageState.elementCount || 0} total):
${JSON.stringify(pageState.elements?.slice(0, 30) || [], null, 2)}

RECENT HISTORY (last ${recentHistory.length} steps):
${JSON.stringify(recentHistory, null, 2)}
${memorySnippet}
AVAILABLE TOOLS:
${toolList}

Respond with JSON only:`;

    return this._withRetry(async () => {
      const model = this._getModel(true);
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(`GeminiService: Failed to parse decision JSON: ${text.substring(0, 200)}`);
      }

      parsed._usage = {
        inputTokens: response.usageMetadata?.promptTokenCount || 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
      };

      return parsed;
    });
  }

  /**
   * Task planner — break goal into steps.
   */
  async plan(goal, context) {
    const prompt = `${PLAN_SYSTEM_PROMPT}

GOAL: ${goal}
CONTEXT: ${JSON.stringify(context || {}, null, 2)}

Return JSON only:`;

    return this._withRetry(async () => {
      const model = this._getModel(true);
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(`GeminiService: Failed to parse plan JSON: ${text.substring(0, 200)}`);
      }

      parsed._usage = {
        inputTokens: response.usageMetadata?.promptTokenCount || 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
      };

      return parsed;
    });
  }

  /**
   * Vision analysis — called only when structured perception is insufficient.
   * @param {Buffer} imageBuffer
   * @param {string} prompt
   */
  async analyzeScreenshot(imageBuffer, prompt) {
    return this._withRetry(async () => {
      const model = this._getModel(false);
      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: 'image/png',
            data: imageBuffer.toString('base64'),
          },
        },
        prompt,
      ]);
      const response = result.response;
      const text = response.text();

      return Object.assign(text, {
        _usage: {
          inputTokens: response.usageMetadata?.promptTokenCount || 0,
          outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
        },
      });
    });
  }

  /**
   * Transcribe spoken audio snippet to natural text.
   * @param {Object} options
   * @param {string} options.audioBase64 - Base64-encoded audio data
   * @param {string} [options.mimeType] - Mime type (e.g. audio/webm, audio/wav, audio/ogg)
   * @returns {Promise<string>}
   */
  async transcribeAudio({ audioBase64, mimeType = 'audio/webm' }) {
    return this._withRetry(async () => {
      const model = this._getModel(false);
      const prompt = `You are a high-accuracy Speech-To-Text transcriber.
Listen to the audio recording and transcribe EXACTLY what the user said in natural English text.

STRICT RULES:
- Output ONLY the verbatim words spoken by the human speaker.
- Do NOT add commentary, explanations, quotes, or markdown.
- If the audio is silent, contains only static/hissing noise, or has no discernible human speech, output exactly: NO_SPEECH
- Do NOT guess or invent sample commands. If unsure or unintelligible, output NO_SPEECH.`;

      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: mimeType || 'audio/webm',
            data: audioBase64,
          },
        },
        prompt,
      ]);
      const response = result.response;
      const text = (response.text() || '').trim();
      if (!text || text.toUpperCase() === 'NO_SPEECH' || text.toUpperCase().includes('NO_SPEECH')) {
        return '';
      }
      return text;
    });
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a ModelGateway backed by Gemini.
 * @returns {ModelGateway}
 */
function createGeminiGateway() {
  const gemini = new GeminiService();
  return new ModelGateway(gemini);
}

module.exports = { createGeminiGateway, GeminiService, AgentApiError };
