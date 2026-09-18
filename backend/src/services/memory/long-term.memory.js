'use strict';

const fs = require('fs');
const path = require('path');

/**
 * LongTermMemory
 *
 * Cross-session persistent memory for storing domain interaction patterns,
 * site quirks, login hints, and historical task solutions.
 * Supports Postgres/Prisma when available, with a graceful local JSON file fallback.
 */
class LongTermMemory {
  /**
   * @param {object} [dbService] - Optional DB service backed by Prisma
   * @param {string} [storagePath] - Path to local JSON fallback store
   */
  constructor(dbService = null, storagePath = null) {
    this._db = dbService;
    this._storagePath =
      storagePath || path.resolve(__dirname, '../../../data/long-term-memory.json');
    this._inMemoryData = {
      patterns: {},
      taskHistory: [],
    };

    this._initStorage();
  }

  _initStorage() {
    try {
      const dir = path.dirname(this._storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (fs.existsSync(this._storagePath)) {
        const raw = fs.readFileSync(this._storagePath, 'utf8');
        this._inMemoryData = JSON.parse(raw);
      } else {
        this._flushToFile();
      }
    } catch (err) {
      console.warn('[LongTermMemory] Local storage init warning:', err.message);
    }
  }

  _flushToFile() {
    try {
      fs.writeFileSync(this._storagePath, JSON.stringify(this._inMemoryData, null, 2), 'utf8');
    } catch (err) {
      console.warn('[LongTermMemory] Failed writing to file store:', err.message);
    }
  }

  /**
   * Store a learned pattern or selector hint for a specific domain.
   *
   * @param {string} domain - e.g. 'github.com', 'linkedin.com'
   * @param {object} pattern - { selectorHints: {}, notes: string, antiBot: boolean }
   */
  async saveDomainPattern(domain, pattern) {
    const key = domain.toLowerCase().replace(/^www\./, '');
    this._inMemoryData.patterns[key] = {
      ...this._inMemoryData.patterns[key],
      ...pattern,
      updatedAt: new Date().toISOString(),
    };
    this._flushToFile();

    if (this._db?.enabled && this._db?.memory) {
      try {
        await this._db.memory.upsert({
          where: { key },
          update: { value: JSON.stringify(pattern) },
          create: { key, value: JSON.stringify(pattern) },
        });
      } catch (err) {
        console.warn('[LongTermMemory] DB write failed:', err.message);
      }
    }
  }

  /**
   * Retrieve learned pattern for a domain.
   *
   * @param {string} domain
   * @returns {Promise<object|null>}
   */
  async getDomainPattern(domain) {
    const key = domain.toLowerCase().replace(/^www\./, '');
    return this._inMemoryData.patterns[key] || null;
  }

  /**
   * Record a completed task and outcome for future recall.
   *
   * @param {object} record - { goal, stepsCount, success, summary }
   */
  async recordTaskOutcome(record) {
    this._inMemoryData.taskHistory.push({
      ...record,
      timestamp: new Date().toISOString(),
    });
    // Keep last 100 entries in local store
    if (this._inMemoryData.taskHistory.length > 100) {
      this._inMemoryData.taskHistory.shift();
    }
    this._flushToFile();
  }

  /**
   * Search for relevant past experiences matching query tokens.
   *
   * @param {string} query
   * @param {number} [limit=3]
   * @returns {Promise<Array>}
   */
  async searchRelevant(query, limit = 3) {
    const tokens = (query || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];

    const matches = this._inMemoryData.taskHistory.filter((entry) => {
      const text = `${entry.goal} ${entry.summary || ''}`.toLowerCase();
      return tokens.some((t) => text.includes(t));
    });

    return matches.slice(-limit);
  }
}

module.exports = LongTermMemory;
