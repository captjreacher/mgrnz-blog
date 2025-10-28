import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkflowPerformanceAnalyzer } from '../../src/monitors/workflow-performance-analyzer.js';
import {
  createWorkflowRunFixture,
  createJobsFixture,
  createJobsWithFailureFixture,
  createBuildAnalysisFixture,
  createHistoricalAnalyticsSamples
} from '../fixtures/sample-data.js';

function clone(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

describe('WorkflowPerformanceAnalyzer analytics calculations', () => {
  let analyzer;
  let engineStub;

  beforeEach(() => {
    engineStub = {
      updatePipelineStage: vi.fn().mockResolvedValue(undefined)
    };
    analyzer = new WorkflowPerformanceAnalyzer(engineStub, {});
    analyzer.historicalData.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calculates timing, metrics, and stores historical data for completed workflows', async () => {
    const workflowRun = clone(createWorkflowRunFixture());
    const jobs = clone(createJobsFixture());
    const buildAnalysis = createBuildAnalysisFixture();

    const result = await analyzer.analyzeWorkflowPerformance('run-analytics-1', workflowRun, jobs, buildAnalysis);

    expect(result.timingAnalysis.totalDuration).toBe(360000);
    expect(result.timingAnalysis.queueTime).toBe(60000);
    expect(result.performanceMetrics.jobCount).toBe(2);
    expect(result.performanceMetrics.successRate).toBe(1);
    expect(result.deploymentTracking.success).toBe(true);
    expect(result.overallScore).toBeGreaterThan(0);

    expect(engineStub.updatePipelineStage).toHaveBeenCalledWith(
      'run-analytics-1',
      'performance_analysis_started',
      'running',
      expect.objectContaining({ workflowRunId: workflowRun.id })
    );
    expect(engineStub.updatePipelineStage).toHaveBeenCalledWith(
      'run-analytics-1',
      'performance_analysis_completed',
      'completed',
      expect.objectContaining({ result: expect.objectContaining({ performanceMetrics: expect.any(Object) }) })
    );
    expect(analyzer.historicalData.has(workflowRun.id)).toBe(true);
  });

  it('summarises historical performance trends over the requested period', () => {
    const samples = createHistoricalAnalyticsSamples();
    const now = Date.now();

    samples.forEach((entry, index) => {
      analyzer.historicalData.set(`run-${index + 1}`, {
        ...clone(entry),
        timestamp: now - index * 60_000
      });
    });

    const trends = analyzer.getPerformanceTrends(30);

    expect(trends.totalRuns).toBe(samples.length);
    expect(trends.averageDuration).toBeCloseTo((300000 + 420000 + 360000) / 3, 5);
    expect(trends.successRate).toBeCloseTo(2 / 3);
    expect(trends.buildTimeAverage).toBeCloseTo((150000 + 240000 + 180000) / 3, 5);
    expect(trends.deploymentTimeAverage).toBeCloseTo((60000 + 90000 + 120000) / 3, 5);
    expect(trends.trends.duration).toBe('stable');
    expect(trends.trends.successRate).toBe('stable');
  });

  it('aggregates recurring bottlenecks from recent runs', () => {
    const samples = createHistoricalAnalyticsSamples();
    const now = Date.now();

    samples[0].bottleneckAnalysis.bottlenecks.push({ type: 'phase_duration', stage: 'deploy', severity: 'medium', duration: 130000, threshold: 120000 });
    samples[1].bottleneckAnalysis.bottlenecks.push({ type: 'job_duration', stage: 'build', severity: 'medium', duration: 250000, threshold: 300000 });

    samples.forEach((entry, index) => {
      analyzer.historicalData.set(`history-${index}`, {
        ...clone(entry),
        timestamp: now - index * 120_000
      });
    });

    const common = analyzer.identifyCommonBottlenecks(5);

    expect(common[0]).toMatchObject({ bottleneck: 'job_duration_build', frequency: 2 });
    expect(common[0].percentage).toBeCloseTo((2 / samples.length) * 100, 5);
    const deployEntry = common.find(item => item.bottleneck === 'job_duration_deploy');
    expect(deployEntry).toBeDefined();
    expect(deployEntry.frequency).toBe(1);
  });

  it('computes success ratios from job outcomes when failures occur', async () => {
    const workflowRun = createWorkflowRunFixture({ conclusion: 'failure', status: 'completed' });
    const jobs = createJobsWithFailureFixture();
    const buildAnalysis = createBuildAnalysisFixture();

    const result = await analyzer.analyzeWorkflowPerformance('run-analytics-2', workflowRun, jobs, buildAnalysis);

    expect(result.performanceMetrics.successRate).toBeCloseTo(0.5);
    expect(result.deploymentTracking.success).toBe(false);
    expect(result.bottleneckAnalysis.totalBottlenecks).toBeGreaterThanOrEqual(0);
  });
});
