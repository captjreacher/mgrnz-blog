import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GitHubActionsMonitor } from '../../src/monitors/github-actions-monitor.js';
import { BuildProcessTracker } from '../../src/monitors/build-process-tracker.js';
import { WorkflowPerformanceAnalyzer } from '../../src/monitors/workflow-performance-analyzer.js';
import { TestCycleEngine } from '../../src/core/test-cycle-engine.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('GitHub Actions Performance Tests', () => {
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
    githubMonitor = new GitHubActionsMonitor(testEngine, { githubMonitorInterval: 100 });
    buildTracker = new BuildProcessTracker(testEngine, {});
    performanceAnalyzer = new WorkflowPerformanceAnalyzer(testEngine, {});
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('monitoring system performance', () => {
    it('should handle high-frequency workflow monitoring efficiently', async () => {
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

      const startTime = Date.now();
      const numberOfChecks = 100;

      // Mock API responses for workflow checks
      for (let i = 0; i < numberOfChecks; i++) {
        fetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ workflow_runs: [] })
        });
      }

      // Perform multiple workflow checks
      const checkPromises = [];
      for (let i = 0; i < numberOfChecks; i++) {
        checkPromises.push(githubMonitor._checkForNewWorkflowRuns());
      }

      await Promise.all(checkPromises);

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const averageTimePerCheck = totalTime / numberOfChecks;

      // Should complete all checks within reasonable time
      expect(totalTime).toBeLessThan(5000); // 5 seconds for 100 checks
      expect(averageTimePerCheck).toBeLessThan(50); // Less than 50ms per check

      console.log(`Performance: ${numberOfChecks} workflow checks completed in ${totalTime}ms (avg: ${averageTimePerCheck.toFixed(2)}ms per check)`);
    });

    it('should handle concurrent workflow monitoring without performance degradation', async () => {
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

      const numberOfConcurrentWorkflows = 20;
      const startTime = Date.now();

      // Create mock workflow data
      const workflows = Array.from({ length: numberOfConcurrentWorkflows }, (_, i) => ({
        id: i + 1,
        status: 'completed',
        conclusion: 'success',
        created_at: '2025-10-28T12:00:00Z',
        updated_at: '2025-10-28T12:05:00Z',
        run_started_at: '2025-10-28T12:00:30Z'
      }));

      const jobs = [
        {
          id: 1,
          name: 'build-hugo',
          status: 'completed',
          conclusion: 'success',
          created_at: '2025-10-28T12:00:30Z',
          started_at: '2025-10-28T12:01:00Z',
          completed_at: '2025-10-28T12:03:00Z',
          steps: [{ name: 'Build' }]
        }
      ];

      // Mock API responses for each workflow
      workflows.forEach(() => {
        fetch
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(workflows[0])
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ jobs })
          });
      });

      // Monitor all workflows concurrently
      const monitorPromises = workflows.map((workflow, index) =>
        githubMonitor.monitorWorkflow(`test-run-${index}`, workflow.id)
      );

      const results = await Promise.all(monitorPromises);

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const averageTimePerWorkflow = totalTime / numberOfConcurrentWorkflows;

      // All workflows should complete successfully
      expect(results.every(result => result.success)).toBe(true);
      
      // Should handle concurrent monitoring efficiently
      expect(totalTime).toBeLessThan(10000); // 10 seconds for 20 concurrent workflows
      expect(averageTimePerWorkflow).toBeLessThan(500); // Less than 500ms per workflow

      console.log(`Concurrency: ${numberOfConcurrentWorkflows} workflows monitored concurrently in ${totalTime}ms (avg: ${averageTimePerWorkflow.toFixed(2)}ms per workflow)`);
    });

    it('should maintain performance with large build logs', async () => {
      await buildTracker.initialize();

      // Generate large build log (simulating complex Hugo build)
      const largeBuildLog = Array.from({ length: 10000 }, (_, i) => 
        `2025-10-28T12:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}Z Step ${i + 1}: Processing file ${i + 1}.md`
      ).join('\n');

      const startTime = Date.now();

      // Analyze large build log
      const logAnalysis = buildTracker.analyzeBuildLogs(largeBuildLog);
      const timingExtraction = buildTracker.extractBuildTiming(largeBuildLog);

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Should process large logs efficiently
      expect(processingTime).toBeLessThan(1000); // Less than 1 second for 10k lines
      expect(logAnalysis.buildSteps.length).toBeGreaterThan(0);
      expect(timingExtraction.steps.length).toBeGreaterThan(0);

      console.log(`Log Analysis: ${largeBuildLog.split('\n').length} log lines processed in ${processingTime}ms`);
    });

    it('should handle memory efficiently with historical data', async () => {
      await performanceAnalyzer.initialize();

      const numberOfHistoricalRuns = 1000;
      const startTime = Date.now();

      // Add large amount of historical data
      for (let i = 0; i < numberOfHistoricalRuns; i++) {
        performanceAnalyzer._storeHistoricalData(`run-${i}`, {
          performanceMetrics: {
            totalPipelineTime: 300000 + (i * 1000),
            buildTime: 120000 + (i * 500),
            deploymentTime: 90000 + (i * 300)
          },
          deploymentTracking: { success: i % 10 !== 0 }, // 90% success rate
          bottleneckAnalysis: {
            bottlenecks: i % 5 === 0 ? [{ type: 'job_duration', stage: 'build' }] : []
          },
          timestamp: Date.now() - (i * 60000) // 1 minute apart
        });
      }

      const endTime = Date.now();
      const storageTime = endTime - startTime;

      // Should maintain memory limits (max 100 entries)
      expect(performanceAnalyzer.historicalData.size).toBe(100);
      expect(storageTime).toBeLessThan(1000); // Less than 1 second to store 1000 entries

      // Performance trend calculation should be fast
      const trendsStartTime = Date.now();
      const trends = performanceAnalyzer.getPerformanceTrends(30);
      const trendsEndTime = Date.now();
      const trendsTime = trendsEndTime - trendsStartTime;

      expect(trendsTime).toBeLessThan(100); // Less than 100ms for trend calculation
      expect(trends.totalRuns).toBe(100);

      console.log(`Memory Management: ${numberOfHistoricalRuns} entries stored in ${storageTime}ms, trends calculated in ${trendsTime}ms`);
    });
  });

  describe('load testing', () => {
    it('should handle burst of workflow events', async () => {
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

      const burstSize = 50;
      const startTime = Date.now();

      // Simulate burst of new workflow runs
      const workflowRuns = Array.from({ length: burstSize }, (_, i) => ({
        id: i + 1000,
        name: `Workflow ${i}`,
        status: 'in_progress',
        event: 'push',
        head_branch: 'main',
        head_sha: `sha${i}`,
        created_at: new Date(Date.now() + i * 1000).toISOString(), // 1 second apart
        actor: { login: 'test-user' }
      }));

      // Mock API response with burst of workflows
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ workflow_runs: workflowRuns })
      });

      // Spy on pipeline creation
      const createPipelineRunSpy = vi.spyOn(testEngine, 'createPipelineRun');
      createPipelineRunSpy.mockResolvedValue('test-run-id');

      await githubMonitor._checkForNewWorkflowRuns();

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Should handle burst efficiently
      expect(createPipelineRunSpy).toHaveBeenCalledTimes(burstSize);
      expect(processingTime).toBeLessThan(2000); // Less than 2 seconds for 50 workflows

      console.log(`Load Test: ${burstSize} workflow events processed in ${processingTime}ms`);
    });

    it('should maintain performance under sustained load', async () => {
      await buildTracker.initialize();
      await performanceAnalyzer.initialize();

      const sustainedOperations = 200;
      const startTime = Date.now();

      // Simulate sustained load of build tracking and performance analysis
      const operations = [];
      
      for (let i = 0; i < sustainedOperations; i++) {
        const workflowRun = {
          id: i,
          status: 'completed',
          conclusion: i % 10 === 0 ? 'failure' : 'success',
          created_at: '2025-10-28T12:00:00Z',
          updated_at: '2025-10-28T12:05:00Z'
        };

        const jobs = [
          {
            id: i * 2,
            name: `build-${i}`,
            status: 'completed',
            conclusion: workflowRun.conclusion,
            started_at: '2025-10-28T12:01:00Z',
            completed_at: '2025-10-28T12:03:00Z',
            steps: [{ name: 'Build' }]
          }
        ];

        // Add build tracking operation
        operations.push(
          buildTracker.trackBuildProcess(`run-${i}`, workflowRun, jobs)
            .then(buildResult => 
              performanceAnalyzer.analyzeWorkflowPerformance(`run-${i}`, workflowRun, jobs, buildResult)
            )
        );
      }

      const results = await Promise.all(operations);

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const averageTimePerOperation = totalTime / sustainedOperations;

      // All operations should complete successfully
      expect(results).toHaveLength(sustainedOperations);
      expect(results.every(result => result !== undefined)).toBe(true);

      // Should maintain reasonable performance under load
      expect(totalTime).toBeLessThan(15000); // Less than 15 seconds for 200 operations
      expect(averageTimePerOperation).toBeLessThan(75); // Less than 75ms per operation

      console.log(`Sustained Load: ${sustainedOperations} operations completed in ${totalTime}ms (avg: ${averageTimePerOperation.toFixed(2)}ms per operation)`);
    });
  });

  describe('resource utilization', () => {
    it('should monitor memory usage during extended operation', async () => {
      await performanceAnalyzer.initialize();

      const initialMemory = process.memoryUsage();
      
      // Perform memory-intensive operations
      for (let i = 0; i < 500; i++) {
        const workflowRun = {
          id: i,
          created_at: '2025-10-28T12:00:00Z',
          updated_at: '2025-10-28T12:05:00Z',
          run_started_at: '2025-10-28T12:00:30Z'
        };

        const jobs = Array.from({ length: 10 }, (_, j) => ({
          id: i * 10 + j,
          name: `job-${j}`,
          created_at: '2025-10-28T12:00:30Z',
          started_at: '2025-10-28T12:01:00Z',
          completed_at: '2025-10-28T12:03:00Z',
          steps: Array.from({ length: 5 }, (_, k) => ({ name: `step-${k}` }))
        }));

        await performanceAnalyzer.analyzeWorkflowPerformance(`run-${i}`, workflowRun, jobs, {
          totalBuildTime: 120000,
          totalDeploymentTime: 60000,
          success: true
        });

        // Force garbage collection periodically
        if (i % 100 === 0 && global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreasePercent = (memoryIncrease / initialMemory.heapUsed) * 100;

      // Memory increase should be reasonable
      expect(memoryIncreasePercent).toBeLessThan(200); // Less than 200% increase

      console.log(`Memory Usage: Initial ${Math.round(initialMemory.heapUsed / 1024 / 1024)}MB, Final ${Math.round(finalMemory.heapUsed / 1024 / 1024)}MB, Increase: ${memoryIncreasePercent.toFixed(1)}%`);
    });

    it('should handle API rate limiting gracefully', async () => {
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

      const numberOfRequests = 100;
      let rateLimitedRequests = 0;
      let successfulRequests = 0;

      // Mock API responses with some rate limiting
      for (let i = 0; i < numberOfRequests; i++) {
        if (i % 10 === 0) {
          // Simulate rate limiting every 10th request
          fetch.mockResolvedValueOnce({
            ok: false,
            status: 403,
            statusText: 'Rate limit exceeded'
          });
        } else {
          fetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ id: i, status: 'completed' })
          });
        }
      }

      const startTime = Date.now();

      // Make multiple API requests
      const requests = [];
      for (let i = 0; i < numberOfRequests; i++) {
        requests.push(
          githubMonitor._makeGitHubRequest(`/actions/runs/${i}`)
            .then(() => {
              successfulRequests++;
            })
            .catch((error) => {
              if (error.message.includes('403')) {
                rateLimitedRequests++;
              }
            })
        );
      }

      await Promise.allSettled(requests);

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Should handle rate limiting gracefully
      expect(rateLimitedRequests).toBeGreaterThan(0);
      expect(successfulRequests).toBeGreaterThan(0);
      expect(successfulRequests + rateLimitedRequests).toBe(numberOfRequests);
      expect(totalTime).toBeLessThan(5000); // Should not hang on rate limits

      console.log(`Rate Limiting: ${successfulRequests} successful, ${rateLimitedRequests} rate limited out of ${numberOfRequests} requests in ${totalTime}ms`);
    });
  });

  describe('scalability testing', () => {
    it('should scale with increasing workflow complexity', async () => {
      await buildTracker.initialize();
      await performanceAnalyzer.initialize();

      const complexityLevels = [10, 50, 100, 200]; // Number of jobs per workflow
      const results = [];

      for (const jobCount of complexityLevels) {
        const startTime = Date.now();

        const workflowRun = {
          id: jobCount,
          status: 'completed',
          conclusion: 'success',
          created_at: '2025-10-28T12:00:00Z',
          updated_at: '2025-10-28T12:10:00Z'
        };

        // Create complex workflow with many jobs
        const jobs = Array.from({ length: jobCount }, (_, i) => ({
          id: i,
          name: `job-${i}`,
          status: 'completed',
          conclusion: 'success',
          started_at: '2025-10-28T12:01:00Z',
          completed_at: '2025-10-28T12:03:00Z',
          steps: Array.from({ length: 5 }, (_, j) => ({ name: `step-${j}` }))
        }));

        const buildResult = await buildTracker.trackBuildProcess(`complex-run-${jobCount}`, workflowRun, jobs);
        const performanceResult = await performanceAnalyzer.analyzeWorkflowPerformance(
          `complex-run-${jobCount}`,
          workflowRun,
          jobs,
          buildResult
        );

        const endTime = Date.now();
        const processingTime = endTime - startTime;

        results.push({
          jobCount,
          processingTime,
          success: buildResult.success && performanceResult !== undefined
        });

        expect(buildResult.success).toBe(true);
        expect(performanceResult.performanceMetrics.jobCount).toBe(jobCount);
      }

      // Processing time should scale reasonably with complexity
      for (let i = 1; i < results.length; i++) {
        const current = results[i];
        const previous = results[i - 1];
        const scalingFactor = current.processingTime / previous.processingTime;
        const complexityFactor = current.jobCount / previous.jobCount;

        // Processing time should not scale worse than O(n^2)
        expect(scalingFactor).toBeLessThan(complexityFactor * complexityFactor);
      }

      console.log('Scalability Results:');
      results.forEach(result => {
        console.log(`  ${result.jobCount} jobs: ${result.processingTime}ms (${(result.processingTime / result.jobCount).toFixed(2)}ms per job)`);
      });
    });

    it('should handle multiple monitoring instances', async () => {
      const numberOfInstances = 5;
      const instances = [];

      // Create multiple monitoring instances
      for (let i = 0; i < numberOfInstances; i++) {
        const engine = new TestCycleEngine({});
        const monitor = new GitHubActionsMonitor(engine, { githubMonitorInterval: 100 });
        const tracker = new BuildProcessTracker(engine, {});
        const analyzer = new WorkflowPerformanceAnalyzer(engine, {});

        instances.push({ monitor, tracker, analyzer });
      }

      // Mock GitHub API responses for all instances
      for (let i = 0; i < numberOfInstances; i++) {
        fetch
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ full_name: 'test-owner/test-repo' })
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ workflow_runs: [] })
          });
      }

      const startTime = Date.now();

      // Initialize all instances concurrently
      const initPromises = instances.map(async (instance, index) => {
        await instance.monitor.initialize();
        await instance.tracker.initialize();
        await instance.analyzer.initialize();
        return index;
      });

      const initResults = await Promise.all(initPromises);

      const endTime = Date.now();
      const initTime = endTime - startTime;

      // All instances should initialize successfully
      expect(initResults).toHaveLength(numberOfInstances);
      expect(initTime).toBeLessThan(2000); // Less than 2 seconds for 5 instances

      console.log(`Multi-Instance: ${numberOfInstances} monitoring instances initialized in ${initTime}ms`);
    });
  });
});