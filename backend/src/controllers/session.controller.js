'use strict';

/**
 * SessionController
 */
class SessionController {
  /**
   * @param {import('../services/session.service')} sessionService
   */
  constructor(sessionService) {
    this._sessions = sessionService;
  }

  createSession = async (req, res, next) => {
    try {
      const { sessionId, browserConfig, policyMode } = req.body || {};
      const session = await this._sessions.getOrCreateSession(sessionId, {
        browserConfig,
        policyMode,
      });

      res.status(201).json({
        success: true,
        sessionId: session.sessionId,
        createdAt: session.createdAt,
      });
    } catch (err) {
      next(err);
    }
  };

  closeSession = async (req, res, next) => {
    try {
      const { id } = req.params;
      const closed = await this._sessions.closeSession(id);
      if (!closed) {
        return res.status(404).json({ success: false, error: `Session ${id} not found` });
      }
      res.json({ success: true, message: `Session ${id} closed` });
    } catch (err) {
      next(err);
    }
  };
}

module.exports = SessionController;
