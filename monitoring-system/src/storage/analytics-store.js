import { promises as fs } from 'fs';
import path from 'path';

/**
 * Persistence helper for analytics snapshots and aggregates
 */
export class AnalyticsStore {
  constructor(dataDir = './data') {
    this.dataDir = dataDir;
    this.analyticsDir = path.join(dataDir, 'analytics');
    this.snapshotsFile = path.join(this.analyticsDir, 'snapshots.json');
    this.aggregatesFile = path.join(this.analyticsDir, 'aggregates.json');
  }

  async initialize() {
    await fs.mkdir(this.analyticsDir, { recursive: true });
    await this._ensureFileExists(this.snapshotsFile, []);
    await this._ensureFileExists(this.aggregatesFile, {});
  }

  /**
   * Save analytics snapshot with retention enforcement
   * @param {Object} snapshot
   * @param {Object} options
   * @param {number} [options.limit]
   */
  async saveSnapshot(snapshot, options = {}) {
    const { limit } = options;
    const snapshots = await this._readJsonFile(this.snapshotsFile, []);

    snapshots.push(snapshot);

    if (limit && snapshots.length > limit) {
      const excess = snapshots.length - limit;
      snapshots.splice(0, excess);
    }

    await this._writeJsonFile(this.snapshotsFile, snapshots);
    return snapshot;
  }

  /**
   * Retrieve stored snapshots
   * @param {Object} options
   * @param {number} [options.limit]
   * @returns {Promise<Object[]>}
   */
  async getSnapshots(options = {}) {
    const { limit } = options;
    const snapshots = await this._readJsonFile(this.snapshotsFile, []);

    if (limit) {
      return snapshots.slice(Math.max(0, snapshots.length - limit));
    }

    return snapshots;
  }

  /**
   * Persist aggregated analytics metrics
   * @param {Object} aggregates
   */
  async saveAggregates(aggregates) {
    await this._writeJsonFile(this.aggregatesFile, aggregates);
    return aggregates;
  }

  /**
   * Retrieve latest aggregated analytics
   * @returns {Promise<Object>}
   */
  async getAggregates() {
    return await this._readJsonFile(this.aggregatesFile, {});
  }

  async _ensureFileExists(filePath, defaultContent) {
    try {
      await fs.access(filePath);
    } catch {
      await this._writeJsonFile(filePath, defaultContent);
    }
  }

  async _readJsonFile(filePath, fallback) {
    try {
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return fallback;
      }
      throw error;
    }
  }

  async _writeJsonFile(filePath, data) {
    const jsonData = JSON.stringify(data, null, 2);
    await fs.writeFile(filePath, jsonData, 'utf8');
  }
}
