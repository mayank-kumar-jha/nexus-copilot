'use strict';

const config = require('../config');

/**
 * DbService
 *
 * Safe wrapper around Prisma client.
 * Implements graceful degradation: if DATABASE_URL is unset or DB unreachable,
 * operations cleanly no-op or return null without crashing the application.
 */
class DbService {
  constructor() {
    this.enabled = false;
    this._prisma = null;

    if (config.db.enabled && config.db.url) {
      try {
        const { PrismaClient } = require('@prisma/client');
        this._prisma = new PrismaClient();
        this.enabled = true;
        console.log('[DbService] Prisma Client initialized.');
      } catch (err) {
        console.warn('[DbService] PrismaClient initialization skipped:', err.message);
      }
    } else {
      console.log('[DbService] Running in stateless / in-memory mode (DATABASE_URL not configured).');
    }
  }

  async connect() {
    if (!this.enabled || !this._prisma) return;
    try {
      await this._prisma.$connect();
      console.log('[DbService] Connected to PostgreSQL database.');
    } catch (err) {
      console.warn('[DbService] Failed to connect to DB, disabling DB persistence:', err.message);
      this.enabled = false;
    }
  }

  async disconnect() {
    if (this._prisma) {
      await this._prisma.$disconnect().catch(() => {});
    }
  }

  get client() {
    return this._prisma;
  }
}

module.exports = new DbService();
