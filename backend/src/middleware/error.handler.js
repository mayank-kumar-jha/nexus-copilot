'use strict';

/**
 * Centralized Express error handler.
 *
 * Must be registered AFTER all routes (4-argument signature required by Express).
 * Catches both sync throws and async errors forwarded via next(err).
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // Log the full error server-side
  console.error('[ErrorHandler] %s %s → %d %s', req.method, req.path, status, message);
  if (status >= 500) {
    console.error(err.stack);
  }

  res.status(status).json({
    error: {
      message,
      status,
      // Only expose stack trace in development
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
}

module.exports = errorHandler;
