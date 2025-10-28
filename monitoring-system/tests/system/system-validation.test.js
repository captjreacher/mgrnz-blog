import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { TestCycleEngine } from '../../src/core/test-cycle-engine.js';
import AlertManager from '../../src/alerts/alert-manager.js';
import { clonePipelineFixture } from '../fixtures/pipeline-fixtures.js';

const TEST_DATA_DIR = './test-data/system-validation';

describe('System validation and resilience checks', () => {
  let engine;
  let alertManager;

  beforeEach(async () => {
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
    engine = new TestCycleEngine({
      dataDir: TEST_DATA_DIR,
      monitoring: { interval: 50, timeout: 600000 },
      alerts: { maxHistory: 100 }
    });
    await engine.initialize();
    await engine.startMonitoring();
    alertManager = new AlertManager();
  });

  afterEach(async () => {
    if (engine) {
      await engine.stopMonitoring();
    }

    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  });

  it('recovers from failures and maintains alert accuracy', async () => {
    const failureFixture = clonePipelineFixture('recoveryPipeline');
    const failureRunId = await engine.createPipelineRun(failureFixture.trigger);

    for (const stage of failureFixture.stages) {
      await engine.updatePipelineStage(failureRunId, stage.name, 'running', stage.runningData);
      const status = stage.completedData.status === 'failed' ? 'failed' : 'completed';
      await engine.updatePipelineStage(failureRunId, stage.name, status, stage.completedData);
      if (status === 'failed') {
        await engine.addError(
          failureRunId,
          stage.name,
          'validation_error',
          'Stage reported failure',
          { errors: stage.completedData.errors }
        );
      }
    }

    await engine.completePipelineRun(failureRunId, false, failureFixture.metrics.pipeline);
    await engine.recordMetrics(failureRunId, {
      ...failureFixture.metrics.pipeline,
      ...failureFixture.metrics.performance,
      success: false
    });

    const generatedAlerts = await alertManager.checkAlerts(await engine.getPipelineRun(failureRunId));
    generatedAlerts.forEach(alert => engine.recordAlert(alert));

    let activeAlerts = await engine.getAlerts({ status: 'active' });
    expect(activeAlerts).toHaveLength(generatedAlerts.length);
    expect(activeAlerts.map(alert => alert.type)).toContain('pipeline_failure');

    await engine.stopMonitoring();
    engine = new TestCycleEngine({
      dataDir: TEST_DATA_DIR,
      monitoring: { interval: 50, timeout: 600000 },
      alerts: { maxHistory: 100 }
    });
    await engine.initialize();
    await engine.startMonitoring();

    generatedAlerts.forEach(alert => engine.recordAlert(alert));
    activeAlerts = await engine.getAlerts({ status: 'active' });

    const storedRuns = await engine.getPipelineRuns({ limit: 5 });
    expect(storedRuns.find(run => run.id === failureRunId)).toBeDefined();

    const recoveryFixture = failureFixture.recoveryFollowUp;
    const recoveryRunId = await engine.createPipelineRun(recoveryFixture.trigger);

    for (const stage of recoveryFixture.stages) {
      await engine.updatePipelineStage(recoveryRunId, stage.name, 'running', stage.runningData);
      await engine.updatePipelineStage(recoveryRunId, stage.name, 'completed', stage.completedData);
    }

    await engine.completePipelineRun(recoveryRunId, true, recoveryFixture.metrics.pipeline);
    await engine.recordMetrics(recoveryRunId, {
      ...recoveryFixture.metrics.pipeline,
      success: true
    });

    const status = await engine.getSystemStatus();
    expect(status.metrics.totalRuns).toBeGreaterThanOrEqual(2);
    expect(status.metrics.successRate).toBeGreaterThan(40);

    for (const alert of activeAlerts) {
      engine.resolveAlert(alert.id, 'system-validation');
    }

    const resolvedAlerts = await engine.getAlerts({ status: 'resolved' });
    expect(resolvedAlerts.length).toBeGreaterThanOrEqual(activeAlerts.length);
    resolvedAlerts.forEach(alert => expect(alert.status).toBe('resolved'));

    const metrics = await engine.getMetrics('7d');
    expect(metrics.totalRuns).toBeGreaterThanOrEqual(2);
    expect(metrics.successRate).toBeGreaterThan(40);

    const report = await engine.generateReport(recoveryRunId);
    expect(report.summary.success).toBe(true);
    expect(report.stages.length).toBeGreaterThan(0);
  });
});
