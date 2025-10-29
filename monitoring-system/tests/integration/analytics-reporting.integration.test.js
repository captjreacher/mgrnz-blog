import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { TestCycleEngine } from '../../src/core/test-cycle-engine.js';
import { WorkflowPerformanceAnalyzer } from '../../src/monitors/workflow-performance-analyzer.js';
import {
  samplePipelineRun,
  sampleWebhookRecords,
  createMetricsFixture,
  createAnalyticsResultFromRun
} from '../fixtures/analytics-fixtures.js';

describe('Analytics and reporting integration flows', () => {
  let tempDir;
  let engine;
  let analyzer;

  beforeEach(async () => {
    const baseDir = path.join(process.cwd(), 'test-data');
    await fs.mkdir(baseDir, { recursive: true });
    tempDir = await fs.mkdtemp(path.join(baseDir, 'analytics-'));

    engine = new TestCycleEngine({ dataDir: tempDir });
    await engine.initialize();

    analyzer = new WorkflowPerformanceAnalyzer(engine, {});
  });

  afterEach(async () => {
    if (engine?.isRunning) {
      await engine.stopMonitoring();
    }

    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should ingest historical pipeline data and export analytics reports', async () => {
    const run1 = JSON.parse(JSON.stringify(samplePipelineRun));
    run1.id = 'run-history-1';
    run1.startTime = '2025-10-25T10:00:00Z';
    run1.endTime = '2025-10-25T10:12:00Z';
    run1.duration = 720_000;
    run1.success = true;
    run1.status = 'completed';
    run1.metrics = createMetricsFixture({
      totalPipelineTime: 720_000,
      buildTime: 360_000,
      deploymentTime: 270_000,
      successRate: 96,
      errorRate: 4,
      throughput: 1.25
    });

    const run2 = JSON.parse(JSON.stringify(samplePipelineRun));
    run2.id = 'run-history-2';
    run2.startTime = '2025-10-27T11:00:00Z';
    run2.endTime = '2025-10-27T11:18:00Z';
    run2.duration = 1_080_000;
    run2.success = false;
    run2.status = 'failed';
    run2.stages = run2.stages.map(stage =>
      stage.name === 'deploy'
        ? { ...stage, status: 'failed', errors: ['Deployment timeout'] }
        : stage
    );
    run2.errors = [
      {
        id: 'err-run2',
        stage: 'deploy',
        type: 'failure',
        message: 'Deployment timed out',
        timestamp: '2025-10-27T11:16:00Z',
        context: { region: 'us-east-1' }
      }
    ];
    run2.metrics = createMetricsFixture({
      totalPipelineTime: 1_080_000,
      buildTime: 420_000,
      deploymentTime: 360_000,
      successRate: 60,
      errorRate: 25,
      throughput: 0.75
    });

    await engine.dataStore.savePipelineRun(run1);
    await engine.dataStore.savePipelineRun(run2);

    const run1Webhooks = sampleWebhookRecords.map(record => ({
      ...record,
      runId: run1.id
    }));
    const run2Webhooks = [
      {
        id: 'webhook-3',
        runId: run2.id,
        source: 'github',
        destination: 'supabase',
        payload: { event: 'deployment', status: 'failed' },
        response: { status: 500, body: 'error', headers: {} },
        timing: {
          sent: '2025-10-27T11:05:00Z',
          received: '2025-10-27T11:05:01Z',
          processed: '2025-10-27T11:05:05Z'
        },
        authentication: { method: 'signature', success: true },
        retries: [
          { attempt: 1, timestamp: '2025-10-27T11:05:30Z', reason: 'retry', success: false }
        ]
      }
    ];

    for (const record of [...run1Webhooks, ...run2Webhooks]) {
      await engine.dataStore.saveWebhookRecord(record);
    }

    await engine.dataStore.saveMetrics(run1.id, createMetricsFixture({
      totalPipelineTime: 720_000,
      buildTime: 360_000,
      deploymentTime: 270_000,
      successRate: 96,
      errorRate: 4,
      throughput: 1.25
    }));
    await engine.dataStore.saveMetrics(run2.id, createMetricsFixture({
      totalPipelineTime: 1_080_000,
      buildTime: 420_000,
      deploymentTime: 360_000,
      successRate: 60,
      errorRate: 25,
      throughput: 0.75
    }));

    analyzer._storeHistoricalData(run1.id, createAnalyticsResultFromRun(run1));
    analyzer._storeHistoricalData(run2.id, createAnalyticsResultFromRun(run2, {
      deploymentTracking: { success: false, failures: ['deploy'] },
      bottleneckAnalysis: {
        criticalPath: ['build', 'test', 'deploy'],
        bottlenecks: [
          { type: 'phase', stage: 'build', duration: run2.metrics.buildTime },
          { type: 'phase', stage: 'test', duration: 180_000 }
        ]
      },
      overallScore: 68
    }));

    const trends = analyzer.getPerformanceTrends(30);
    expect(trends.totalRuns).toBe(2);
    expect(trends.averageDuration).toBeCloseTo((run1.metrics.totalPipelineTime + run2.metrics.totalPipelineTime) / 2, 5);
    expect(trends.successRate).toBeCloseTo(0.5, 5);

    const bottlenecks = analyzer.identifyCommonBottlenecks();
    expect(bottlenecks[0]).toMatchObject({ bottleneck: 'phase_build', frequency: 2 });
    expect(bottlenecks.find(item => item.bottleneck === 'phase_test')?.frequency).toBe(1);

    const pipelineRuns = await engine.dataStore.getPipelineRuns({ limit: 2 });
    expect(pipelineRuns.map(run => run.id)).toEqual(['run-history-2', 'run-history-1']);

    const report = await engine.generateReport(run1.id);
    expect(report.webhooks).toBe(run1Webhooks.length);
    expect(report.metrics.totalPipelineTime).toBe(run1.metrics.totalPipelineTime);
    expect(report.detailedMetrics.totalPipelineTime).toBe(run1.metrics.totalPipelineTime);
    expect(report.detailedMetrics.timestamp).toBeTruthy();

    const storedMetrics = await engine.dataStore.getMetrics();
    expect(storedMetrics[run1.id].successRate).toBe(96);
    expect(storedMetrics[run2.id].totalPipelineTime).toBe(1_080_000);
  });
});
