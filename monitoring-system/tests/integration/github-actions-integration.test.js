import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GitHubActionsMonitor } from '../../src/monitors/github-actions-monitor.js';
import { BuildProcessTracker } from '../../src/monitors/build-process-tracker.js';
import { WorkflowPerformanceAnalyzer } from '../../src/monitors/workflow-performance-analyzer.js';
import { TestCycleEngine } from '../../src/core/test-cycle-engine.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('GitHub Actions Integration Tests', () => {
  let githubMonitor;
  let buildTracker;
  let performanceAnalyzer;
  let testEngine;
  let originalEnv;

  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env };
    
    // Set up test environment variables
    process.env.GITHUB_TOKEN = 'test-token-123';
    process.env.GITHUB_OWNER = 'test-owner';
    process.env.GITHUB_REPO = 'test-repo';

    // Create test engine
    testEngine = new TestCycleEngine({});

    // Create monitoring components
    githubMonitor = new GitHubActionsMonitor(testEngine, { githubMonitorInterval: 1000 });
    buildTracker = new BuildProcessTracker(testEngine, {});
    performanceAnalyzer = new WorkflowPerformanceAnalyzer(testEngine, {});
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('end-to-end workflow monitoring', () => {
    it('should monitor complete workflow from trigger to analysis', async () => {
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

      // Initialize all components
      await githubMonitor.initialize();
      await buildTracker.initialize();
      await performanceAnalyzer.initialize();

      // Mock workflow run data
      const workflowRun = {
        id: 123,
        name: 'Deploy Blog',
        status: 'completed',
        conclusion: 'success',
        created_at: '2025-10-28T12:00:00Z',
        updated_at: '2025-10-28T12:05:00Z',
        run_started_at: '2025-10-28T12:00:30Z',
        event: 'push',
        head_branch: 'main',
        head_sha: 'abc123',
        actor: { login: 'test-user' }
      };

      const jobs = [
        {
          id: 1,
          name: 'build-hugo-site',
          status: 'completed',
          conclusion: 'success',
          created_at: '2025-10-28T12:00:30Z',
          started_at: '2025-10-28T12:01:00Z',
          completed_at: '2025-10-28T12:03:00Z',
          steps: [
            { name: 'Checkout code' },
            { name: 'Setup Hugo' },
            { name: 'Build site' }
          ]
        },
        {
          id: 2,
          name: 'deploy-to-pages',
          status: 'completed',
          conclusion: 'success',
          created_at: '2025-10-28T12:03:00Z',
          started_at: '2025-10-28T12:03:30Z',
          completed_at: '2025-10-28T12:05:00Z',
          steps: [
            { name: 'Deploy to GitHub Pages' }
          ]
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

      // Start monitoring workflow
      const monitorResult = await githubMonitor.monitorWorkflow('test-run-id', 123);

      expect(monitorResult.success).toBe(true);
      expect(monitorResult.workflowRun).toEqual(workflowRun);
      expect(monitorResult.jobs).toEqual(jobs);

      // Track build process
      const buildResult = await buildTracker.trackBuildProcess('test-run-id', workflowRun, jobs);

      expect(buildResult.success).toBe(true);
      expect(buildResult.buildAnalysis.buildJobs).toHaveLength(1);
      expect(buildResult.buildAnalysis.deployJobs).toHaveLength(1);
      expect(buildResult.logAnalysis.buildSteps).toHaveLength(5); // Simulated Hugo steps

      // Analyze performance
      const performanceResult = await performanceAnalyzer.analyzeWorkflowPerformance(
        'test-run-id', 
        workflowRun, 
        jobs, 
        buildResult
      );

      expect(performanceResult.timingAnalysis.totalDuration).toBe(300000); // 5 minutes
      expect(performanceResult.performanceMetrics.jobCount).toBe(2);
      expect(performanceResult.deploymentTracking.success).toBe(true);
      expect(performanceResult.overallScore).toBeGreaterThan(80); // Should be high for successful workflow
    });

    it('should handle workflow failures across all components', async () => {
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

      await githubMonitor.initialize();
      await buildTracker.initialize();
      await performanceAnalyzer.initialize();

      // Mock failed workflow run
      const failedWorkflowRun = {
        id: 456,
        name: 'Deploy Blog',
        status: 'completed',
        conclusion: 'failure',
        created_at: '2025-10-28T12:00:00Z',
        updated_at: '2025-10-28T12:03:00Z',
        run_started_at: '2025-10-28T12:00:30Z'
      };

      const failedJobs = [
        {
          id: 1,
          name: 'build-hugo-site',
          status: 'completed',
          conclusion: 'failure',
          created_at: '2025-10-28T12:00:30Z',
          started_at: '2025-10-28T12:01:00Z',
          completed_at: '2025-10-28T12:03:00Z',
          steps: [{ name: 'Build failed' }]
        }
      ];

      // Mock API calls
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(failedWorkflowRun)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ jobs: failedJobs })
        });

      // Monitor failed workflow
      const monitorResult = await githubMonitor.monitorWorkflow('test-run-id', 456);
      expect(monitorResult.success).toBe(false);

      // Track failed build
      const buildResult = await buildTracker.trackBuildProcess('test-run-id', failedWorkflowRun, failedJobs);
      expect(buildResult.success).toBe(false);
      expect(buildResult.buildAnalysis.errors).toHaveLength(1);

      // Analyze failed performance
      const performanceResult = await performanceAnalyzer.analyzeWorkflowPerformance(
        'test-run-id', 
        failedWorkflowRun, 
        failedJobs, 
        buildResult
      );

      expect(performanceResult.deploymentTracking.success).toBe(false);
      expect(performanceResult.insights.weaknesses).toContain('Low job success rate');
      expect(performanceResult.overallScore).toBeLessThan(50);
    });
  });

  describe('workflow detection and automatic monitoring', () => {
    it('should detect new workflows and start monitoring automatically', async () => {
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

      await githubMonitor.initialize();

      // Mock new workflow detection
      const newWorkflowRun = {
        id: 789,
        name: 'Deploy Blog',
        status: 'in_progress',
        event: 'push',
        head_branch: 'main',
        head_sha: 'def456',
        created_at: '2025-10-28T12:10:00Z',
        actor: { login: 'test-user' }
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          workflow_runs: [newWorkflowRun]
        })
      });

      // Spy on engine methods
      const createPipelineRunSpy = vi.spyOn(testEngine, 'createPipelineRun');
      createPipelineRunSpy.mockResolvedValue('new-run-id');

      // Check for new workflow runs
      await githubMonitor._checkForNewWorkflowRuns();

      expect(createPipelineRunSpy).toHaveBeenCalledWith({
        type: 'git',
        source: 'github_actions',
        timestamp: '2025-10-28T12:10:00Z',
        metadata: {
          workflowRunId: 789,
          workflowName: 'Deploy Blog',
          event: 'push',
          branch: 'main',
          commitSha: 'def456',
          actor: 'test-user'
        }
      });

      expect(githubMonitor.lastCheckedWorkflowRun).toEqual(newWorkflowRun);
    });

    it('should handle GitHub API errors during workflow detection', async () => {
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

      await githubMonitor.initialize();

      // Mock API error
      fetch.mockRejectedValueOnce(new Error('GitHub API rate limit exceeded'));

      // Should not throw error
      await expect(githubMonitor._checkForNewWorkflowRuns()).resolves.toBeUndefined();

      // Should not create pipeline run on error
      const createPipelineRunSpy = vi.spyOn(testEngine, 'createPipelineRun');
      expect(createPipelineRunSpy).not.toHaveBeenCalled();
    });
  });

  describe('build log analysis integration', () => {
    it('should analyze Hugo build logs with timing extraction', async () => {
      await buildTracker.initialize();

      const hugoBuildLogs = `
        2025-10-28T12:01:00Z Starting Hugo build process
        2025-10-28T12:01:15Z hugo: Building site for production
        2025-10-28T12:01:30Z hugo: Processing 45 pages
        2025-10-28T12:01:45Z hugo: Generating static files
        2025-10-28T12:02:00Z hugo: Build completed in 1.2s
        2025-10-28T12:02:15Z Optimizing CSS and JS assets
        2025-10-28T12:02:30Z Build process completed successfully
      `;

      const logAnalysis = buildTracker.analyzeBuildLogs(hugoBuildLogs);
      const timing = buildTracker.extractBuildTiming(hugoBuildLogs);

      expect(logAnalysis.success).toBe(true);
      expect(logAnalysis.buildSteps.length).toBeGreaterThan(0);
      expect(logAnalysis.errors).toHaveLength(0);
      expect(logAnalysis.performance.totalSteps).toBeGreaterThan(0);

      expect(timing.buildTime).toBeGreaterThan(0);
      expect(timing.totalTime).toBeGreaterThan(0);
    });

    it('should detect and categorize build errors', async () => {
      await buildTracker.initialize();

      const errorLogs = `
        2025-10-28T12:01:00Z Starting Hugo build process
        2025-10-28T12:01:15Z ERROR: Failed to parse template at layouts/index.html
        2025-10-28T12:01:30Z WARNING: Deprecated shortcode usage detected
        2025-10-28T12:01:45Z ERROR: Missing required front matter in content/posts/test.md
        2025-10-28T12:02:00Z Build failed with 2 errors and 1 warning
      `;

      const logAnalysis = buildTracker.analyzeBuildLogs(errorLogs);

      expect(logAnalysis.success).toBe(false);
      expect(logAnalysis.errors.length).toBe(3); // 2 ERROR lines + 1 "failed" line
      expect(logAnalysis.warnings.length).toBe(1);
      expect(logAnalysis.errors[0].type).toBe('build_error');
      expect(logAnalysis.warnings[0].type).toBe('build_warning');
    });
  });

  describe('performance bottleneck detection integration', () => {
    it('should identify bottlenecks across workflow stages', async () => {
      await performanceAnalyzer.initialize();

      // Create workflow with multiple bottlenecks
      const slowWorkflowRun = {
        id: 999,
        created_at: '2025-10-28T12:00:00Z',
        updated_at: '2025-10-28T12:20:00Z', // 20 minutes - over threshold
        run_started_at: '2025-10-28T12:05:00Z' // 5 minute queue time - over threshold
      };

      const slowJobs = [
        {
          id: 1,
          name: 'slow-build-job',
          created_at: '2025-10-28T12:05:00Z',
          started_at: '2025-10-28T12:06:00Z',
          completed_at: '2025-10-28T12:15:00Z', // 9 minutes - over 5 minute threshold
          steps: [{ name: 'Slow build' }]
        },
        {
          id: 2,
          name: 'normal-deploy-job',
          created_at: '2025-10-28T12:15:00Z',
          started_at: '2025-10-28T12:15:30Z',
          completed_at: '2025-10-28T12:17:00Z', // 1.5 minutes - under threshold
          steps: [{ name: 'Deploy' }]
        }
      ];

      const buildAnalysis = {
        totalBuildTime: 540000, // 9 minutes
        totalDeploymentTime: 90000, // 1.5 minutes
        success: true
      };

      const result = await performanceAnalyzer.analyzeWorkflowPerformance(
        'test-run-id',
        slowWorkflowRun,
        slowJobs,
        buildAnalysis
      );

      // Should identify multiple bottlenecks
      expect(result.bottleneckAnalysis.totalBottlenecks).toBeGreaterThan(2);
      expect(result.bottleneckAnalysis.bottlenecks.some(b => b.type === 'workflow_duration')).toBe(true);
      expect(result.bottleneckAnalysis.bottlenecks.some(b => b.type === 'queue_time')).toBe(true);
      expect(result.bottleneckAnalysis.bottlenecks.some(b => b.type === 'job_duration')).toBe(true);

      // Should generate appropriate recommendations
      expect(result.recommendations.some(r => r.type === 'optimization')).toBe(true);
      expect(result.recommendations.some(r => r.type === 'infrastructure')).toBe(true);

      // Should have lower performance score
      expect(result.overallScore).toBeLessThan(70);
    });

    it('should track performance trends over multiple runs', async () => {
      await performanceAnalyzer.initialize();

      // Simulate multiple workflow runs with varying performance
      const workflowRuns = [
        {
          id: 1,
          created_at: '2025-10-28T10:00:00Z',
          updated_at: '2025-10-28T10:05:00Z' // 5 minutes
        },
        {
          id: 2,
          created_at: '2025-10-28T11:00:00Z',
          updated_at: '2025-10-28T11:04:00Z' // 4 minutes - improving
        },
        {
          id: 3,
          created_at: '2025-10-28T12:00:00Z',
          updated_at: '2025-10-28T12:03:30Z' // 3.5 minutes - improving
        }
      ];

      // Analyze each run and store historical data
      for (const workflowRun of workflowRuns) {
        const result = await performanceAnalyzer.analyzeWorkflowPerformance(
          `test-run-${workflowRun.id}`,
          workflowRun,
          [],
          { totalBuildTime: 120000, totalDeploymentTime: 60000, success: true }
        );

        // Historical data should be stored automatically
        expect(performanceAnalyzer.historicalData.has(workflowRun.id)).toBe(true);
      }

      // Get performance trends
      const trends = performanceAnalyzer.getPerformanceTrends(1); // Last 1 day

      expect(trends.totalRuns).toBe(3);
      expect(trends.averageDuration).toBeGreaterThan(0);
      expect(trends.trends.duration).toBe('improving'); // Should detect improving trend
    });
  });

  describe('error handling and resilience', () => {
    it('should handle partial failures gracefully', async () => {
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

      await githubMonitor.initialize();
      await buildTracker.initialize();
      await performanceAnalyzer.initialize();

      const workflowRun = {
        id: 123,
        status: 'completed',
        conclusion: 'success',
        created_at: '2025-10-28T12:00:00Z',
        updated_at: '2025-10-28T12:05:00Z'
      };

      // Mock successful workflow monitoring
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(workflowRun)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ jobs: [] })
        });

      const monitorResult = await githubMonitor.monitorWorkflow('test-run-id', 123);
      expect(monitorResult.success).toBe(true);

      // Build tracking should succeed even with empty jobs
      const buildResult = await buildTracker.trackBuildProcess('test-run-id', workflowRun, []);
      expect(buildResult).toBeDefined();
      expect(buildResult.buildAnalysis.totalJobs).toBe(0);

      // Performance analysis should handle empty data
      const performanceResult = await performanceAnalyzer.analyzeWorkflowPerformance(
        'test-run-id',
        workflowRun,
        [],
        buildResult
      );
      expect(performanceResult).toBeDefined();
      expect(performanceResult.performanceMetrics.jobCount).toBe(0);
    });

    it('should continue monitoring after individual component failures', async () => {
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

      await githubMonitor.initialize();
      await buildTracker.initialize();
      await performanceAnalyzer.initialize();

      // Mock workflow monitoring failure
      fetch.mockRejectedValueOnce(new Error('GitHub API error'));

      await expect(githubMonitor.monitorWorkflow('test-run-id', 123)).rejects.toThrow('GitHub API error');

      // Other components should still be functional
      const workflowRun = {
        id: 456,
        status: 'completed',
        conclusion: 'success'
      };

      const buildResult = await buildTracker.trackBuildProcess('test-run-id-2', workflowRun, []);
      expect(buildResult).toBeDefined();

      const performanceResult = await performanceAnalyzer.analyzeWorkflowPerformance(
        'test-run-id-2',
        workflowRun,
        [],
        buildResult
      );
      expect(performanceResult).toBeDefined();
    });
  });

  describe('monitoring lifecycle integration', () => {
    it('should coordinate monitoring lifecycle across components', async () => {
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

      // Initialize all components
      const initResults = await Promise.all([
        githubMonitor.initialize(),
        buildTracker.initialize(),
        performanceAnalyzer.initialize()
      ]);

      expect(initResults.every(result => result === true)).toBe(true);

      // Start GitHub monitoring
      await githubMonitor.startMonitoring();
      expect(githubMonitor.isMonitoring).toBe(true);

      // Stop monitoring
      await githubMonitor.stopMonitoring();
      expect(githubMonitor.isMonitoring).toBe(false);
    });

    it('should handle concurrent workflow monitoring', async () => {
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

      await githubMonitor.initialize();
      await buildTracker.initialize();
      await performanceAnalyzer.initialize();

      // Mock multiple concurrent workflows
      const workflows = [
        { id: 1, status: 'completed', conclusion: 'success' },
        { id: 2, status: 'completed', conclusion: 'success' },
        { id: 3, status: 'completed', conclusion: 'failure' }
      ];

      // Mock API responses for each workflow
      workflows.forEach((workflow, index) => {
        fetch
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(workflow)
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ jobs: [] })
          });
      });

      // Monitor workflows concurrently
      const monitorPromises = workflows.map((workflow, index) =>
        githubMonitor.monitorWorkflow(`test-run-${index}`, workflow.id)
      );

      const results = await Promise.all(monitorPromises);

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(results[2].success).toBe(false);
    });
  });
});