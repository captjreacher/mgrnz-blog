import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { TestCycleEngine } from '../../src/core/test-cycle-engine.js';

describe('TestCycleEngine', () => {
  let engine;
  const testDataDir = './test-data/engine-test';

  beforeEach(async () => {
    engine = new TestCycleEngine({ dataDir: testDataDir });
    await engine.initialize();
  });

  afterEach(async () => {
    await engine.stopMonitoring();
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      expect(engine.isRunning).toBe(false);
      expect(engine.activePipelines).toBeInstanceOf(Map);
      expect(engine.activePipelines.size).toBe(0);
    });
  });

  describe('monitoring lifecycle', () => {
    it('should start and stop monitoring', async () => {
      await engine.startMonitoring();
      expect(engine.isRunning).toBe(true);
      expect(engine.monitoringInterval).toBeDefined();

      await engine.stopMonitoring();
      expect(engine.isRunning).toBe(false);
      expect(engine.monitoringInterval).toBeNull();
    });

    it('should not start monitoring if already running', async () => {
      await engine.startMonitoring();
      const firstInterval = engine.monitoringInterval;
      
      await engine.startMonitoring(); // Should not change anything
      expect(engine.monitoringInterval).toBe(firstInterval);
    });
  });

  describe('pipeline run management', () => {
    it('should create a new pipeline run', async () => {
      const trigger = {
        type: 'webhook',
        source: 'mailerlite',
        timestamp: new Date().toISOString(),
        metadata: { campaign: 'test' }
      };

      const runId = await engine.createPipelineRun(trigger);
      
      expect(runId).toMatch(/^run_\d{8}_\d{6}_[a-f0-9]{8}$/);
      expect(engine.activePipelines.has(runId)).toBe(true);

      const pipelineRun = await engine.getPipelineRun(runId);
      expect(pipelineRun).toBeDefined();
      expect(pipelineRun.trigger).toEqual(trigger);
      expect(pipelineRun.status).toBe('running');
    });

    it('should reject invalid trigger events', async () => {
      const invalidTrigger = {
        type: 'invalid',
        source: 'test'
        // Missing timestamp
      };

      await expect(engine.createPipelineRun(invalidTrigger)).rejects.toThrow();
    });

    it('should update pipeline stages', async () => {
      const trigger = {
        type: 'webhook',
        source: 'mailerlite',
        timestamp: new Date().toISOString(),
        metadata: {}
      };

      const runId = await engine.createPipelineRun(trigger);
      
      await engine.updatePipelineStage(runId, 'webhook_received', 'running', { payload: 'test' });
      await engine.updatePipelineStage(runId, 'webhook_received', 'completed', { result: 'success' });

      const pipelineRun = await engine.getPipelineRun(runId);
      expect(pipelineRun.stages).toHaveLength(1);
      
      const stage = pipelineRun.stages[0];
      expect(stage.name).toBe('webhook_received');
      expect(stage.status).toBe('completed');
      expect(stage.data.payload).toBe('test');
      expect(stage.data.result).toBe('success');
      expect(stage.startTime).toBeDefined();
      expect(stage.endTime).toBeDefined();
      expect(stage.duration).toBeGreaterThan(0);
    });

    it('should complete a pipeline run successfully', async () => {
      const trigger = {
        type: 'webhook',
        source: 'mailerlite',
        timestamp: new Date().toISOString(),
        metadata: {}
      };

      const runId = await engine.createPipelineRun(trigger);
      
      const metrics = {
        webhookLatency: 100,
        buildTime: 5000,
        deploymentTime: 3000
      };

      await engine.completePipelineRun(runId, true, metrics);

      const pipelineRun = await engine.getPipelineRun(runId);
      expect(pipelineRun.status).toBe('completed');
      expect(pipelineRun.success).toBe(true);
      expect(pipelineRun.endTime).toBeDefined();
      expect(pipelineRun.duration).toBeGreaterThan(0);
      expect(pipelineRun.metrics.webhookLatency).toBe(100);
      
      // Should be removed from active pipelines
      expect(engine.activePipelines.has(runId)).toBe(false);
    });

    it('should add errors to pipeline runs', async () => {
      const trigger = {
        type: 'webhook',
        source: 'mailerlite',
        timestamp: new Date().toISOString(),
        metadata: {}
      };

      const runId = await engine.createPipelineRun(trigger);
      
      await engine.addError(runId, 'webhook_processing', 'validation_error', 'Invalid payload format', { field: 'email' });

      const pipelineRun = await engine.getPipelineRun(runId);
      expect(pipelineRun.errors).toHaveLength(1);
      
      const error = pipelineRun.errors[0];
      expect(error.stage).toBe('webhook_processing');
      expect(error.type).toBe('validation_error');
      expect(error.message).toBe('Invalid payload format');
      expect(error.context.field).toBe('email');
      expect(error.id).toMatch(/^error_[a-f0-9]{10}$/);
    });

    it('should generate monitoring reports', async () => {
      const trigger = {
        type: 'webhook',
        source: 'mailerlite',
        timestamp: new Date().toISOString(),
        metadata: {}
      };

      const runId = await engine.createPipelineRun(trigger);
      await engine.updatePipelineStage(runId, 'webhook_received', 'completed');
      await engine.addError(runId, 'build', 'timeout', 'Build took too long');
      await engine.completePipelineRun(runId, false);

      const report = await engine.generateReport(runId);
      
      expect(report.runId).toBe(runId);
      expect(report.summary.status).toBe('failed');
      expect(report.summary.success).toBe(false);
      expect(report.summary.triggerType).toBe('webhook');
      expect(report.stages).toHaveLength(1);
      expect(report.errors).toHaveLength(1);
      expect(report.metrics).toBeDefined();
    });
  });

  describe('pipeline run queries', () => {
    it('should get active pipeline runs', async () => {
      const trigger1 = { type: 'webhook', source: 'test1', timestamp: new Date().toISOString(), metadata: {} };
      const trigger2 = { type: 'git', source: 'test2', timestamp: new Date().toISOString(), metadata: {} };

      const runId1 = await engine.createPipelineRun(trigger1);
      const runId2 = await engine.createPipelineRun(trigger2);

      const activeRuns = await engine.getActivePipelineRuns();
      expect(activeRuns).toHaveLength(2);
      
      const runIds = activeRuns.map(run => run.id);
      expect(runIds).toContain(runId1);
      expect(runIds).toContain(runId2);
    });

    it('should get recent pipeline runs', async () => {
      const trigger = { type: 'webhook', source: 'test', timestamp: new Date().toISOString(), metadata: {} };
      
      const runId1 = await engine.createPipelineRun(trigger);
      const runId2 = await engine.createPipelineRun(trigger);
      
      await engine.completePipelineRun(runId1, true);
      await engine.completePipelineRun(runId2, true);

      const recentRuns = await engine.getRecentPipelineRuns(5);
      expect(recentRuns.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('error handling', () => {
    it('should handle non-existent pipeline run', async () => {
      await expect(engine.updatePipelineStage('non-existent', 'test', 'running')).rejects.toThrow('Pipeline run not found');
      await expect(engine.completePipelineRun('non-existent', true)).rejects.toThrow('Pipeline run not found');
      await expect(engine.addError('non-existent', 'test', 'error', 'message')).rejects.toThrow('Pipeline run not found');
    });

    it('should handle invalid pipeline run data', async () => {
      const invalidTrigger = {
        type: 'webhook',
        source: 'test',
        timestamp: 'invalid-date',
        metadata: {}
      };

      await expect(engine.createPipelineRun(invalidTrigger)).rejects.toThrow();
    });
  });
});