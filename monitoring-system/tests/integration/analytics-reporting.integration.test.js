import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TestCycleEngine } from '../../src/core/test-cycle-engine.js';
import { WorkflowPerformanceAnalyzer } from '../../src/monitors/workflow-performance-analyzer.js';
import {
  createWorkflowRunFixture,
  createJobsFixture,
  createBuildAnalysisFixture,
  createMetricsFixture,
  createWebhookRecordFixture
} from '../fixtures/sample-data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Analytics and reporting integration', () => {
  const testDataDir = path.join(__dirname, '../..', 'test-data', 'analytics-reporting');

  beforeEach(async () => {
    await fs.rm(testDataDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(testDataDir, { recursive: true, force: true });
  });

  it('ingests historical workflow data and exports consolidated reports', async () => {
    const engine = new TestCycleEngine({ dataDir: testDataDir });
    await engine.initialize();

    const trigger = {
      type: 'webhook',
      source: 'github',
      timestamp: '2025-01-01T00:00:00.000Z',
      metadata: { branch: 'main' }
    };

    const runId = await engine.createPipelineRun(trigger);

    await engine.updatePipelineStage(runId, 'build', 'completed', { duration: 180000, steps: 12 });
    await engine.updatePipelineStage(runId, 'deploy', 'completed', { duration: 120000, provider: 'pages' });

    const metricsRecord = createMetricsFixture({ totalPipelineTime: 360000 });
    await engine.dataStore.saveMetrics(runId, metricsRecord);
    await engine.dataStore.saveWebhookRecord(createWebhookRecordFixture({ runId }));

    await engine.completePipelineRun(runId, true, {
      buildTime: metricsRecord.buildTime,
      deploymentTime: metricsRecord.deploymentTime,
      webhookLatency: metricsRecord.webhookLatency,
      siteResponseTime: metricsRecord.siteResponseTime,
      throughput: metricsRecord.throughput
    });

    const workflowRun = createWorkflowRunFixture({ id: 555, created_at: '2025-01-01T00:00:00.000Z', run_started_at: '2025-01-01T00:01:00.000Z', updated_at: '2025-01-01T00:07:00.000Z' });
    const jobs = createJobsFixture();
    const buildAnalysis = createBuildAnalysisFixture({ totalBuildTime: metricsRecord.buildTime, totalDeploymentTime: metricsRecord.deploymentTime });

    const analyzer = new WorkflowPerformanceAnalyzer(engine, {});
    const analyticsResult = await analyzer.analyzeWorkflowPerformance(runId, workflowRun, jobs, buildAnalysis);
    const trends = analyzer.getPerformanceTrends(30);

    expect(trends.totalRuns).toBe(1);
    expect(trends.averageDuration).toBe(analyticsResult.performanceMetrics.totalPipelineTime);
    expect(trends.successRate).toBe(1);

    const report = await engine.generateReport(runId);

    expect(report.summary).toMatchObject({
      status: 'completed',
      success: true,
      triggerType: trigger.type,
      triggerSource: trigger.source
    });
    expect(report.webhooks).toBe(1);
    expect(report.metrics.totalPipelineTime).toBeGreaterThan(0);
    expect(report.detailedMetrics).toMatchObject({
      buildTime: metricsRecord.buildTime,
      deploymentTime: metricsRecord.deploymentTime,
      timestamp: expect.any(String)
    });

    const stageNames = report.stages.map(stage => stage.name);
    expect(stageNames).toEqual(expect.arrayContaining([
      'build',
      'deploy',
      'performance_analysis_started',
      'performance_analysis_completed'
    ]));
  });
});
