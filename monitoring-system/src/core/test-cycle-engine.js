import { DataStore } from '../storage/data-store.js';
import { IdGenerator } from '../utils/id-generator.js';
import { Validators } from '../utils/validators.js';

/**
 * Core orchestrator for the automated test cycle monitoring system
 * Manages pipeline runs, coordinates monitoring components, and tracks state
 */
export class TestCycleEngine {
  constructor(config = {}, options = {}) {
    this.dataStore = new DataStore(config.dataDir);
    this.config = config;
    this.activePipelines = new Map();
    this.isRunning = false;
    this.monitoringInterval = null;
    this.activeAlerts = new Map();
    this.alertHistory = [];
    this.metricsSummary = {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      averageDuration: 0
    };
    this.lastPipelineActivity = null;
    this.bootTimestamp = new Date().toISOString();
  }

  /**
   * Initialize the test cycle engine
   */
  async initialize() {
    try {
      await this.dataStore.initialize();

      // Load configuration from storage if available
      const storedConfig = await this.dataStore.getConfig();
      this.config = { ...storedConfig, ...this.config };
      
      await this._rebuildMetricsSummary();

      console.log('Test Cycle Engine initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize Test Cycle Engine:', error.message);
      throw error;
    }
  }

  /**
   * Start monitoring activities
   */
  async startMonitoring() {
    if (this.isRunning) {
      console.log('Monitoring is already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting automated test cycle monitoring...');

    // Start periodic monitoring tasks
    const interval = this.config.monitoring?.interval || 30000;
    this.monitoringInterval = setInterval(() => {
      this._performPeriodicTasks();
    }, interval);

    console.log(`Monitoring started with ${interval}ms interval`);
  }

  /**
   * Stop monitoring activities
   */
  async stopMonitoring() {
    if (!this.isRunning) {
      console.log('Monitoring is not running');
      return;
    }

    this.isRunning = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    console.log('Monitoring stopped');
  }

  /**
   * Create a new pipeline run
   * @param {import('../types/index.js').TriggerEvent} trigger - Trigger event that started the pipeline
   * @returns {Promise<string>} Pipeline run ID
   */
  async createPipelineRun(trigger) {
    try {
      // Validate trigger event
      const triggerValidation = Validators.validateTriggerEvent(trigger);
      if (!triggerValidation.valid) {
        throw new Error(`Invalid trigger: ${triggerValidation.errors.join(', ')}`);
      }

      const runId = IdGenerator.generatePipelineRunId();
      const now = new Date().toISOString();

      const pipelineRun = {
        id: runId,
        trigger,
        stages: [],
        status: 'running',
        startTime: now,
        success: false,
        errors: [],
        metrics: {
          webhookLatency: 0,
          buildTime: 0,
          deploymentTime: 0,
          siteResponseTime: 0,
          totalPipelineTime: 0,
          errorRate: 0,
          successRate: 0,
          throughput: 0
        }
      };

      // Validate the complete pipeline run
      const validation = Validators.validatePipelineRun(pipelineRun);
      if (!validation.valid) {
        throw new Error(`Invalid pipeline run: ${validation.errors.join(', ')}`);
      }

      // Save to storage and add to active pipelines
      await this.dataStore.savePipelineRun(pipelineRun);
      this.activePipelines.set(runId, pipelineRun);

      console.log(`Created pipeline run: ${runId} (trigger: ${trigger.type})`);
      return runId;
    } catch (error) {
      console.error('Failed to create pipeline run:', error.message);
      throw error;
    }
  }

  /**
   * Update a pipeline stage
   * @param {string} runId - Pipeline run ID
   * @param {string} stageName - Name of the stage
   * @param {'pending'|'running'|'completed'|'failed'} status - Stage status
   * @param {Object} data - Stage-specific data
   * @returns {Promise<void>}
   */
  async updatePipelineStage(runId, stageName, status, data = {}) {
    try {
      const pipelineRun = await this._getPipelineRun(runId);
      if (!pipelineRun) {
        throw new Error(`Pipeline run not found: ${runId}`);
      }

      const now = new Date().toISOString();
      let stage = pipelineRun.stages.find(s => s.name === stageName);

      if (!stage) {
        // Create new stage
        stage = {
          name: stageName,
          status: 'pending',
          data: {},
          errors: []
        };
        pipelineRun.stages.push(stage);
      }

      // Update stage status and timing
      const previousStatus = stage.status;
      stage.status = status;
      stage.data = { ...stage.data, ...data };

      if (previousStatus === 'pending' && status === 'running') {
        stage.startTime = now;
      }

      if (status === 'completed' || status === 'failed') {
        stage.endTime = now;
        if (stage.startTime) {
          stage.duration = new Date(now) - new Date(stage.startTime);
        }
      }

      // Update pipeline run
      await this._updatePipelineRun(pipelineRun);

      console.log(`Updated stage ${stageName} for run ${runId}: ${status}`);

      await this._evaluatePipelineAlerts(pipelineRun);
    } catch (error) {
      console.error('Failed to update pipeline stage:', error.message);
      throw error;
    }
  }

  /**
   * Complete a pipeline run
   * @param {string} runId - Pipeline run ID
   * @param {boolean} success - Whether the pipeline completed successfully
   * @param {Object} finalMetrics - Final performance metrics
   * @returns {Promise<void>}
   */
  async completePipelineRun(runId, success, finalMetrics = {}) {
    try {
      const pipelineRun = await this._getPipelineRun(runId);
      if (!pipelineRun) {
        throw new Error(`Pipeline run not found: ${runId}`);
      }

      const now = new Date().toISOString();
      pipelineRun.endTime = now;
      pipelineRun.success = success;
      pipelineRun.status = success ? 'completed' : 'failed';

      if (pipelineRun.startTime) {
        pipelineRun.duration = new Date(now) - new Date(pipelineRun.startTime);
      }

      // Update metrics
      pipelineRun.metrics = { ...pipelineRun.metrics, ...finalMetrics };
      if (pipelineRun.duration) {
        pipelineRun.metrics.totalPipelineTime = pipelineRun.duration;
      }

      // Calculate success/error rates
      const errorCount = pipelineRun.errors.length;
      const totalStages = pipelineRun.stages.length;
      if (totalStages > 0) {
        pipelineRun.metrics.errorRate = (errorCount / totalStages) * 100;
        pipelineRun.metrics.successRate = 100 - pipelineRun.metrics.errorRate;
      }

      await this._updatePipelineRun(pipelineRun);

      // Remove from active pipelines
      this.activePipelines.delete(runId);

      this._updateMetricsSummary(success, pipelineRun.duration || 0);
      this.lastPipelineActivity = now;

      console.log(`Completed pipeline run ${runId}: ${success ? 'SUCCESS' : 'FAILED'}`);

      await this._evaluatePipelineAlerts(pipelineRun);
    } catch (error) {
      console.error('Failed to complete pipeline run:', error.message);
      throw error;
    }
  }

  /**
   * Add an error to a pipeline run
   * @param {string} runId - Pipeline run ID
   * @param {string} stage - Stage where error occurred
   * @param {string} type - Error type
   * @param {string} message - Error message
   * @param {Object} context - Additional error context
   * @returns {Promise<void>}
   */
  async addError(runId, stage, type, message, context = {}) {
    try {
      const pipelineRun = await this._getPipelineRun(runId);
      if (!pipelineRun) {
        throw new Error(`Pipeline run not found: ${runId}`);
      }

      const errorRecord = {
        id: IdGenerator.generateErrorId(),
        stage,
        type,
        message,
        timestamp: new Date().toISOString(),
        context
      };

      pipelineRun.errors.push(errorRecord);
      await this._updatePipelineRun(pipelineRun);

      console.log(`Added error to run ${runId}: ${type} - ${message}`);

      await this._evaluatePipelineAlerts(pipelineRun);
    } catch (error) {
      console.error('Failed to add error:', error.message);
      throw error;
    }
  }

  /**
   * Get pipeline run status
   * @param {string} runId - Pipeline run ID
   * @returns {Promise<import('../types/index.js').PipelineRun|null>}
   */
  async getPipelineRun(runId) {
    return await this._getPipelineRun(runId);
  }

  /**
   * Get all active pipeline runs
   * @returns {Promise<import('../types/index.js').PipelineRun[]>}
   */
  async getActivePipelineRuns() {
    return Array.from(this.activePipelines.values());
  }

  /**
   * Get recent pipeline runs
   * @param {number} limit - Maximum number of runs to return
   * @returns {Promise<import('../types/index.js').PipelineRun[]>}
   */
  async getRecentPipelineRuns(limit = 10) {
    return await this.dataStore.getPipelineRuns({ limit });
  }

  /**
   * Record metrics for a pipeline run
   * @param {string} runId - Pipeline run ID
   * @param {Object} metrics - Metrics payload
   * @returns {Promise<Object>}
   */
  async recordMetrics(runId, metrics) {
    const result = await this.dataStore.saveMetrics(runId, metrics);
    this.lastPipelineActivity = new Date().toISOString();
    return result;
  }

  /**
   * Record an alert generated by monitoring components
   * @param {Object} alert - Alert payload
   * @returns {Object} Normalized alert record
   */
  recordAlert(alert) {
    const normalizedAlert = this._normalizeAlert(alert);

    this.activeAlerts.set(normalizedAlert.id, normalizedAlert);
    this.alertHistory = this.alertHistory.filter(alertItem => alertItem.id !== normalizedAlert.id);
    this.alertHistory.push(normalizedAlert);

    const maxHistory = this.config.alerts?.maxHistory || 1000;
    if (this.alertHistory.length > maxHistory) {
      this.alertHistory.splice(0, this.alertHistory.length - maxHistory);
    }

    return normalizedAlert;
  }

  /**
   * Resolve an active alert
   * @param {string} alertId - Alert identifier
   * @param {string} [resolvedBy='system'] - Resolver identifier
   * @returns {Object|null} Resolved alert
   */
  resolveAlert(alertId, resolvedBy = 'system') {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      return null;
    }

    const resolvedAlert = {
      ...alert,
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
      resolvedBy
    };

    this.activeAlerts.delete(alertId);
    this.alertHistory = this.alertHistory.map(existing =>
      existing.id === alertId ? resolvedAlert : existing
    );

    return resolvedAlert;
  }

