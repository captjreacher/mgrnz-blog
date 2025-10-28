import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import WebSocket from 'ws';
import { TestCycleEngine } from '../../src/core/test-cycle-engine.js';
import { DashboardServer } from '../../src/dashboard/dashboard-server.js';
import { clonePipelineFixture } from '../fixtures/pipeline-fixtures.js';

const TEST_DATA_DIR = './test-data/e2e-monitoring';

async function waitForWebSocketOpen(ws) {
  if (ws.readyState === WebSocket.OPEN) {
    return;
  }

  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
}

describe('End-to-end monitoring scenarios', () => {
  let engine;
  let dashboard;
  let baseUrl;

  beforeEach(async () => {
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });

    engine = new TestCycleEngine({
      dataDir: TEST_DATA_DIR,
      monitoring: { interval: 50, timeout: 600000 },
      alerts: { maxHistory: 50 }
    });
    await engine.initialize();
    await engine.startMonitoring();

    dashboard = new DashboardServer(engine, { host: '127.0.0.1', port: 0 });
    await dashboard.start();
    const address = dashboard.server.address();
    const host = address.address === '::' ? '127.0.0.1' : address.address;
    baseUrl = `http://${host}:${address.port}`;
  });

  afterEach(async () => {
    if (dashboard) {
      await dashboard.stop();
    }

    if (engine) {
      await engine.stopMonitoring();
    }

    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  });

  it('processes a production deployment pipeline and exposes dashboard data', async () => {
    const pipelineFixture = clonePipelineFixture('productionDeployment');
    const runId = await engine.createPipelineRun(pipelineFixture.trigger);

    const websocket = new WebSocket(baseUrl.replace('http', 'ws'));
    await waitForWebSocketOpen(websocket);
    websocket.send(JSON.stringify({ type: 'subscribe', events: ['pipeline_completed'] }));

    const completionMessage = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WebSocket did not receive completion event')), 3000);
      websocket.on('message', (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.type === 'pipeline_completed') {
          clearTimeout(timeout);
          resolve(message);
        }
      });
      websocket.on('error', reject);
    });

    dashboard.onPipelineRunStarted(await engine.getPipelineRun(runId));

    for (const stage of pipelineFixture.stages) {
      await engine.updatePipelineStage(runId, stage.name, 'running', stage.runningData);
      dashboard.onPipelineRunUpdated(await engine.getPipelineRun(runId));

      await engine.updatePipelineStage(runId, stage.name, 'completed', stage.completedData);
      dashboard.onPipelineRunUpdated(await engine.getPipelineRun(runId));
    }

    await engine.completePipelineRun(runId, true, pipelineFixture.metrics.pipeline);
    await engine.recordMetrics(runId, {
      ...pipelineFixture.metrics.pipeline,
      ...pipelineFixture.metrics.performance
    });

    engine.recordAlert({
      type: 'pipeline_health',
      severity: 'info',
      message: 'Pipeline completed successfully',
      context: { runId, source: 'e2e-test' }
    });

    dashboard.onPipelineRunCompleted(await engine.getPipelineRun(runId));

    const broadcast = await completionMessage;
    expect(broadcast.data.id).toBe(runId);
    websocket.close();

    const statusResponse = await fetch(`${baseUrl}/api/status`);
    const status = await statusResponse.json();
    expect(status.running).toBe(true);
    expect(status.metrics.totalRuns).toBeGreaterThanOrEqual(1);
    expect(status.lastRun.id).toBe(runId);

    const runsResponse = await fetch(`${baseUrl}/api/pipeline-runs?limit=5`);
    const runs = await runsResponse.json();
    expect(runs).toHaveLength(1);
    expect(runs[0].stages).toHaveLength(pipelineFixture.stages.length);

    const runResponse = await fetch(`${baseUrl}/api/pipeline-runs/${runId}`);
    const runDetails = await runResponse.json();
    expect(runDetails.metrics.totalPipelineTime).toBeGreaterThan(0);
    expect(runDetails.stages.find(stage => stage.name === 'dashboard_update')).toBeDefined();

    const metricsResponse = await fetch(`${baseUrl}/api/metrics?timeRange=24h`);
    const metrics = await metricsResponse.json();
    expect(metrics.totalRuns).toBeGreaterThan(0);
    expect(metrics.averages.buildTime).toBeGreaterThan(0);
    expect(metrics.runs[0].runId).toBe(runId);

    const alertsResponse = await fetch(`${baseUrl}/api/alerts`);
    const alerts = await alertsResponse.json();
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    expect(alerts[0].status).toBe('active');
  });
});
