import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { TestCycleEngine } from '../../src/core/test-cycle-engine.js';
import { TriggerMonitor } from '../../src/monitors/trigger-monitor.js';
import { pipelineFixtures } from '../integration/fixtures/pipeline-fixtures.js';

const { default: AlertManager } = await import('../../src/alerts/alert-manager.js');

const testDataDir = path.resolve('./test-data/system-validation');

const cloneFixtureWithOffset = (fixture, offsetMs) => {
  const offsetDate = (isoString) => new Date(new Date(isoString).getTime() + offsetMs).toISOString();
  return {
    ...fixture,
    trigger: {
      ...fixture.trigger,
      timestamp: offsetDate(fixture.trigger.timestamp),
      metadata: {
        ...fixture.trigger.metadata,
        recoveryOffset: offsetMs
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

const runFixture = async (engine, triggerMonitor, fixture) => {
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

describe('System validation suite', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    await fs.rm(testDataDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    vi.useRealTimers();
    await fs.rm(testDataDir, { recursive: true, force: true });
  });

  it('recovers pipeline state after engine restart', async () => {
    const engine = new TestCycleEngine({ dataDir: testDataDir });
    await engine.initialize();
    const triggerMonitor = new TriggerMonitor(engine, {});

    const runId = await runFixture(engine, triggerMonitor, pipelineFixtures.successfulDeployment);
    const originalRun = await engine.getPipelineRun(runId);

    const restartedEngine = new TestCycleEngine({ dataDir: testDataDir });
    await restartedEngine.initialize();
    const recoveredRun = await restartedEngine.getPipelineRun(runId);

    expect(recoveredRun).toEqual(originalRun);
  });

  it('handles failed pipelines and supports recovery deployments', async () => {
    const engine = new TestCycleEngine({ dataDir: testDataDir });
    await engine.initialize();
    const triggerMonitor = new TriggerMonitor(engine, {});

    const failureRunId = await runFixture(engine, triggerMonitor, pipelineFixtures.failedDeployment);
    const failureRun = await engine.getPipelineRun(failureRunId);

    expect(failureRun.status).toBe('failed');
    expect(engine.activePipelines.size).toBe(0);

    const recoveryFixture = cloneFixtureWithOffset(pipelineFixtures.successfulDeployment, 45 * 60000);
    const recoveryRunId = await runFixture(engine, triggerMonitor, recoveryFixture);
    const recoveryRun = await engine.getPipelineRun(recoveryRunId);

    expect(recoveryRun.status).toBe('completed');
    expect(recoveryRun.success).toBe(true);
    expect(recoveryRun.metrics.totalPipelineTime).toBeGreaterThan(0);
  });

  it('generates alert set matching severity expectations for failed pipelines', async () => {
    const engine = new TestCycleEngine({ dataDir: testDataDir });
    await engine.initialize();
    const triggerMonitor = new TriggerMonitor(engine, {});

    const failureRunId = await runFixture(engine, triggerMonitor, pipelineFixtures.failedDeployment);
    const failureRun = await engine.getPipelineRun(failureRunId);

    const alertManager = new AlertManager();
    const alerts = await alertManager.checkAlerts(failureRun);

    pipelineFixtures.failedDeployment.expectedAlerts.forEach(expected => {
      const matchingAlert = alerts.find(alert => alert.type === expected.type);
      expect(matchingAlert).toBeDefined();
      expect(matchingAlert.severity).toBe(expected.severity);
    });
  });
});
