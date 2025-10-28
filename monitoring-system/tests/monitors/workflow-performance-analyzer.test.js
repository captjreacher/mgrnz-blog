import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkflowPerformanceAnalyzer } from '../../src/monitors/workflow-performance-analyzer.js';

describe('WorkflowPerformanceAnalyzer', () => {
  let performanceAnalyzer;
  let mockEngine;

  beforeEach(() => {
    mockEngine = {
      updatePipelineStage: vi.fn().mockResolvedValue(),
      addError: vi.fn().mockResolvedValue()
    };

    performanceAnalyzer = new WorkflowPerformanceAnalyzer(mockEngine, {});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const result = await performanceAnalyzer.initialize();

      expect(result).toBe(true);
      expect(performanceAnalyzer.performanceThresholds).toBeDefined();
      expect(performanceAnalyzer.historicalData).toBeDefined();
    });
  });

  describe('workflow performance analysis', () => {
    it('should analyze workflow performance successfully', async () => {
      const workflowRun = {
        id: 123,
        status: 'completed',
        conclusion: 'success',
        created_at: '2025-10-28T12:00:00Z',
        updated_at: '2025-10-28T12:05:00Z',
        run_started_at: '2025-10-28T12:00:30Z'
      };

      const jobs = [
        {
          id: 1,
          name: 'build-hugo',
          status: 'completed',
          conclusion: 'success',
          created_at: '2025-10-28T12:00:30Z',
          started_at: '2025-10-28T12:01:00Z',
          completed_at: '2025-10-28T12:03:00Z',
          steps: [{ name: 'Setup' }, { name: 'Build' }]
        }
      ];

      const buildAnalysis = {
        totalBuildTime: 120000,
        totalDeploymentTime: 90000,
        success: true
      };

      const result = await performanceAnalyzer.analyzeWorkflowPerformance('test-run-id', workflowRun, jobs, buildAnalysis);

      expect(result.timingAnalysis).toBeDefined();
      expect(result.bottleneckAnalysis).toBeDefined();
      expect(result.performanceMetrics).toBeDefined();
      expect(result.deploymentTracking).toBeDefined();
      expect(result.insights).toBeDefined();
      expect(result.overallScore).toBeGreaterThan(0);
      expect(result.recommendations).toBeDefined();
    });

    it('should handle performance analysis failures', async () => {
      const workflowRun = null;

      await expect(performanceAnalyzer.analyzeWorkflowPerformance('test-run-id', workflowRun, [], {})).rejects.toThrow();

      expect(mockEngine.updatePipelineStage).toHaveBeenCalledWith(
        'test-run-id',
        'performance_analysis_failed',
        'failed',
        expect.objectContaining({
          error: expect.any(String)
        })
      );
    });
  });

  describe('bottleneck identification', () => {
    it('should identify workflow duration bottlenecks', async () => {
      const timingAnalysis = {
        totalDuration: 900000, // 15 minutes - over threshold
        queueTime: 60000,
        jobs: []
      };

      const bottlenecks = await performanceAnalyzer._identifyBottlenecks({}, [], timingAnalysis);

      expect(bottlenecks.totalBottlenecks).toBeGreaterThan(0);
      expect(bottlenecks.highSeverity).toBeGreaterThan(0);
      expect(bottlenecks.bottlenecks[0].type).toBe('workflow_duration');
      expect(bottlenecks.bottlenecks[0].severity).toBe('high');
    });

    it('should identify no bottlenecks for fast workflows', async () => {
      const timingAnalysis = {
        totalDuration: 120000, // 2 minutes
        queueTime: 30000,
        jobs: [{ name: 'fast-job', executionTime: 60000 }],
        phases: { setup: 30000, build: 60000, test: 0, deploy: 30000 }
      };

      const bottlenecks = await performanceAnalyzer._identifyBottlenecks({}, [], timingAnalysis);

      expect(bottlenecks.totalBottlenecks).toBe(0);
    });
  });

  describe('performance metrics', () => {
    it('should collect comprehensive performance metrics', async () => {
      const workflowRun = {
        created_at: '2025-10-28T12:00:00Z',
        updated_at: '2025-10-28T12:05:00Z',
        run_started_at: '2025-10-28T12:00:30Z'
      };

      const jobs = [
        {
          conclusion: 'success',
          steps: [{ name: 'Step 1' }, { name: 'Step 2' }]
        }
      ];

      const buildAnalysis = { totalBuildTime: 120000, totalDeploymentTime: 120000 };

      const metrics = await performanceAnalyzer._collectPerformanceMetrics(workflowRun, jobs, buildAnalysis);

      expect(metrics.totalPipelineTime).toBe(300000);
      expect(metrics.buildTime).toBe(120000);
      expect(metrics.deploymentTime).toBe(120000);
      expect(metrics.jobCount).toBe(1);
      expect(metrics.stepCount).toBe(2);
      expect(metrics.successRate).toBe(1);
    });
  });

  describe('deployment tracking', () => {
    it('should track successful deployments', async () => {
      const workflowRun = { conclusion: 'success', status: 'completed' };
      const jobs = [
        { id: 1, name: 'build-hugo', conclusion: 'success', status: 'completed' },
        { id: 2, name: 'deploy-pages', conclusion: 'success', status: 'completed' }
      ];

      const tracking = await performanceAnalyzer._trackDeploymentResults(workflowRun, jobs);

      expect(tracking.success).toBe(true);
      expect(tracking.successfulJobs).toHaveLength(2);
      expect(tracking.deploymentJobs).toHaveLength(1);
      expect(tracking.deploymentSuccess).toBe(true);
    });
  });

  describe('helper methods', () => {
    it('should calculate job success rates correctly', () => {
      const jobs = [
        { conclusion: 'success' },
        { conclusion: 'failure' },
        { conclusion: 'success' }
      ];

      const successRate = performanceAnalyzer._calculateJobSuccessRate(jobs);
      expect(successRate).toBeCloseTo(0.667, 2);
    });

    it('should identify deployment jobs correctly', () => {
      expect(performanceAnalyzer._isDeploymentJob('deploy-to-pages')).toBe(true);
      expect(performanceAnalyzer._isDeploymentJob('build-hugo')).toBe(false);
    });
  });
});