  /**
   * Get dashboard-friendly system status snapshot
   * @returns {Promise<Object>} System status payload
   */
  async getSystemStatus() {
    const activeRuns = await this.getActivePipelineRuns();
    const [mostRecentRun] = await this.dataStore.getPipelineRuns({ limit: 1 });

    const successRate = this.metricsSummary.totalRuns
      ? (this.metricsSummary.successfulRuns / this.metricsSummary.totalRuns) * 100
      : 0;

    return {
      running: this.isRunning,
      bootTimestamp: this.bootTimestamp,
      activePipelineCount: activeRuns.length,
      lastPipelineActivity: this.lastPipelineActivity,
      metrics: {
        totalRuns: this.metricsSummary.totalRuns,
        successfulRuns: this.metricsSummary.successfulRuns,
        failedRuns: this.metricsSummary.failedRuns,
        averageDuration: Math.round(this.metricsSummary.averageDuration),
        successRate: Math.round(successRate * 100) / 100
      },
      lastRun: mostRecentRun
        ? {
            id: mostRecentRun.id,
            status: mostRecentRun.status,
            trigger: mostRecentRun.trigger,
            startTime: mostRecentRun.startTime,
            endTime: mostRecentRun.endTime,
            success: mostRecentRun.success
          }
        : null
    };
  }

