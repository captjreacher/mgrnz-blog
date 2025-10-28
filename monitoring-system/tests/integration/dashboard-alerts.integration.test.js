import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import WebSocket from 'ws';
import { DashboardServer } from '../../src/dashboard/dashboard-server.js';

const HOST = '127.0.0.1';

describe('Dashboard alerts integration', () => {
  let server;
  let port;
  let engine;

  beforeAll(async () => {
    const statusPayload = { status: 'ok', version: '1.0.0' };
    const pipelineRunsPayload = [{ id: 'run-1', status: 'completed' }];
    const metricsPayload = { throughput: 42 };
    const alertsPayload = [{ id: 'alert-1', type: 'pipeline_failure' }];

    engine = {
      getSystemStatus: vi.fn().mockResolvedValue(statusPayload),
      getPipelineRuns: vi.fn().mockResolvedValue(pipelineRunsPayload),
      getPipelineRun: vi.fn().mockResolvedValue(pipelineRunsPayload[0]),
      getMetrics: vi.fn().mockResolvedValue(metricsPayload),
      getAlerts: vi.fn().mockResolvedValue(alertsPayload)
    };

    server = new DashboardServer(engine, { port: 0, host: HOST });
    server.config.port = 0;

    await server.start();
    port = server.server.address().port;
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
  });

  it('should expose monitoring data through REST endpoints', async () => {
    const statusResponse = await fetch(`http://${HOST}:${port}/api/status`);
    expect(statusResponse.status).toBe(200);
    expect(await statusResponse.json()).toEqual({ status: 'ok', version: '1.0.0' });
    expect(engine.getSystemStatus).toHaveBeenCalled();

    const runsResponse = await fetch(`http://${HOST}:${port}/api/pipeline-runs?limit=5&offset=0`);
    expect(runsResponse.status).toBe(200);
    expect(await runsResponse.json()).toEqual([{ id: 'run-1', status: 'completed' }]);
    expect(engine.getPipelineRuns).toHaveBeenCalledWith({ limit: 5, offset: 0, status: undefined });

    const metricsResponse = await fetch(`http://${HOST}:${port}/api/metrics`);
    expect(metricsResponse.status).toBe(200);
    expect(await metricsResponse.json()).toEqual({ throughput: 42 });
    expect(engine.getMetrics).toHaveBeenCalledWith('24h');

    const alertsResponse = await fetch(`http://${HOST}:${port}/api/alerts`);
    expect(alertsResponse.status).toBe(200);
    expect(await alertsResponse.json()).toEqual([{ id: 'alert-1', type: 'pipeline_failure' }]);
    expect(engine.getAlerts).toHaveBeenCalledWith({ status: 'active', limit: 100 });
  });

  it('should deliver alert broadcasts over WebSocket connections', async () => {
    const ws = new WebSocket(`ws://${HOST}:${port}`);
    const receivedMessages = [];
    ws.on('message', data => {
      receivedMessages.push(JSON.parse(data.toString()));
    });

    const waitForMessageType = async (type) => {
      const start = Date.now();
      while (Date.now() - start < 5000) {
        const found = receivedMessages.find(message => message.type === type);
        if (found) {
          return found;
        }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      throw new Error(`Timed out waiting for message type: ${type}`);
    };

    await new Promise(resolve => ws.once('open', resolve));

    const welcome = await waitForMessageType('connection');
    expect(welcome.type).toBe('connection');

    const alertPayload = { id: 'alert-42', type: 'pipeline_failure' };
    server.onAlertGenerated(alertPayload);

    const alertMessage = await waitForMessageType('alert');
    expect(alertMessage.type).toBe('alert');
    expect(alertMessage.data).toEqual(alertPayload);

    ws.close();
    await new Promise(resolve => ws.once('close', resolve));
  });
});
