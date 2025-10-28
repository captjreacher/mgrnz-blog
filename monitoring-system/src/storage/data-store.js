import { promises as fs } from 'fs';
import path from 'path';

/**
 * Data persistence layer for monitoring system
 * Handles storage and retrieval of pipeline runs, webhooks, and metrics
 */
export class DataStore {
  constructor(dataDir = './data') {
    this.dataDir = dataDir;
    this.pipelineRunsFile = path.join(dataDir, 'pipeline-runs.json');
    this.webhookRecordsFile = path.join(dataDir, 'webhook-records.json');
    this.metricsFile = path.join(dataDir, 'metrics.json');
    this.configFile = path.join(dataDir, 'config.json');
  }

  /**
   * Initialize data store and create necessary directories/files
   */
  async initialize() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      
      // Initialize empty data files if they don't exist
      await this._ensureFileExists(this.pipelineRunsFile, []);
      await this._ensureFileExists(this.webhookRecordsFile, []);
      await this._ensureFileExists(this.metricsFile, {});
      await this._ensureFileExists(this.configFile, this._getDefaultConfig());
      
      console.log(`Data store initialized at: ${this.dataDir}`);
    } catch (error) {
      throw new Error(`Failed to initialize data store: ${error.message}`);
    }
  }

  /**
   * Save a pipeline run record
   * @param {import('../types/index.js').PipelineRun} pipelineRun 
   */
  async savePipelineRun(pipelineRun) {
    try {
      const runs = await this._readJsonFile(this.pipelineRunsFile);
      
      // Update existing run or add new one
      const existingIndex = runs.findIndex(run => run.id === pipelineRun.id);
      if (existingIndex >= 0) {
        runs[existingIndex] = pipelineRun;
      } else {
        runs.push(pipelineRun);
      }
      
      await this._writeJsonFile(this.pipelineRunsFile, runs);
      return pipelineRun;
    } catch (error) {
      throw new Error(`Failed to save pipeline run: ${error.message}`);
    }
  }

  /**
   * Get a pipeline run by ID
   * @param {string} runId 
   * @returns {Promise<import('../types/index.js').PipelineRun|null>}
   */
  async getPipelineRun(runId) {
    try {
      const runs = await this._readJsonFile(this.pipelineRunsFile);
      return runs.find(run => run.id === runId) || null;
    } catch (error) {
      throw new Error(`Failed to get pipeline run: ${error.message}`);
    }
  }

  /**
   * Get all pipeline runs with optional filtering
   * @param {Object} filters - Optional filters
   * @param {string} [filters.status] - Filter by status
   * @param {string} [filters.triggerType] - Filter by trigger type
   * @param {number} [filters.limit] - Limit number of results
   * @returns {Promise<import('../types/index.js').PipelineRun[]>}
   */
  async getPipelineRuns(filters = {}) {
    try {
      let runs = await this._readJsonFile(this.pipelineRunsFile);
      
      // Apply filters
      if (filters.status) {
        runs = runs.filter(run => run.status === filters.status);
      }
      
      if (filters.triggerType) {
        runs = runs.filter(run => run.trigger.type === filters.triggerType);
      }
      
      // Sort by start time (newest first)
      runs.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
      
      // Apply limit
      if (filters.limit) {
        runs = runs.slice(0, filters.limit);
      }
      
      return runs;
    } catch (error) {
      throw new Error(`Failed to get pipeline runs: ${error.message}`);
    }
  }

  /**
   * Save a webhook record
   * @param {import('../types/index.js').WebhookRecord} webhookRecord 
   */
  async saveWebhookRecord(webhookRecord) {
    try {
      const records = await this._readJsonFile(this.webhookRecordsFile);
      
      // Update existing record or add new one
      const existingIndex = records.findIndex(record => record.id === webhookRecord.id);
      if (existingIndex >= 0) {
        records[existingIndex] = webhookRecord;
      } else {
        records.push(webhookRecord);
      }
      
      await this._writeJsonFile(this.webhookRecordsFile, records);
      return webhookRecord;
    } catch (error) {
      throw new Error(`Failed to save webhook record: ${error.message}`);
    }
  }

  /**
   * Get a webhook record by ID
   * @param {string} webhookId 
   * @returns {Promise<import('../types/index.js').WebhookRecord|null>}
   */
  async getWebhookRecord(webhookId) {
    try {
      const records = await this._readJsonFile(this.webhookRecordsFile);
      return records.find(record => record.id === webhookId) || null;
    } catch (error) {
      throw new Error(`Failed to get webhook record: ${error.message}`);
    }
  }

  /**
   * Get webhook records for a pipeline run
   * @param {string} runId 
   * @returns {Promise<import('../types/index.js').WebhookRecord[]>}
   */
  async getWebhookRecords(runId) {
    try {
      const records = await this._readJsonFile(this.webhookRecordsFile);
      return records.filter(record => record.runId === runId);
    } catch (error) {
      throw new Error(`Failed to get webhook records: ${error.message}`);
    }
  }

  /**
   * Save performance metrics
   * @param {string} runId 
   * @param {import('../types/index.js').PerformanceMetrics} metrics 
   */
  async saveMetrics(runId, metrics) {
    try {
      const allMetrics = await this._readJsonFile(this.metricsFile);
      allMetrics[runId] = {
        ...metrics,
        timestamp: new Date().toISOString()
      };
      
      await this._writeJsonFile(this.metricsFile, allMetrics);
      return metrics;
    } catch (error) {
      throw new Error(`Failed to save metrics: ${error.message}`);
    }
  }

  /**
   * Get performance metrics for a run or all runs
   * @param {string} [runId] - Optional run ID, if not provided returns all metrics
   * @returns {Promise<Object>}
   */
  async getMetrics(runId = null) {
    try {
      const allMetrics = await this._readJsonFile(this.metricsFile);
      
      if (runId) {
        return allMetrics[runId] || null;
      }
      
      return allMetrics;
    } catch (error) {
      throw new Error(`Failed to get metrics: ${error.message}`);
    }
  }

  /**
   * Save configuration
   * @param {Object} config 
   */
  async saveConfig(config) {
    try {
      await this._writeJsonFile(this.configFile, config);
      return config;
    } catch (error) {
      throw new Error(`Failed to save config: ${error.message}`);
    }
  }

  /**
   * Get configuration
   * @returns {Promise<Object>}
   */
  async getConfig() {
    try {
      return await this._readJsonFile(this.configFile);
    } catch (error) {
      throw new Error(`Failed to get config: ${error.message}`);
    }
  }

  /**
   * Clean up old records (keep last N records)
   * @param {number} keepCount - Number of records to keep
   */
  async cleanup(keepCount = 1000) {
    try {
      // Clean up pipeline runs
      const runs = await this._readJsonFile(this.pipelineRunsFile);
      if (runs.length > keepCount) {
        runs.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
        const cleanedRuns = runs.slice(0, keepCount);
        await this._writeJsonFile(this.pipelineRunsFile, cleanedRuns);
      }

      // Clean up webhook records
      const webhooks = await this._readJsonFile(this.webhookRecordsFile);
      if (webhooks.length > keepCount) {
        webhooks.sort((a, b) => new Date(b.timing.sent) - new Date(a.timing.sent));
        const cleanedWebhooks = webhooks.slice(0, keepCount);
        await this._writeJsonFile(this.webhookRecordsFile, cleanedWebhooks);
      }

      console.log(`Data cleanup completed, kept ${keepCount} most recent records`);
    } catch (error) {
      throw new Error(`Failed to cleanup data: ${error.message}`);
    }
  }

  // Private helper methods

  async _ensureFileExists(filePath, defaultContent) {
    try {
      await fs.access(filePath);
    } catch {
      await this._writeJsonFile(filePath, defaultContent);
    }
  }

  async _readJsonFile(filePath) {
    try {
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async _writeJsonFile(filePath, data) {
    const jsonData = JSON.stringify(data, null, 2);
    await fs.writeFile(filePath, jsonData, 'utf8');
  }

  _getDefaultConfig() {
    return {
      monitoring: {
        interval: 30000,
        timeout: 300000,
        retryAttempts: 3
      },
      endpoints: {
        supabase: "https://your-project.supabase.co/functions/v1/ml-to-hugo-public",
        github: "https://api.github.com/repos/captjreacher/mgrnz-blog",
        site: "https://mgrnz.com"
      },
      alerts: {
        enabled: true,
        thresholds: {
          errorRate: 10,
          responseTime: 5000,
          buildTime: 300000
        }
      },
      storage: {
        maxRecords: 1000,
        cleanupInterval: 86400000 // 24 hours
      }
    };
  }
}