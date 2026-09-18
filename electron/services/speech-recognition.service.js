'use strict';

/**
 * SpeechRecognitionService
 *
 * Pluggable abstraction for Speech-To-Text (STT) voice command capture.
 * Captures user speech only upon on-demand trigger (wake word or mic click).
 */
class SpeechRecognitionService {
  constructor(options = {}) {
    this.lang = options.lang || 'en-US';
    this.maxSilenceMs = options.maxSilenceMs || 2200;
    this.isCapturing = false;
    this._recognition = null;
    this._silenceTimer = null;
    this._listeners = new Map();
  }

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
          console.error(`[SpeechRecognitionService] Error in handler '${event}':`, err);
        }
      });
    }
  }

  /**
   * Start capturing a spoken command.
   * Returns a promise that resolves with the transcribed text.
   */
  startCapture() {
    return new Promise((resolve, reject) => {
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRec) {
        const err = new Error('Speech recognition not supported in this environment');
        this.emit('error', { code: 'ENGINE_UNAVAILABLE', message: err.message });
        return reject(err);
      }

      if (this.isCapturing) {
        this.stopCapture();
      }

      let finalTranscript = '';
      let interimTranscript = '';
      let hasResolved = false;

      const finishCapture = (text) => {
        if (hasResolved) return;
        hasResolved = true;
        this.isCapturing = false;
        clearTimeout(this._silenceTimer);
        try {
          this._recognition.stop();
        } catch {}

        const cleaned = (text || finalTranscript || interimTranscript).trim();
        this.emit('transcribed', { text: cleaned });
        resolve(cleaned);
      };

      try {
        this._recognition = new SpeechRec();
        this._recognition.continuous = true;
        this._recognition.interimResults = true;
        this._recognition.lang = this.lang;

        this._recognition.onstart = () => {
          this.isCapturing = true;
          this.emit('start');
          // Fallback timer if no speech is detected at all
          this._silenceTimer = setTimeout(() => {
            finishCapture('');
          }, 8000);
        };

        this._recognition.onresult = (event) => {
          clearTimeout(this._silenceTimer);
          interimTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const piece = event.results[i][0]?.transcript || '';
            if (event.results[i].isFinal) {
              finalTranscript += piece + ' ';
            } else {
              interimTranscript += piece;
            }
          }

          const currentText = (finalTranscript + interimTranscript).trim();
          this.emit('interim', { text: currentText });

          // Reset silence timer: user stopped talking for maxSilenceMs -> complete
          if (currentText.length > 0) {
            this._silenceTimer = setTimeout(() => {
              finishCapture(currentText);
            }, this.maxSilenceMs);
          }
        };

        this._recognition.onerror = (event) => {
          if (event.error === 'no-speech') {
            finishCapture('');
            return;
          }
          console.warn('[SpeechRecognitionService] Error:', event.error);
          this.emit('error', { code: event.error, message: event.message || event.error });
          if (!hasResolved) {
            hasResolved = true;
            this.isCapturing = false;
            reject(new Error(event.error));
          }
        };

        this._recognition.onend = () => {
          if (!hasResolved) {
            finishCapture(finalTranscript || interimTranscript);
          }
        };

        this._recognition.start();
      } catch (err) {
        this.isCapturing = false;
        this.emit('error', { code: 'INIT_FAILED', message: err.message });
        reject(err);
      }
    });
  }

  stopCapture() {
    this.isCapturing = false;
    clearTimeout(this._silenceTimer);
    if (this._recognition) {
      try {
        this._recognition.stop();
      } catch {}
    }
    this.emit('stop');
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SpeechRecognitionService;
}
if (typeof window !== 'undefined') {
  window.SpeechRecognitionService = SpeechRecognitionService;
}
