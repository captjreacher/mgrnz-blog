import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { TestCycleEngine } from '../../src/core/test-cycle-engine.js';
import { TriggerMonitor } from '../../src/monitors/trigger-monitor.js';
import { DashboardServer } from '../../src/dashboard/dashboard-server.js';
import { pipelineFixtures } from './fixtures/pipeline-fixtures.js';

const testDataDir = path.resolve('./test-data/e2e-monitoring');

const createMockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('End-to-end monitoring flows', () => {
  let engine;
  let triggerMonitor;
  let dashboardServer;
  let alertStore;

  const runPipelineFixture = async (fixture) => {
    vi.setSystemTime(new Date(fixture.trigger.timestamp));
    const runId = await triggerMonitor.detectTrigger(
      fixture.trigger.type,
      fixture.trigger.source,
      fixture.trigger.metadata
    );

    for (const stage of fixture.stages) {
      for (const update of stage.updates) {
        vi.setSystemTime(new Date(update.at));
        await engine.updatePipelineStage(runId, stage.name, update.status, update.data);
      }
    }

    if (fixture.errors) {
      for (const error of fixture.errors) {
        const stage = fixture.stages.find(s => s.name === error.stage);
        let errorTimestamp = fixture.completion.at;
        if (stage) {
          for (let i = stage.updates.length - 1; i >= 0; i -= 1) {
            if (stage.updates[i].status === 'failed') {
              errorTimestamp = stage.updates[i].at;
              break;
            }
          }
        }
        vi.setSystemTime(new Date(errorTimestamp));
        await engine.addError(runId, error.stage, error.type, error.message, error.context);
      }
    }

    vi.setSystemTime(new Date(fixture.completion.at));
    await engine.completePipelineRun(runId, fixture.completion.success, fixture.completion.metrics);
    await engine.dataStore.saveMetrics(runId, fixture.detailedMetrics);

    return runId;
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    alertStore = [];

    engine = new TestCycleEngine({ dataDir: testDataDir });
    await engine.initialize();
    await engine.startMonitoring();

    // Extend engine with dashboard helpers expected by DashboardServer
    engine.getPipelineRuns = async ({ limit, offset = 0, status } = {}) => {
      const runs = await engine.dataStore.getPipelineRuns({ status });
      const start = Number(offset) || 0;
      const end = limit ? start + Number(limit) : undefined;
      return runs.slice(start, end);
    };
    engine.getMetrics = async () => engine.dataStore.getMetrics();
    engine.getAlerts = async ({ status = 'active', limit } = {}) => {
      let alerts = [...alertStore];
      if (status !== 'all') {
        alerts = alerts.filter(alert => alert.status === status || (status === 'active' && alert.status !== 'resolved'));
      }
      if (limit) {
        alerts = alerts.slice(0, Number(limit));
      }
      return alerts;
    };
    engine.getSystemStatus = async () => {
      const runs = await engine.dataStore.getPipelineRuns();
      const lastRun = runs[0] || null;
      return {
        monitoringActive: engine.isRunning,
        activePipelineCount: engine.activePipelines.size,
        totalRuns: runs.length,
        lastRun: lastRun
          ? {
              id: lastRun.id,
              status: lastRun.status,
              success: lastRun.success,
              triggerType: lastRun.trigger.type
            }
          : null
      };
    };

    triggerMonitor = new TriggerMonitor(engine, {});
    dashboardServer = new DashboardServer(engine, { port: 0 });
  });

  afterEach(async () => {
    vi.useRealTimers();
    await engine.stopMonitoring();
    await fs.rm(testDataDir, { recursive: true, force: true });
  });

  it('processes a successful webhook deployment from trigger through dashboard views', async () => {
    const { successfulDeployment } = pipelineFixtures;

    const runId = await runPipelineFixture(successfulDeployment);
    const pipelineRun = await engine.getPipelineRun(runId);

    expect(pipelineRun.status).toBe('completed');
    expect(pipelineRun.success).toBe(true);
    expect(pipelineRun.metrics.webhookLatency).toBe(successfulDeployment.completion.metrics.webhookLatency);
    expect(pipelineRun.metrics.totalPipelineTime).toBe(305000);

    const stageDurations = Object.fromEntries(
      pipelineRun.stages.map(stage => [stage.name, stage.duration])
    );
    expect(stageDurations.webhook_received).toBe(2000);
    expect(stageDurations.pipeline_dispatch).toBe(2000);
    expect(stageDurations.build_process).toBe(180000);
    expect(stageDurations.deployment).toBe(60000);
    expect(stageDurations.post_deploy_validation).toBe(50000);

    const listRes = createMockRes();
    await dashboardServer.getPipelineRuns({ query: { limit: '5' } }, listRes);
    const runsPayload = listRes.json.mock.calls[0][0];
    expect(runsPayload).toHaveLength(1);
    expect(runsPayload[0].id).toBe(runId);
    expect(runsPayload[0].trigger).toEqual(successfulDeployment.trigger);

    const runRes = createMockRes();
    await dashboardServer.getPipelineRun({ params: { id: runId } }, runRes);
    expect(runRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        id: runId,
        metrics: expect.objectContaining(successfulDeployment.completion.metrics)
      })
    );

    const metricsRes = createMockRes();
    await dashboardServer.getMetrics({ query: {} }, metricsRes);
    const metricsPayload = metricsRes.json.mock.calls[0][0];
    expect(metricsPayload[runId]).toEqual(
      expect.objectContaining(successfulDeployment.detailedMetrics)
    );

    const alertsRes = createMockRes();
    await dashboardServer.getAlerts({ query: { status: 'active' } }, alertsRes);
    expect(alertsRes.json).toHaveBeenCalledWith([]);

    const statusRes = createMockRes();
    await dashboardServer.getSystemStatus({}, statusRes);
    expect(statusRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        monitoringActive: true,
        totalRuns: 1,
        lastRun: expect.objectContaining({ id: runId, success: true })
      })
    );
  });

  it('captures failed deployments and exposes alert signals to the dashboard', async () => {
    const { failedDeployment } = pipelineFixtures;

    const runId = await runPipelineFixture(failedDeployment);
    const pipelineRun = await engine.getPipelineRun(runId);

    expect(pipelineRun.status).toBe('failed');
    expect(pipelineRun.success).toBe(false);
    expect(pipelineRun.errors).toHaveLength(failedDeployment.errors.length);

    failedDeployment.expectedAlerts.forEach((alert, index) => {
      alertStore.push({
        id: `alert_${index}`,
        runId,
        status: 'active',
        timestamp: new Date(failedDeployment.completion.at).toISOString(),
        ...alert,
        data: { runId, type: alert.type }
      });
    });

    const failedListRes = createMockRes();
    await dashboardServer.getPipelineRuns({ query: { status: 'failed', limit: '5' } }, failedListRes);
    const failedRuns = failedListRes.json.mock.calls[0][0];
    expect(failedRuns).toHaveLength(1);
    expect(failedRuns[0].id).toBe(runId);
    expect(failedRuns[0].status).toBe('failed');

    const alertsRes = createMockRes();
    await dashboardServer.getAlerts({ query: { status: 'active', limit: '10' } }, alertsRes);
    const alertsPayload = alertsRes.json.mock.calls[0][0];
    expect(alertsPayload).toHaveLength(failedDeployment.expectedAlerts.length);
    expect(alertsPayload.map(alert => alert.type)).toEqual(
      failedDeployment.expectedAlerts.map(alert => alert.type)
    );
  });
});
