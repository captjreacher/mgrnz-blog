import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { performance } from 'node:perf_hooks';
import { TestCycleEngine } from '../../src/core/test-cycle-engine.js';
import { DashboardServer } from '../../src/dashboard/dashboard-server.js';
import { TriggerMonitor } from '../../src/monitors/trigger-monitor.js';
import { pipelineFixtures } from '../integration/fixtures/pipeline-fixtures.js';

const testDataDir = path.resolve('./test-data/dashboard-performance');

const createMockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const cloneFixtureWithOffset = (fixture, offsetMs) => {
  const offsetDate = (isoString) => new Date(new Date(isoString).getTime() + offsetMs).toISOString();
  return {
    ...fixture,
    trigger: {
      ...fixture.trigger,
      timestamp: offsetDate(fixture.trigger.timestamp),
      metadata: {
        ...fixture.trigger.metadata,
        sequence: Math.floor(offsetMs / 1000)
      }
    },
    stages: fixture.stages.map(stage => ({
      name: stage.name,
      updates: stage.updates.map(update => ({
        ...update,
        at: offsetDate(update.at)
      }))
    })),
    errors: fixture.errors ? fixture.errors.map(error => ({ ...error })) : undefined,
    completion: {
      ...fixture.completion,
      at: offsetDate(fixture.completion.at)
    },
    detailedMetrics: JSON.parse(JSON.stringify(fixture.detailedMetrics))
  };
};

describe('Dashboard load characteristics', () => {
  let engine;
  let dashboardServer;
  let triggerMonitor;

  const runFixtureThroughEngine = async (fixture) => {
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

  beforeAll(async () => {
    vi.useFakeTimers();
    engine = new TestCycleEngine({ dataDir: testDataDir });
    await engine.initialize();

    engine.getPipelineRuns = async ({ limit, offset = 0, status } = {}) => {
      const runs = await engine.dataStore.getPipelineRuns({ status });
      const start = Number(offset) || 0;
      const end = limit ? start + Number(limit) : undefined;
      return runs.slice(start, end);
    };
    engine.getMetrics = async () => engine.dataStore.getMetrics();
    engine.getAlerts = async () => [];

    triggerMonitor = new TriggerMonitor(engine, {});
    dashboardServer = new DashboardServer(engine, { port: 0 });

    const { successfulDeployment, failedDeployment } = pipelineFixtures;
    const seedPromises = [];
    for (let i = 0; i < 24; i += 1) {
      seedPromises.push(runFixtureThroughEngine(cloneFixtureWithOffset(successfulDeployment, i * 60000)));
    }
    for (let i = 0; i < 8; i += 1) {
      seedPromises.push(runFixtureThroughEngine(cloneFixtureWithOffset(failedDeployment, (i + 24) * 60000)));
    }
    await Promise.all(seedPromises);
    vi.useRealTimers();
  });

  afterAll(async () => {
    await fs.rm(testDataDir, { recursive: true, force: true });
  });

  it('returns recent pipeline runs under concurrent dashboard load within latency budget', async () => {
    const concurrency = 25;
    const requests = [];
    const start = performance.now();

    for (let i = 0; i < concurrency; i += 1) {
      const res = createMockRes();
      const req = { query: { limit: '15', offset: '0' } };
      requests.push(
        dashboardServer.getPipelineRuns(req, res).then(() => res.json.mock.calls[0][0])
      );
    }

    const payloads = await Promise.all(requests);
    const duration = performance.now() - start;

    payloads.forEach(runs => {
      expect(Array.isArray(runs)).toBe(true);
      expect(runs.length).toBeGreaterThan(0);
    });
    expect(duration).toBeLessThan(1200);
  });

  it('serves metrics snapshots with consistent responsiveness during load tests', async () => {
    const iterations = 30;
    const requests = [];
    const start = performance.now();

    for (let i = 0; i < iterations; i += 1) {
      const res = createMockRes();
      requests.push(dashboardServer.getMetrics({ query: {} }, res).then(() => res.json.mock.calls[0][0]));
    }

    const metricsPayloads = await Promise.all(requests);
    const duration = performance.now() - start;

    metricsPayloads.forEach(payload => {
      expect(Object.keys(payload).length).toBeGreaterThan(0);
    });
    expect(duration).toBeLessThan(1500);
  });
});