  /**
   * Get pipeline runs with pagination support
   * @param {Object} [options]
   * @param {number} [options.limit=50]
   * @param {number} [options.offset=0]
   * @param {string} [options.status]
   * @returns {Promise<import('../types/index.js').PipelineRun[]>}
   */
  async getPipelineRuns(options = {}) {
    const { limit = 50, offset = 0, status } = options;
    const fetchLimit = offset ? limit + offset : limit;
    const runs = await this.dataStore.getPipelineRuns({
      limit: fetchLimit,
      status
    });

    if (!offset) {
      return runs;
    }

    return runs.slice(offset, offset + limit);
  }

  /**
   * Aggregate performance metrics for dashboard consumption
   * @param {string} [timeRange='24h'] - Time window (e.g., 24h, 7d)
   * @returns {Promise<Object>} Aggregated metrics
   */
  async getMetrics(timeRange = '24h') {
    const allMetrics = await this.dataStore.getMetrics();
    if (!allMetrics) {
      return {
        timeRange,
        totalRuns: 0,
        averages: {
          buildTime: 0,
          deploymentTime: 0,
          totalPipelineTime: 0
        },
        successRate: 0,
        runs: []
      };
    }

    const windowMs = TestCycleEngine._parseTimeRangeToMs(timeRange);
    const now = Date.now();

    const summaries = Object.entries(allMetrics)
      .map(([runId, metrics]) => ({ runId, metrics }))
      .filter(({ metrics }) => {
        if (!windowMs || !metrics?.timestamp) {
          return true;
        }

        const metricTime = new Date(metrics.timestamp).getTime();
        return now - metricTime <= windowMs;
      })
      .map(({ runId, metrics }) => ({
        runId,
        timestamp: metrics.timestamp || new Date().toISOString(),
        buildTime: metrics.buildTime ?? metrics?.build?.duration ?? 0,
        deploymentTime: metrics.deploymentTime ?? metrics?.deployment?.duration ?? 0,
        totalPipelineTime: metrics.totalPipelineTime ?? metrics?.pipeline?.duration ?? 0,
        success: metrics.success ?? metrics?.pipeline?.success ?? true,
        raw: metrics
      }));

    const totals = summaries.reduce(
      (acc, summary) => {
        acc.buildTime += summary.buildTime;
        acc.deploymentTime += summary.deploymentTime;
        acc.totalPipelineTime += summary.totalPipelineTime;
        if (summary.success) {
          acc.successful += 1;
        }
        return acc;
      },
      { buildTime: 0, deploymentTime: 0, totalPipelineTime: 0, successful: 0 }
    );

    const count = summaries.length || 1;

    return {
      timeRange,
      totalRuns: summaries.length,
      averages: {
        buildTime: Math.round(totals.buildTime / count),
        deploymentTime: Math.round(totals.deploymentTime / count),
        totalPipelineTime: Math.round(totals.totalPipelineTime / count)
      },
      successRate: summaries.length ? Math.round((totals.successful / summaries.length) * 10000) / 100 : 0,
      runs: summaries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    };
  }

