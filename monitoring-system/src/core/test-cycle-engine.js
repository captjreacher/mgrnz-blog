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
    this.alertManager = options.alertManager || config.alertManager || null;
    this._alertWrapInitialized = false;
    this._originalSaveWebhookRecord = this.dataStore.saveWebhookRecord.bind(this.dataStore);

    this._wrapDataStoreForAlerts();
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

      this._wrapDataStoreForAlerts();

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
  }  /**
  
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

  setAlertManager(alertManager) {
    this.alertManager = alertManager;
    this._alertWrapInitialized = false;
    this._wrapDataStoreForAlerts();
  }

  async _evaluatePipelineAlerts(pipelineRun) {
    if (!this.alertManager || !pipelineRun) {
      return;
    }

    try {
      await this.alertManager.checkAlerts(pipelineRun);
    } catch (error) {
      console.error('Failed to evaluate pipeline alerts:', error.message);
    }
  }

  _wrapDataStoreForAlerts() {
    if (!this.alertManager || !this.dataStore || this._alertWrapInitialized) {
      return;
    }

    this.dataStore.saveWebhookRecord = async (webhookRecord) => {
      const savedRecord = await this._originalSaveWebhookRecord(webhookRecord);
      try {
        await this.alertManager.checkWebhookAlerts(savedRecord);
      } catch (error) {
        console.error('Failed to process webhook alerts:', error.message);
      }
      return savedRecord;
    };

    this._alertWrapInitialized = true;
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