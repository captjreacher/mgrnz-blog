import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { DataStore } from '../../src/storage/data-store.js';
import { IdGenerator } from '../../src/utils/id-generator.js';

describe('DataStore', () => {
  let dataStore;
  const testDataDir = './test-data/data-store-test';

  beforeEach(async () => {
    dataStore = new DataStore(testDataDir);
    await dataStore.initialize();
  });

  afterEach(async () => {
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('initialization', () => {
    it('should create data directory and files', async () => {
      const stats = await fs.stat(testDataDir);
      expect(stats.isDirectory()).toBe(true);

      // Check that data files exist
      await fs.access(dataStore.pipelineRunsFile);
      await fs.access(dataStore.webhookRecordsFile);
      await fs.access(dataStore.metricsFile);
      await fs.access(dataStore.configFile);
    });

    it('should initialize with empty data structures', async () => {
      const runs = await dataStore.getPipelineRuns();
      expect(runs).toEqual([]);

      const config = await dataStore.getConfig();
      expect(config).toHaveProperty('monitoring');
      expect(config).toHaveProperty('endpoints');
    });
  });

  describe('pipeline run operations', () => {
    it('should save and retrieve a pipeline run', async () => {
      const pipelineRun = {
        id: IdGenerator.generatePipelineRunId(),
        trigger: {
          type: 'webhook',
          source: 'mailerlite',
          timestamp: new Date().toISOString(),
          metadata: {}
        },
        stages: [],
        status: 'running',
        startTime: new Date().toISOString(),
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

      await dataStore.savePipelineRun(pipelineRun);
      const retrieved = await dataStore.getPipelineRun(pipelineRun.id);
      
      expect(retrieved).toEqual(pipelineRun);
    });

    it('should update existing pipeline run', async () => {
      const pipelineRun = {
        id: IdGenerator.generatePipelineRunId(),
        trigger: {
          type: 'webhook',
          source: 'mailerlite',
          timestamp: new Date().toISOString(),
          metadata: {}
        },
        stages: [],
        status: 'running',
        startTime: new Date().toISOString(),
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

      await dataStore.savePipelineRun(pipelineRun);
      
      // Update the run
      pipelineRun.status = 'completed';
      pipelineRun.success = true;
      await dataStore.savePipelineRun(pipelineRun);

      const retrieved = await dataStore.getPipelineRun(pipelineRun.id);
      expect(retrieved.status).toBe('completed');
      expect(retrieved.success).toBe(true);
    });

    it('should filter pipeline runs by status', async () => {
      const runningRun = {
        id: IdGenerator.generatePipelineRunId(),
        trigger: { type: 'webhook', source: 'test', timestamp: new Date().toISOString(), metadata: {} },
        stages: [],
        status: 'running',
        startTime: new Date().toISOString(),
        success: false,
        errors: [],
        metrics: { webhookLatency: 0, buildTime: 0, deploymentTime: 0, siteResponseTime: 0, totalPipelineTime: 0, errorRate: 0, successRate: 0, throughput: 0 }
      };

      const completedRun = {
        id: IdGenerator.generatePipelineRunId(),
        trigger: { type: 'webhook', source: 'test', timestamp: new Date().toISOString(), metadata: {} },
        stages: [],
        status: 'completed',
        startTime: new Date().toISOString(),
        success: true,
        errors: [],
        metrics: { webhookLatency: 0, buildTime: 0, deploymentTime: 0, siteResponseTime: 0, totalPipelineTime: 0, errorRate: 0, successRate: 0, throughput: 0 }
      };

      await dataStore.savePipelineRun(runningRun);
      await dataStore.savePipelineRun(completedRun);

      const runningRuns = await dataStore.getPipelineRuns({ status: 'running' });
      expect(runningRuns).toHaveLength(1);
      expect(runningRuns[0].id).toBe(runningRun.id);

      const completedRuns = await dataStore.getPipelineRuns({ status: 'completed' });
      expect(completedRuns).toHaveLength(1);
      expect(completedRuns[0].id).toBe(completedRun.id);
    });
  });

  describe('webhook record operations', () => {
    it('should save and retrieve webhook records', async () => {
      const runId = IdGenerator.generatePipelineRunId();
      const webhookRecord = {
        id: IdGenerator.generateWebhookId(),
        runId,
        source: 'mailerlite',
        destination: 'supabase',
        payload: { test: 'data' },
        response: {
          status: 200,
          body: { success: true },
          headers: {}
        },
        timing: {
          sent: new Date().toISOString(),
          received: new Date().toISOString(),
          processed: new Date().toISOString()
        },
        authentication: {
          method: 'token',
          success: true
        },
        retries: []
      };

      await dataStore.saveWebhookRecord(webhookRecord);
      const records = await dataStore.getWebhookRecords(runId);
      
      expect(records).toHaveLength(1);
      expect(records[0]).toEqual(webhookRecord);
    });
  });

  describe('metrics operations', () => {
    it('should save and retrieve metrics', async () => {
      const runId = IdGenerator.generatePipelineRunId();
      const metrics = {
        webhookLatency: 100,
        buildTime: 5000,
        deploymentTime: 3000,
        siteResponseTime: 200,
        totalPipelineTime: 8300,
        errorRate: 0,
        successRate: 100,
        throughput: 1
      };

      await dataStore.saveMetrics(runId, metrics);
      const retrieved = await dataStore.getMetrics(runId);
      
      expect(retrieved).toMatchObject(metrics);
      expect(retrieved).toHaveProperty('timestamp');
    });
  });

  describe('configuration operations', () => {
    it('should save and retrieve configuration', async () => {
      const config = {
        monitoring: {
          interval: 60000,
          timeout: 600000,
          retryAttempts: 5
        },
        custom: {
          setting: 'value'
        }
      };

      await dataStore.saveConfig(config);
      const retrieved = await dataStore.getConfig();
      
      expect(retrieved).toMatchObject(config);
    });
  });

  describe('cleanup operations', () => {
    it('should cleanup old records when limit exceeded', async () => {
      // Create multiple pipeline runs
      const runs = [];
      for (let i = 0; i < 5; i++) {
        const run = {
          id: IdGenerator.generatePipelineRunId(),
          trigger: { type: 'webhook', source: 'test', timestamp: new Date(Date.now() - i * 1000).toISOString(), metadata: {} },
          stages: [],
          status: 'completed',
          startTime: new Date(Date.now() - i * 1000).toISOString(),
          success: true,
          errors: [],
          metrics: { webhookLatency: 0, buildTime: 0, deploymentTime: 0, siteResponseTime: 0, totalPipelineTime: 0, errorRate: 0, successRate: 0, throughput: 0 }
        };
        runs.push(run);
        await dataStore.savePipelineRun(run);
      }

      // Cleanup to keep only 3 records
      await dataStore.cleanup(3);

      const remainingRuns = await dataStore.getPipelineRuns();
      expect(remainingRuns).toHaveLength(3);
    });
  });
});