  /**
   * Retrieve alerts for dashboards and monitoring
   * @param {Object} [options]
   * @param {'active'|'resolved'|'all'} [options.status='active']
   * @param {number} [options.limit=100]
   * @returns {Promise<Object[]>}
   */
  async getAlerts(options = {}) {
    const { status = 'active', limit = 100 } = options;
    let alerts;

    if (status === 'active') {
      alerts = Array.from(this.activeAlerts.values());
    } else if (status === 'resolved') {
      alerts = this.alertHistory.filter(alert => alert.status === 'resolved');
    } else {
      const combined = new Map(this.alertHistory.map(alert => [alert.id, alert]));
      for (const [alertId, alertRecord] of this.activeAlerts.entries()) {
        combined.set(alertId, alertRecord);
      }
      alerts = Array.from(combined.values());
    }

    alerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return alerts.slice(0, limit);
  }

  /**
   * Generate a monitoring report for a pipeline run
   * @param {string} runId - Pipeline run ID
   * @returns {Promise<Object>} Monitoring report
   */
  async generateReport(runId) {
    try {
      const pipelineRun = await this._getPipelineRun(runId);
      if (!pipelineRun) {
        throw new Error(`Pipeline run not found: ${runId}`);
      }

      const webhookRecords = await this.dataStore.getWebhookRecords(runId);
      const metrics = await this.dataStore.getMetrics(runId);

      return {
        runId,
        summary: {
          status: pipelineRun.status,
          success: pipelineRun.success,
          duration: pipelineRun.duration,
          triggerType: pipelineRun.trigger.type,
          triggerSource: pipelineRun.trigger.source,
          startTime: pipelineRun.startTime,
          endTime: pipelineRun.endTime
        },
        stages: pipelineRun.stages.map(stage => ({
          name: stage.name,
          status: stage.status,
          duration: stage.duration,
          errors: stage.errors
        })),
        errors: pipelineRun.errors,
        webhooks: webhookRecords.length,
        metrics: pipelineRun.metrics,
        detailedMetrics: metrics
      };
    } catch (error) {
      console.error('Failed to generate report:', error.message);
      throw error;
    }
  }

  // Private helper methods

  async _getPipelineRun(runId) {
    // Check active pipelines first
    if (this.activePipelines.has(runId)) {
      return this.activePipelines.get(runId);
    }

    // Check storage
    return await this.dataStore.getPipelineRun(runId);
  }

