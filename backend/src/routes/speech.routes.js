'use strict';

const { Router } = require('express');
const { GeminiService } = require('../services/llm/gemini.service');

const router = Router();
let geminiServiceInstance = null;

function getGeminiService() {
  if (!geminiServiceInstance) {
    geminiServiceInstance = new GeminiService();
  }
  return geminiServiceInstance;
}

/**
 * POST /api/speech/transcribe
 * Accepts: { audioBase64: string, mimeType?: string }
 * Returns: { success: boolean, text: string }
 */
router.post('/transcribe', async (req, res) => {
  try {
    const { audioBase64, mimeType } = req.body || {};

    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'audioBase64 string is required in request body.',
      });
    }

    // Clean base64 string in case data URL header is present
    const cleanBase64 = audioBase64.replace(/^data:[^;]+;base64,/, '');
    const cleanMime = mimeType || 'audio/webm';

    const gemini = getGeminiService();
    const text = await gemini.transcribeAudio({
      audioBase64: cleanBase64,
      mimeType: cleanMime,
    });

    return res.json({
      success: true,
      text: text || '',
    });
  } catch (err) {
    console.error('[SpeechRoutes] Transcription error:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message || 'Speech transcription failed',
    });
  }
});

module.exports = router;
