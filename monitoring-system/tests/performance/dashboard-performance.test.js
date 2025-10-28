import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import WebSocket from 'ws';
import { performance } from 'perf_hooks';
import { TestCycleEngine } from '../../src/core/test-cycle-engine.js';
import { DashboardServer } from '../../src/dashboard/dashboard-server.js';
import { clonePipelineFixture } from '../fixtures/pipeline-fixtures.js';

const TEST_DATA_DIR = './test-data/performance-dashboard';

async function waitForOpen(ws) {
  if (ws.readyState === WebSocket.OPEN) {
    return;
  }

  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
}

describe('Dashboard performance and load handling', () => {
  let engine;
  let dashboard;
  let baseUrl;

  beforeEach(async () => {
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });

    engine = new TestCycleEngine({
      dataDir: TEST_DATA_DIR,
      monitoring: { interval: 50, timeout: 600000 },
      alerts: { maxHistory: 200 }
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

  it('handles concurrent API requests with low latency', async () => {
    const fixture = clonePipelineFixture('productionDeployment');
    const runId = await engine.createPipelineRun(fixture.trigger);

    for (const stage of fixture.stages) {
      await engine.updatePipelineStage(runId, stage.name, 'completed', stage.completedData);
    }

    await engine.completePipelineRun(runId, true, fixture.metrics.pipeline);
    await engine.recordMetrics(runId, {
      ...fixture.metrics.pipeline,
      ...fixture.metrics.performance
    });

    const requestCount = 25;
    const startTime = performance.now();
    await Promise.all(
      Array.from({ length: requestCount }, (_, index) => {
        const endpoint = index % 3 === 0 ? '/api/status' : index % 3 === 1 ? '/api/pipeline-runs?limit=5' : '/api/metrics?timeRange=24h';
        return fetch(`${baseUrl}${endpoint}`).then(response => response.json());
      })
    );
    const totalTime = performance.now() - startTime;
    const averagePerRequest = totalTime / requestCount;

    expect(totalTime).toBeLessThan(1500);
    expect(averagePerRequest).toBeLessThan(80);
  });

  it('broadcasts pipeline updates to multiple clients quickly', async () => {
    const fixture = clonePipelineFixture('productionDeployment');
    const runId = await engine.createPipelineRun(fixture.trigger);

    const clientCount = 5;
    const clients = Array.from({ length: clientCount }, () => new WebSocket(baseUrl.replace('http', 'ws')));
    await Promise.all(clients.map(waitForOpen));
    clients.forEach(client => client.send(JSON.stringify({ type: 'subscribe', events: ['pipeline_completed'] })));

    for (const stage of fixture.stages) {
      await engine.updatePipelineStage(runId, stage.name, 'completed', stage.completedData);
    }

    await engine.completePipelineRun(runId, true, fixture.metrics.pipeline);
    await engine.recordMetrics(runId, {
      ...fixture.metrics.pipeline,
      ...fixture.metrics.performance
    });

    const receiptPromises = clients.map(
      client =>
        new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('WebSocket timeout')), 3000);
          client.on('message', (raw) => {
            const payload = JSON.parse(raw.toString());
            if (payload.type === 'pipeline_completed') {
              clearTimeout(timeout);
              resolve(payload.timestamp);
            }
          });
          client.on('error', reject);
        })
    );

    const broadcastStart = Date.now();
    dashboard.onPipelineRunCompleted(await engine.getPipelineRun(runId));
    const timestamps = await Promise.all(receiptPromises);
    const broadcastLatency = Date.now() - broadcastStart;

    clients.forEach(client => client.close());

    expect(timestamps).toHaveLength(clientCount);
    expect(broadcastLatency).toBeLessThan(600);
  });
});
