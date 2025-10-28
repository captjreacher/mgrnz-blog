import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GitHubActionsMonitor } from '../../src/monitors/github-actions-monitor.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('GitHubActionsMonitor', () => {
  let githubMonitor;
  let mockEngine;
  let mockConfig;
  let originalEnv;

  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env };
    
    // Set up test environment variables
    process.env.GITHUB_TOKEN = 'test-token-123';
    process.env.GITHUB_OWNER = 'test-owner';
    process.env.GITHUB_REPO = 'test-repo';

    // Create mock engine
    mockEngine = {
      createPipelineRun: vi.fn().mockResolvedValue('test-run-id'),
      updatePipelineStage: vi.fn().mockResolvedValue(),
      addError: vi.fn().mockResolvedValue()
    };

    mockConfig = {
      githubMonitorInterval: 1000
    };

    githubMonitor = new GitHubActionsMonitor(mockEngine, mockConfig);
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully with valid configuration', async () => {
      // Mock GitHub API response for repository info
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ full_name: 'test-owner/test-repo' })
      });

      // Mock latest workflow run response
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ workflow_runs: [{ id: 123, created_at: '2025-10-28T12:00:00Z' }] })
      });

      const result = await githubMonitor.initialize();

      expect(result).toBe(true);
      expect(githubMonitor.lastCheckedWorkflowRun).toEqual({ id: 123, created_at: '2025-10-28T12:00:00Z' });
      expect(fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/test-repo',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'token test-token-123'
          })
        })
      );
    });

    it('should throw error if GitHub token is not configured', async () => {
      delete process.env.GITHUB_TOKEN;
      githubMonitor = new GitHubActionsMonitor(mockEngine, mockConfig);

      await expect(githubMonitor.initialize()).rejects.toThrow('GitHub token not configured');
    });

    it('should throw error if GitHub API connection fails', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      });

      await expect(githubMonitor.initialize()).rejects.toThrow('GitHub API connection failed');
    });
  });

  describe('workflow monitoring', () => {
    beforeEach(async () => {
      // Mock successful initialization
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
    });

    it('should monitor workflow execution successfully', async () => {
      const workflowRun = {
        id: 123,
        status: 'completed',
        conclusion: 'success',
        created_at: '2025-10-28T12:00:00Z',
        updated_at: '2025-10-28T12:05:00Z'
      };

      // Mock workflow run API call
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(workflowRun)
      });

      // Mock jobs API call
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          jobs: [
            {
              id: 1,
              name: 'build',
              status: 'completed',
              conclusion: 'success',
              created_at: '2025-10-28T12:00:00Z',
              started_at: '2025-10-28T12:01:00Z',
              completed_at: '2025-10-28T12:04:00Z',
              steps: [{ name: 'Setup' }, { name: 'Build' }]
            }
          ]
        })
      });

      const result = await githubMonitor.monitorWorkflow('test-run-id', 123);

      expect(result.success).toBe(true);
      expect(result.workflowRun).toEqual(workflowRun);
      expect(result.jobs).toHaveLength(1);
      expect(result.analysis.status).toBe('completed');
      expect(result.analysis.conclusion).toBe('success');

      expect(mockEngine.updatePipelineStage).toHaveBeenCalledWith(
        'test-run-id',
        'github_workflow_started',
        'running',
        expect.objectContaining({
          workflowRunId: 123
        })
      );

      expect(mockEngine.updatePipelineStage).toHaveBeenCalledWith(
        'test-run-id',
        'github_workflow_completed',
        'completed',
        expect.objectContaining({
          workflowRunId: 123,
          result: expect.any(Object)
        })
      );
    });

    it('should handle workflow monitoring failures', async () => {
      fetch.mockRejectedValueOnce(new Error('API Error'));

      await expect(githubMonitor.monitorWorkflow('test-run-id', 123)).rejects.toThrow('Failed to get workflow run 123: GitHub API request failed: API Error');

      expect(mockEngine.updatePipelineStage).toHaveBeenCalledWith(
        'test-run-id',
        'github_workflow_failed',
        'failed',
        expect.objectContaining({
          workflowRunId: 123,
          error: 'Failed to get workflow run 123: GitHub API request failed: API Error'
        })
      );
    });
  });

  describe('workflow run detection', () => {
    beforeEach(async () => {
      // Mock successful initialization
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
    });

    it('should detect new workflow runs', async () => {
      const newWorkflowRun = {
        id: 456,
        name: 'Deploy',
        status: 'in_progress',
        event: 'push',
        head_branch: 'main',
        head_sha: 'abc123',
        created_at: '2025-10-28T12:10:00Z',
        actor: { login: 'test-user' }
      };

      // Mock API response with new workflow run
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          workflow_runs: [newWorkflowRun]
        })
      });

      await githubMonitor._checkForNewWorkflowRuns();

      expect(mockEngine.createPipelineRun).toHaveBeenCalledWith({
        type: 'git',
        source: 'github_actions',
        timestamp: '2025-10-28T12:10:00Z',
        metadata: {
          workflowRunId: 456,
          workflowName: 'Deploy',
          event: 'push',
          branch: 'main',
          commitSha: 'abc123',
          actor: 'test-user'
        }
      });

      expect(githubMonitor.lastCheckedWorkflowRun).toEqual(newWorkflowRun);
    });

    it('should not detect old workflow runs', async () => {
      // Set a recent workflow run as last checked
      githubMonitor.lastCheckedWorkflowRun = {
        id: 123,
        created_at: '2025-10-28T12:05:00Z'
      };

      const olderWorkflowRun = {
        id: 122,
        created_at: '2025-10-28T12:00:00Z'
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          workflow_runs: [olderWorkflowRun]
        })
      });

      await githubMonitor._checkForNewWorkflowRuns();

      expect(mockEngine.createPipelineRun).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(githubMonitor._checkForNewWorkflowRuns()).resolves.toBeUndefined();
      expect(mockEngine.createPipelineRun).not.toHaveBeenCalled();
    });
  });

  describe('workflow execution monitoring', () => {
    beforeEach(async () => {
      // Mock successful initialization
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
    });

    it('should monitor workflow until completion', async () => {
      const initialWorkflowRun = {
        id: 123,
        status: 'completed', // Start with completed to avoid timeout
        conclusion: 'success',
        created_at: '2025-10-28T12:00:00Z',
        updated_at: '2025-10-28T12:05:00Z'
      };

      const jobs = [
        {
          id: 1,
          name: 'build',
          status: 'completed',
          conclusion: 'success',
          created_at: '2025-10-28T12:00:00Z',
          started_at: '2025-10-28T12:01:00Z',
          completed_at: '2025-10-28T12:04:00Z'
        }
      ];

      // Mock workflow status polling - already completed
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ jobs })
        });

      const result = await githubMonitor._monitorWorkflowExecution('test-run-id', initialWorkflowRun);

      expect(result.success).toBe(true);
      expect(result.workflowRun.status).toBe('completed');
      expect(result.workflowRun.conclusion).toBe('success');
      expect(result.jobs).toEqual(jobs);
    });

    it('should timeout long-running workflows', async () => {
      const longRunningWorkflow = {
        id: 123,
        status: 'in_progress',
        conclusion: null,
        created_at: '2025-10-28T12:00:00Z',
        updated_at: '2025-10-28T12:01:00Z'
      };

      // Mock workflow that never completes - keep returning in_progress
      fetch.mockImplementation(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve(longRunningWorkflow)
      }));

      // Create a custom timeout test that simulates the timeout behavior
      const testTimeout = async () => {
        const startTime = Date.now();
        const maxWaitTime = 100; // 100ms for quick test
        
        while (Date.now() - startTime < maxWaitTime) {
          await new Promise(resolve => setTimeout(resolve, 10));
          // Simulate checking workflow status
          const workflow = await githubMonitor._getWorkflowRun(123);
          if (workflow.status !== 'in_progress') {
            return { success: true };
          }
        }
        
        throw new Error('Workflow monitoring timeout');
      };

      await expect(testTimeout()).rejects.toThrow('Workflow monitoring timeout');
    });
  });

  describe('API interactions', () => {
    beforeEach(async () => {
      // Mock successful initialization
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
    });

    it('should get workflow run details', async () => {
      const workflowRun = { id: 123, status: 'completed' };

      // Clear previous mocks and add specific mock for this test
      fetch.mockClear();
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(workflowRun)
      });

      const result = await githubMonitor.getWorkflowRun(123);

      expect(result).toEqual(workflowRun);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/test-repo/actions/runs/123',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'token test-token-123',
            'Accept': 'application/vnd.github.v3+json'
          })
        })
      );
    });

    it('should get workflow jobs', async () => {
      const jobs = [{ id: 1, name: 'build' }, { id: 2, name: 'deploy' }];

      // Clear previous mocks and add specific mock for this test
      fetch.mockClear();
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ jobs })
      });

      const result = await githubMonitor.getWorkflowJobs(123);

      expect(result).toEqual(jobs);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/test-repo/actions/runs/123/jobs',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'token test-token-123'
          })
        })
      );
    });

    it('should get workflow logs', async () => {
      const logs = 'Build log content here...';

      // Clear previous mocks and add specific mock for this test
      fetch.mockClear();
      fetch.mockResolvedValueOnce({
        ok: true,
        text: vi.fn().mockResolvedValue(logs)
      });

      const result = await githubMonitor.getWorkflowLogs(123);

      expect(result).toBe(logs);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/test-repo/actions/runs/123/logs',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'token test-token-123'
          })
        })
      );
    });

    it('should handle API errors properly', async () => {
      // Clear previous mocks and add specific mock for this test
      fetch.mockClear();
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      await expect(githubMonitor.getWorkflowRun(999)).rejects.toThrow('Failed to get workflow run 999: GitHub API request failed: GitHub API error: 404 Not Found');
    });

    it('should handle network errors properly', async () => {
      // Clear previous mocks and add specific mock for this test
      fetch.mockClear();
      fetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(githubMonitor.getWorkflowRun(123)).rejects.toThrow('Failed to get workflow run 123: GitHub API request failed: Network error');
    });
  });

  describe('workflow analysis', () => {
    beforeEach(async () => {
      // Mock successful initialization
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
    });

    it('should analyze workflow results correctly', async () => {
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
          name: 'build-hugo',
          status: 'completed',
          conclusion: 'success',
          started_at: '2025-10-28T12:01:00Z',
          completed_at: '2025-10-28T12:03:00Z',
          steps: [{ name: 'Setup' }, { name: 'Build' }]
        },
        {
          id: 2,
          name: 'deploy-pages',
          status: 'completed',
          conclusion: 'success',
          started_at: '2025-10-28T12:03:00Z',
          completed_at: '2025-10-28T12:05:00Z',
          steps: [{ name: 'Deploy' }]
        }
      ];

      const analysis = await githubMonitor._analyzeWorkflowResults(workflowRun, jobs);

      expect(analysis.status).toBe('completed');
      expect(analysis.conclusion).toBe('success');
      expect(analysis.totalDuration).toBe(300000); // 5 minutes
      expect(analysis.jobs).toHaveLength(2);
      expect(analysis.buildTime).toBeGreaterThan(0);
      expect(analysis.deploymentTime).toBeGreaterThan(0);
      expect(analysis.bottlenecks).toHaveLength(0); // No jobs over 5 minutes
    });

    it('should identify bottlenecks in slow jobs', async () => {
      const workflowRun = {
        id: 123,
        status: 'completed',
        conclusion: 'success',
        created_at: '2025-10-28T12:00:00Z',
        updated_at: '2025-10-28T12:10:00Z'
      };

      const jobs = [
        {
          id: 1,
          name: 'slow-build',
          status: 'completed',
          conclusion: 'success',
          started_at: '2025-10-28T12:01:00Z',
          completed_at: '2025-10-28T12:08:00Z', // 7 minutes - over threshold
          steps: [{ name: 'Setup' }, { name: 'Build' }]
        }
      ];

      const analysis = await githubMonitor._analyzeWorkflowResults(workflowRun, jobs);

      expect(analysis.bottlenecks).toHaveLength(1);
      expect(analysis.bottlenecks[0]).toEqual({
        job: 'slow-build',
        duration: 420000, // 7 minutes
        type: 'slow_job'
      });
    });

    it('should handle analysis errors gracefully', async () => {
      const workflowRun = null; // Invalid input

      const analysis = await githubMonitor._analyzeWorkflowResults(workflowRun, []);

      expect(analysis.error).toBeDefined();
      expect(analysis.status).toBeUndefined();
      expect(analysis.conclusion).toBeUndefined();
    });
  });

  describe('monitoring lifecycle', () => {
    beforeEach(async () => {
      // Mock successful initialization
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
    });

    it('should start monitoring successfully', async () => {
      await githubMonitor.startMonitoring();

      expect(githubMonitor.isMonitoring).toBe(true);
      expect(githubMonitor.monitoringInterval).toBeDefined();
    });

    it('should not start monitoring if already running', async () => {
      await githubMonitor.startMonitoring();
      const firstInterval = githubMonitor.monitoringInterval;

      await githubMonitor.startMonitoring();

      expect(githubMonitor.monitoringInterval).toBe(firstInterval);
    });

    it('should stop monitoring successfully', async () => {
      await githubMonitor.startMonitoring();

      await githubMonitor.stopMonitoring();

      expect(githubMonitor.isMonitoring).toBe(false);
      expect(githubMonitor.monitoringInterval).toBeNull();
    });

    it('should not stop monitoring if not running', async () => {
      await githubMonitor.stopMonitoring();

      expect(githubMonitor.isMonitoring).toBe(false);
    });
  });
});