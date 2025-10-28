import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestCycleEngine } from '../../src/core/test-cycle-engine.js';
import {
  samplePipelineRun,
  sampleWebhookRecords,
  createMetricsFixture
} from '../fixtures/analytics-fixtures.js';

describe('TestCycleEngine report generation', () => {
  let engine;

  beforeEach(() => {
    engine = new TestCycleEngine({});
    engine.activePipelines.clear();
    engine.dataStore = {
      getPipelineRun: vi.fn(),
      getWebhookRecords: vi.fn(),
      getMetrics: vi.fn()
    };
  });

  it('should format a detailed monitoring report for a pipeline run', async () => {
    const pipelineRun = JSON.parse(JSON.stringify(samplePipelineRun));
    const webhookRecords = sampleWebhookRecords.map(record => ({ ...record }));
    const detailedMetrics = { ...createMetricsFixture(), timestamp: '2025-10-26T10:12:00Z' };

    engine.activePipelines.set(pipelineRun.id, pipelineRun);
    engine.dataStore.getPipelineRun.mockResolvedValue(pipelineRun);
    engine.dataStore.getWebhookRecords.mockResolvedValue(webhookRecords);
    engine.dataStore.getMetrics.mockResolvedValue(detailedMetrics);

    const report = await engine.generateReport(pipelineRun.id);

    expect(report.runId).toBe(pipelineRun.id);
    expect(report.summary).toEqual({
      status: pipelineRun.status,
      success: pipelineRun.success,
      duration: pipelineRun.duration,
      triggerType: pipelineRun.trigger.type,
      triggerSource: pipelineRun.trigger.source,
      startTime: pipelineRun.startTime,
      endTime: pipelineRun.endTime
    });

    expect(report.stages).toEqual(
      pipelineRun.stages.map(stage => ({
        name: stage.name,
        status: stage.status,
        duration: stage.duration,
        errors: stage.errors
      }))
    );
    expect(report.errors).toEqual(pipelineRun.errors);
    expect(report.webhooks).toBe(webhookRecords.length);
    expect(report.metrics).toEqual(pipelineRun.metrics);
    expect(report.detailedMetrics).toEqual(detailedMetrics);
  });

  it('should throw an error when the pipeline run cannot be found', async () => {
    engine.dataStore.getPipelineRun.mockResolvedValue(null);
    engine.dataStore.getWebhookRecords.mockResolvedValue([]);
    engine.dataStore.getMetrics.mockResolvedValue({});

    await expect(engine.generateReport('missing-run')).rejects.toThrow('Pipeline run not found: missing-run');
    expect(engine.dataStore.getPipelineRun).toHaveBeenCalledWith('missing-run');
  });
});
