import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GitHubActionsMonitor } from '../../src/monitors/github-actions-monitor.js';
import { BuildProcessTracker } from '../../src/monitors/build-process-tracker.js';
import { WorkflowPerformanceAnalyzer } from '../../src/monitors/workflow-performance-analyzer.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('GitHub Actions Simple Integration Tests', () => {
  let githubMonitor;
  let buildTracker;
  let performanceAnalyzer;
  let mockEngine;
  let originalEnv;

  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env };
    
    // Set up test environment variables
    process.env.GITHUB_TOKEN = 'test-token-123';
    process.env.GITHUB_OWNER = 'test-owner';
    process.env.GITHUB_REPO = 'test-repo';

    // Create mock engine with simple implementations
    mockEngine = {
      createPipelineRun: vi.fn().mockResolvedValue('test-run-id'),
      updatePipelineStage: vi.fn().mockResolvedValue(),
      addError: vi.fn().mockResolvedValue()
    };

    // Create monitoring components
    githubMonitor = new GitHubActionsMonitor(mockEngine, { githubMonitorInterval: 1000 });
    buildTracker = new BuildProcessTracker(mockEngine, {});
    performanceAnalyzer = new WorkflowPerformanceAnalyzer(mockEngine, {});
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('component integration', () => {
    it('should integrate GitHub monitoring with build tracking', async () => {
      // Mock GitHub API responses for initialization
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ full_name: 'test-owner/test-repo' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ workflow_runs: [] })
        });

      // Initialize components
      await githubMonitor.initialize();
      await buildTracker.initialize();

      // Mock workflow data
      const workflowRun = {
        id: 123,
        status: 'completed',
        conclusion: 'success',
        created_at: '2025-10-28T12:00:00Z',
        updated_at: '2025-10-28T12:05:00Z'
      };

      const jobs = [
        {
          id: 1,
          name: 'build-hugo-site',
          status: 'completed',
          conclusion: 'success',
          started_at: '2025-10-28T12:01:00Z',
          completed_at: '2025-10-28T12:03:00Z',
          steps: [{ name: 'Build' }]
        }
      ];

      // Mock API calls for workflow monitoring
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(workflowRun)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ jobs })
        });

      // Monitor workflow
      const monitorResult = await githubMonitor.monitorWorkflow('test-run-id', 123);
      expect(monitorResult.success).toBe(true);

      // Track build process using the same data
      const buildResult = await buildTracker.trackBuildProcess('test-run-id', workflowRun, jobs);
      expect(buildResult.success).toBe(true);
      expect(buildResult.buildAnalysis.buildJobs).toHaveLength(1);

      // Verify both components updated the pipeline
      expect(mockEngine.updatePipelineStage).toHaveBeenCalledWith(
        'test-run-id',
        'github_workflow_started',
        'running',
        expect.any(Object)
      );

      expect(mockEngine.updatePipelineStage).toHaveBeenCalledWith(
        'test-run-id',
        'build_tracking_started',
        'running',
        expect.any(Object)
      );
    });

    it('should integrate build tracking with performance analysis', async () => {
      await buildTracker.initialize();
      await performanceAnalyzer.initialize();

      const workflowRun = {
        id: 456,
        status: 'completed',
        conclusion: 'success',
        created_at: '2025-10-28T12:00:00Z',
        updated_at: '2025-10-28T12:05:00Z',
        run_started_at: '2025-10-28T12:00:30Z'
      };

      const jobs = [
        {
          id: 1,
          name: 'build-site',
          status: 'completed',
          conclusion: 'success',
          created_at: '2025-10-28T12:00:30Z',
          started_at: '2025-10-28T12:01:00Z',
          completed_at: '2025-10-28T12:03:00Z',
          steps: [{ name: 'Build' }]
        },
        {
          id: 2,
          name: 'deploy-pages',
          status: 'completed',
          conclusion: 'success',
          created_at: '2025-10-28T12:03:00Z',
          started_at: '2025-10-28T12:03:30Z',
          completed_at: '2025-10-28T12:05:00Z',
          steps: [{ name: 'Deploy' }]
        }
      ];

      // Track build process
      const buildResult = await buildTracker.trackBuildProcess('test-run-id', workflowRun, jobs);
      expect(buildResult.success).toBe(true);

      // Analyze performance using build results
      const performanceResult = await performanceAnalyzer.analyzeWorkflowPerformance(
        'test-run-id',
        workflowRun,
        jobs,
        buildResult
      );

      expect(performanceResult.timingAnalysis.totalDuration).toBe(300000); // 5 minutes
      expect(performanceResult.performanceMetrics.jobCount).toBe(2);
      expect(performanceResult.deploymentTracking.success).toBe(true);
      expect(performanceResult.overallScore).toBeGreaterThan(80);

      // Verify performance analysis used build data
      expect(performanceResult.performanceMetrics.buildTime).toBe(buildResult.totalBuildTime);
      expect(performanceResult.performanceMetrics.deploymentTime).toBe(buildResult.totalDeploymentTime);
    });

    it('should handle component failures gracefully', async () => {
      await buildTracker.initialize();
      await performanceAnalyzer.initialize();

      const workflowRun = {
        id: 789,
        status: 'completed',
        conclusion: 'failure'
      };

      const failedJobs = [
        {
          id: 1,
          name: 'build-site',
          status: 'completed',
          conclusion: 'failure',
          steps: [{ name: 'Failed Build' }]
        }
      ];

      // Track failed build
      const buildResult = await buildTracker.trackBuildProcess('test-run-id', workflowRun, failedJobs);
      expect(buildResult.success).toBe(false);

      // Performance analysis should still work with failed build
      const performanceResult = await performanceAnalyzer.analyzeWorkflowPerformance(
        'test-run-id',
        workflowRun,
        failedJobs,
        buildResult
      );

      expect(performanceResult.deploymentTracking.success).toBe(false);
      expect(performanceResult.insights.weaknesses).toContain('Low job success rate');
      expect(performanceResult.overallScore).toBeLessThan(90); // Adjusted expectation
    });
  });

  describe('data flow integration', () => {
    it('should pass data correctly between components', async () => {
      await buildTracker.initialize();
      await performanceAnalyzer.initialize();

      // Create test data that flows through components
      const workflowRun = {
        id: 999,
        status: 'completed',
        conclusion: 'success',
        created_at: '2025-10-28T12:00:00Z',
        updated_at: '2025-10-28T12:08:00Z', // 8 minutes - should trigger bottleneck
        run_started_at: '2025-10-28T12:00:30Z'
      };

      const jobs = [
        {
          id: 1,
          name: 'slow-build-job',
          status: 'completed',
          conclusion: 'success',
          created_at: '2025-10-28T12:00:30Z',
          started_at: '2025-10-28T12:01:00Z',
          completed_at: '2025-10-28T12:07:00Z', // 6 minutes - over threshold
          steps: [{ name: 'Slow Build' }]
        }
      ];

      // Track build process
      const buildResult = await buildTracker.trackBuildProcess('test-run-id', workflowRun, jobs);

      // Analyze performance
      const performanceResult = await performanceAnalyzer.analyzeWorkflowPerformance(
        'test-run-id',
        workflowRun,
        jobs,
        buildResult
      );

      // Verify data flow: build analysis affects performance analysis
      expect(buildResult.buildAnalysis.buildJobs).toHaveLength(1);
      expect(performanceResult.bottleneckAnalysis.totalBottlenecks).toBeGreaterThan(0);
      expect(performanceResult.bottleneckAnalysis.bottlenecks.some(b => b.type === 'job_duration')).toBe(true);
      expect(performanceResult.recommendations.some(r => r.type === 'optimization')).toBe(true);
    });

    it('should maintain data consistency across components', async () => {
      await buildTracker.initialize();
      await performanceAnalyzer.initialize();

      const workflowRun = {
        id: 111,
        status: 'completed',
        conclusion: 'success',
        created_at: '2025-10-28T12:00:00Z',
        updated_at: '2025-10-28T12:03:00Z'
      };

      const jobs = [
        {
          id: 1,
          name: 'build-job',
          conclusion: 'success',
          steps: [{ name: 'Step 1' }, { name: 'Step 2' }]
        },
        {
          id: 2,
          name: 'deploy-job',
          conclusion: 'success',
          steps: [{ name: 'Deploy' }]
        }
      ];

      // Process through both components
      const buildResult = await buildTracker.trackBuildProcess('test-run-id', workflowRun, jobs);
      const performanceResult = await performanceAnalyzer.analyzeWorkflowPerformance(
        'test-run-id',
        workflowRun,
        jobs,
        buildResult
      );

      // Verify consistent job counts
      expect(buildResult.buildAnalysis.totalJobs).toBe(2);
      expect(performanceResult.performanceMetrics.jobCount).toBe(2);

      // Verify consistent success status
      expect(buildResult.success).toBe(true);
      expect(performanceResult.deploymentTracking.success).toBe(true);

      // Verify step counts match
      const totalSteps = jobs.reduce((sum, job) => sum + job.steps.length, 0);
      expect(performanceResult.performanceMetrics.stepCount).toBe(totalSteps);
    });
  });

  describe('error propagation', () => {
    it('should propagate errors correctly between components', async () => {
      await buildTracker.initialize();
      await performanceAnalyzer.initialize();

      // Create invalid data to trigger errors
      const invalidWorkflowRun = null;
      const invalidJobs = [];

      // Build tracker should handle the error
      await expect(buildTracker.trackBuildProcess('test-run-id', invalidWorkflowRun, invalidJobs))
        .rejects.toThrow();

      // Performance analyzer should also handle the error
      await expect(performanceAnalyzer.analyzeWorkflowPerformance('test-run-id', invalidWorkflowRun, invalidJobs, {}))
        .rejects.toThrow();

      // Verify error reporting to engine
      expect(mockEngine.updatePipelineStage).toHaveBeenCalledWith(
        'test-run-id',
        'build_tracking_failed',
        'failed',
        expect.objectContaining({
          error: expect.any(String)
        })
      );

      expect(mockEngine.updatePipelineStage).toHaveBeenCalledWith(
        'test-run-id',
        'performance_analysis_failed',
        'failed',
        expect.objectContaining({
          error: expect.any(String)
        })
      );
    });

    it('should continue processing despite partial failures', async () => {
      await buildTracker.initialize();
      await performanceAnalyzer.initialize();

      const workflowRun = {
        id: 222,
        status: 'completed',
        conclusion: 'success'
      };

      // Empty jobs array - should not cause complete failure
      const emptyJobs = [];

      // Both components should handle empty data gracefully
      const buildResult = await buildTracker.trackBuildProcess('test-run-id', workflowRun, emptyJobs);
      expect(buildResult).toBeDefined();
      expect(buildResult.buildAnalysis.totalJobs).toBe(0);

      const performanceResult = await performanceAnalyzer.analyzeWorkflowPerformance(
        'test-run-id',
        workflowRun,
        emptyJobs,
        buildResult
      );
      expect(performanceResult).toBeDefined();
      expect(performanceResult.performanceMetrics.jobCount).toBe(0);
    });
  });

  describe('performance under load', () => {
    it('should handle multiple concurrent operations', async () => {
      await buildTracker.initialize();
      await performanceAnalyzer.initialize();

      const numberOfOperations = 10;
      const operations = [];

      // Create multiple concurrent operations
      for (let i = 0; i < numberOfOperations; i++) {
        const workflowRun = {
          id: i,
          status: 'completed',
          conclusion: 'success',
          created_at: '2025-10-28T12:00:00Z',
          updated_at: '2025-10-28T12:03:00Z'
        };

        const jobs = [
          {
            id: i,
            name: `job-${i}`,
            conclusion: 'success',
            steps: [{ name: 'Step' }]
          }
        ];

        // Add concurrent operation
        operations.push(
          buildTracker.trackBuildProcess(`run-${i}`, workflowRun, jobs)
            .then(buildResult => 
              performanceAnalyzer.analyzeWorkflowPerformance(`run-${i}`, workflowRun, jobs, buildResult)
            )
        );
      }

      const results = await Promise.all(operations);

      // All operations should complete successfully
      expect(results).toHaveLength(numberOfOperations);
      expect(results.every(result => result !== undefined)).toBe(true);
      expect(results.every(result => result.performanceMetrics.jobCount === 1)).toBe(true);
    });
  });
});