  async _updatePipelineRun(pipelineRun) {
    // Validate before saving
    const validation = Validators.validatePipelineRun(pipelineRun);
    if (!validation.valid) {
      throw new Error(`Invalid pipeline run: ${validation.errors.join(', ')}`);
    }

    await this.dataStore.savePipelineRun(pipelineRun);
    
    // Update active pipelines if it's there
    if (this.activePipelines.has(pipelineRun.id)) {
      this.activePipelines.set(pipelineRun.id, pipelineRun);
    }
  }

  _normalizeAlert(alert) {
    const normalized = {
      id: alert.id || IdGenerator.generateUuid(),
      type: alert.type || 'generic_alert',
      severity: alert.severity || 'medium',
      message: alert.message || alert.description || '',
      status: alert.status || 'active',
      timestamp: alert.timestamp || new Date().toISOString(),
      context: alert.context || {},
      source: alert.source || 'monitoring-system'
    };

    return normalized;
  }

  _updateMetricsSummary(success, duration) {
    const totalRuns = this.metricsSummary.totalRuns + 1;
    const successfulRuns = this.metricsSummary.successfulRuns + (success ? 1 : 0);
    const failedRuns = this.metricsSummary.failedRuns + (success ? 0 : 1);

    const totalDuration = this.metricsSummary.averageDuration * this.metricsSummary.totalRuns + duration;
    const averageDuration = totalRuns > 0 ? totalDuration / totalRuns : 0;

    this.metricsSummary = {
      totalRuns,
      successfulRuns,
      failedRuns,
      averageDuration
    };
  }

  async _rebuildMetricsSummary() {
    try {
      const runs = await this.dataStore.getPipelineRuns({});
      if (!Array.isArray(runs) || runs.length === 0) {
        this.metricsSummary = {
          totalRuns: 0,
          successfulRuns: 0,
          failedRuns: 0,
          averageDuration: 0
        };
        return;
      }

      const successfulRuns = runs.filter(run => run.success === true).length;
      const failedRuns = runs.filter(run => run.success === false || run.status === 'failed').length;
      const totalDuration = runs.reduce((sum, run) => sum + (run.duration || 0), 0);
      const averageDuration = totalDuration / runs.length;

      this.metricsSummary = {
        totalRuns: runs.length,
        successfulRuns,
        failedRuns,
        averageDuration
      };

      const mostRecent = runs
        .filter(run => run.endTime || run.startTime)
        .sort((a, b) => new Date(b.endTime || b.startTime) - new Date(a.endTime || a.startTime))[0];

      if (mostRecent) {
        this.lastPipelineActivity = mostRecent.endTime || mostRecent.startTime;
      }
    } catch (error) {
      console.error('Failed to rebuild metrics summary:', error.message);
    }
  }

  static _parseTimeRangeToMs(timeRange) {
    if (typeof timeRange !== 'string') {
      return null;
    }

    const trimmed = timeRange.trim();
    if (trimmed === '' || trimmed.toLowerCase() === 'all') {
      return null;
    }

    const match = trimmed.match(/^(\d+)([smhdw])$/i);
    if (!match) {
      return null;
    }

    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const multipliers = {
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
      w: 604_800_000
    };

    return value * (multipliers[unit] || 0) || null;
  }

  async _performPeriodicTasks() {
    try {
      // Check for stale pipeline runs (running for too long)
      const timeout = this.config.monitoring?.timeout || 300000; // 5 minutes
      const now = Date.now();

      for (const [runId, pipelineRun] of this.activePipelines) {
        const startTime = new Date(pipelineRun.startTime).getTime();
        if (now - startTime > timeout) {
          console.log(`Pipeline run ${runId} timed out after ${timeout}ms`);
          await this.completePipelineRun(runId, false, { 
            errorRate: 100,
            successRate: 0 
          });
          await this.addError(runId, 'system', 'timeout', 'Pipeline run exceeded maximum duration');
        }
      }

      // Perform data cleanup if configured
      const cleanupInterval = this.config.storage?.cleanupInterval || 86400000; // 24 hours
      const lastCleanup = this.config._lastCleanup || 0;
      
      if (now - lastCleanup > cleanupInterval) {
        const maxRecords = this.config.storage?.maxRecords || 1000;
        await this.dataStore.cleanup(maxRecords);
        this.config._lastCleanup = now;
        await this.dataStore.saveConfig(this.config);
      }
    } catch (error) {
      console.error('Error in periodic tasks:', error.message);
    }
  }
}