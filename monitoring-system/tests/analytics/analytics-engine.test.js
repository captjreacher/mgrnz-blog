import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { AnalyticsEngine } from '../../src/analytics/analytics-engine.js';
import { AnalyticsStore } from '../../src/storage/analytics-store.js';
import { DataStore } from '../../src/storage/data-store.js';

const testDataDir = path.join('.', 'test-data', 'analytics-engine');

const createStage = (name, status, duration) => ({
  name,
  status,
  data: {},
  errors: [],
  duration,
  startTime: new Date().toISOString(),
  endTime: new Date().toISOString()
});

describe('AnalyticsEngine', () => {
  let dataStore;
  let analyticsStore;
  let analyticsEngine;

  beforeEach(async () => {
    dataStore = new DataStore(testDataDir);
    analyticsStore = new AnalyticsStore(testDataDir);
    analyticsEngine = new AnalyticsEngine({
      dataStore,
      analyticsStore,
      dataDir: testDataDir,
      config: { snapshotRetention: 5 }
    });

    await dataStore.initialize();
    await analyticsEngine.initialize();
  });

  afterEach(async () => {
    await fs.rm(testDataDir, { recursive: true, force: true });
  });

  it('computes success metrics, bottlenecks, and anomalies for stored runs', async () => {
    const now = Date.now();
    const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

    const successfulRun = {
      id: 'run-success',
      trigger: { type: 'webhook', source: 'mailerlite' },
      stages: [createStage('build', 'completed', 400), createStage('deploy', 'completed', 800)],
      status: 'completed',
      startTime: tenDaysAgo,
      endTime: new Date(now - 10 * 24 * 60 * 60 * 1000 + 1200).toISOString(),
      duration: 1200,
      success: true,
      errors: [],
      metrics: {
        webhookLatency: 200,
        buildTime: 400,
        deploymentTime: 800,
        siteResponseTime: 900,
        totalPipelineTime: 1200,
        errorRate: 0,
        successRate: 100,
        throughput: 2
      }
    };

    const failedRun = {
      id: 'run-failed',
      trigger: { type: 'manual', source: 'operator' },
      stages: [createStage('build', 'completed', 600), createStage('deploy', 'failed', 4600)],
      status: 'failed',
      startTime: oneDayAgo,
      endTime: new Date(now - 24 * 60 * 60 * 1000 + 5200).toISOString(),
      duration: 5200,
      success: false,
      errors: [
        {
          id: 'error-1',
          stage: 'deploy',
          type: 'timeout',
          message: 'Deployment timed out',
          timestamp: new Date().toISOString()
        }
      ],
      metrics: {
        webhookLatency: 250,
        buildTime: 600,
        deploymentTime: 4600,
        siteResponseTime: 950,
        totalPipelineTime: 5200,
        errorRate: 50,
        successRate: 50,
        throughput: 1
      }
    };

    await dataStore.savePipelineRun(successfulRun);
    await dataStore.savePipelineRun(failedRun);
    await dataStore.saveMetrics(successfulRun.id, successfulRun.metrics);
    await dataStore.saveMetrics(failedRun.id, failedRun.metrics);

    const snapshot = await analyticsEngine.updateAfterRun(failedRun);

    expect(snapshot.totals.totalRuns).toBe(2);
    expect(snapshot.successMetrics.overall.successRate).toBe(50);
    expect(snapshot.successMetrics.rolling.last7Days.totalRuns).toBe(1);
    expect(snapshot.successMetrics.byTrigger.webhook.successRate).toBe(100);
    expect(snapshot.successMetrics.byTrigger.manual.failureCount).toBe(1);

    const [slowestStage] = snapshot.bottlenecks.slowestStages;
    expect(slowestStage.name).toBe('deploy');
    expect(slowestStage.averageDuration).toBeGreaterThan(slowestStage.runCount === 0 ? 0 : 1000);

    expect(snapshot.anomalies.pipelineDuration.anomalies).toEqual([
      expect.objectContaining({ runId: 'run-failed' })
    ]);

    const aggregated = await analyticsStore.getAggregates();
    expect(aggregated.successMetrics.overall.successRate).toBe(50);
    expect(aggregated.bottlenecks.slowestStages[0].name).toBe('deploy');
    expect(aggregated.anomalies.pipelineDuration.anomalies[0].runId).toBe('run-failed');

    const snapshots = await analyticsStore.getSnapshots();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].latestRun.id).toBe('run-failed');
  });
});
