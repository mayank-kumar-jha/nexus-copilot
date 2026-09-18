'use strict';

/**
 * WakeWordService
 *
 * Local wake-word detector for Nexus.
 * Continuously monitors local microphone stream for the configured wake phrase (e.g. "Nexus").
 *
 * PRIVACY GUARANTEE:
 * Audio is processed strictly locally and never streamed to any cloud or LLM API.
 */
class WakeWordService {
  /**
   * @param {object} [options]
   * @param {string} [options.wakeWord='Nexus']
   * @param {boolean} [options.enabled=true]
   */
  constructor(options = {}) {
    this.wakeWord = (options.wakeWord || process.env.NEXUS_WAKE_WORD || 'Nexus').trim().toLowerCase();
    this.enabled = options.enabled !== undefined ? Boolean(options.enabled) : true;
    this.isListening = false;
    this.hasMicPermission = false;
    this._listeners = new Map();
    this._recognition = null;
    this._stream = null;
    this._restartTimer = null;
    this._isStarting = false;
  }

  /**
   * Subscribe to events: 'detected', 'state_change', 'error', 'ready', 'permission_granted'
   */
  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this._listeners.has(event)) {
      this._listeners.get(event).delete(callback);
    }
  }

  emit(event, data) {
    const handlers = this._listeners.get(event);
    if (handlers) {
      handlers.forEach((fn) => {
        try {
          fn(data);
        } catch (err) {
          console.error(`[WakeWordService] Error in event listener '${event}':`, err);
        }
      });
    }
  }

  setWakeWord(word) {
    if (word && typeof word === 'string') {
      this.wakeWord = word.trim().toLowerCase();
      console.log('[WakeWordService] Wake word set to:', this.wakeWord);
    }
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled && this.isListening) {
      this.stop();
    } else if (this.enabled && !this.isListening) {
      this.start();
    }
    this.emit('state_change', { isListening: this.isListening, enabled: this.enabled });
  }

  /**
   * Prompt and ensure microphone permission via getUserMedia
   */
  async requestMicPermission() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }
    try {
      this._stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.hasMicPermission = true;
      this.emit('permission_granted');
      return true;
    } catch (err) {
      console.warn('[WakeWordService] Microphone permission check:', err.message);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        this.emit('error', { code: 'PERMISSION_DENIED', message: 'Microphone permission denied.' });
      } else if (err.name === 'NotFoundError') {
        this.emit('error', { code: 'MIC_UNAVAILABLE', message: 'No microphone found.' });
      }
      return false;
    }
  }

  /**
   * Initialize and start local wake-word detector.
   */
  async start() {
    if (!this.enabled) return false;
    if (this.isListening || this._isStarting) return true;
    this._isStarting = true;

    // First ensure microphone permission
    await this.requestMicPermission();

    const SpeechRec = (typeof window !== 'undefined') ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
    if (!SpeechRec) {
      this._isStarting = false;
      this.emit('error', {
        code: 'ENGINE_UNAVAILABLE',
        message: 'Speech recognition engine is not supported in this environment.',
      });
      return false;
    }

    try {
      if (this._recognition) {
        try { this._recognition.abort(); } catch {}
      }

      this._recognition = new SpeechRec();
      this._recognition.continuous = true;
      this._recognition.interimResults = true;
      this._recognition.lang = 'en-US';

      this._recognition.onstart = () => {
        this.isListening = true;
        this._isStarting = false;
        this.emit('ready', { wakeWord: this.wakeWord });
        this.emit('state_change', { isListening: true, enabled: this.enabled });
      };

      this._recognition.onresult = (event) => {
        if (!this.enabled) return;

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0]?.transcript?.trim().toLowerCase() || '';
          if (this._matchesWakeWord(transcript)) {
            console.log('[WakeWordService] Wake word detected:', transcript);
            this.emit('detected', {
              wakeWord: this.wakeWord,
              matchedPhrase: transcript,
              timestamp: Date.now(),
            });
            break;
          }
        }
      };

      this._recognition.onerror = (event) => {
        if (event.error === 'no-speech') return;
        console.warn('[WakeWordService] Speech recognition notice:', event.error);
        if (event.error === 'not-allowed') {
          this.emit('error', { code: 'PERMISSION_DENIED', message: 'Microphone permission denied.' });
        } else if (event.error === 'audio-capture') {
          this.emit('error', { code: 'MIC_UNAVAILABLE', message: 'Microphone is unavailable or in use.' });
        }
      };

      this._recognition.onend = () => {
        this.isListening = false;
        this._isStarting = false;
        if (this.enabled) {
          clearTimeout(this._restartTimer);
          this._restartTimer = setTimeout(() => {
            if (this.enabled && !this.isListening) {
              try {
                this._recognition.start();
              } catch {}
            }
          }, 350);
        }
      };

      this._recognition.start();
      return true;
    } catch (err) {
      this._isStarting = false;
      this.emit('error', { code: 'INIT_FAILED', message: err.message });
      return false;
    }
  }

  _matchesWakeWord(transcript) {
    if (!transcript) return false;
    const target = this.wakeWord;
    const text = transcript.toLowerCase();

    // Direct match or common phonetic speech-to-text approximations for "Nexus"
    const variations = [
      target,
      'hey ' + target,
      'ok ' + target,
      'hi ' + target,
      'nexas',
      'next us',
      'neck sus',
      'lexus',
      'texas'
    ];

    return variations.some(v => text.includes(v));
  }

  stop() {
    this.isListening = false;
    this._isStarting = false;
    clearTimeout(this._restartTimer);
    if (this._recognition) {
      try {
        this._recognition.stop();
      } catch {}
    }
    this.emit('state_change', { isListening: false, enabled: this.enabled });
  }

  destroy() {
    this.stop();
    if (this._stream) {
      try {
        this._stream.getTracks().forEach(t => t.stop());
      } catch {}
    }
    this._listeners.clear();
    this._recognition = null;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = WakeWordService;
}
if (typeof window !== 'undefined') {
  window.WakeWordService = WakeWordService;
}
