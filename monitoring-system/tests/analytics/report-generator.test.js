import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestCycleEngine } from '../../src/core/test-cycle-engine.js';
import {
  createPipelineRunFixture,
  createWebhookRecordFixture,
  createMetricsFixture
} from '../fixtures/sample-data.js';

describe('TestCycleEngine reporting', () => {
  let engine;
  let dataStoreMock;

  beforeEach(() => {
    engine = new TestCycleEngine({ dataDir: './test-data/report-generator' });
    dataStoreMock = {
      getPipelineRun: vi.fn(),
      getWebhookRecords: vi.fn(),
      getMetrics: vi.fn(),
      savePipelineRun: vi.fn()
    };
    engine.dataStore = dataStoreMock;
    engine.activePipelines.clear();
  });

  it('formats pipeline runs, stages, and metrics into a monitoring report', async () => {
    const pipelineRun = createPipelineRunFixture();
    const webhookRecord = createWebhookRecordFixture({ runId: pipelineRun.id });
    const detailedMetrics = createMetricsFixture();

    engine.activePipelines.set(pipelineRun.id, pipelineRun);
    dataStoreMock.getWebhookRecords.mockResolvedValue([webhookRecord]);
    dataStoreMock.getMetrics.mockResolvedValue({ ...detailedMetrics, timestamp: '2025-01-01T00:10:00Z' });

    const report = await engine.generateReport(pipelineRun.id);

    expect(report.summary).toMatchObject({
      status: pipelineRun.status,
      success: pipelineRun.success,
      duration: pipelineRun.duration,
      triggerType: pipelineRun.trigger.type,
      triggerSource: pipelineRun.trigger.source
    });
    expect(report.stages).toHaveLength(pipelineRun.stages.length);
    expect(report.errors).toEqual(pipelineRun.errors);
    expect(report.webhooks).toBe(1);
    expect(report.metrics).toEqual(pipelineRun.metrics);
    expect(report.detailedMetrics).toMatchObject({
      buildTime: detailedMetrics.buildTime,
      deploymentTime: detailedMetrics.deploymentTime,
      timestamp: expect.any(String)
    });
  });

  it('throws an error when the requested pipeline run is missing', async () => {
    dataStoreMock.getPipelineRun.mockResolvedValue(null);

    await expect(engine.generateReport('missing-run')).rejects.toThrow(/Pipeline run not found/);
  });
});
