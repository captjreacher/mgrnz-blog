/**
 * GitHubActionsMonitor class for tracking GitHub Actions workflow execution
 * Monitors workflow status, build processes, and deployment tracking
 */
export class GitHubActionsMonitor {
  constructor(testCycleEngine, config = {}) {
    this.engine = testCycleEngine;
    this.config = config;
    this.githubToken = process.env.GITHUB_TOKEN;
    this.githubOwner = process.env.GITHUB_OWNER || 'captjreacher';
    this.githubRepo = process.env.GITHUB_REPO || 'mgrnz-blog';
    this.baseUrl = `https://api.github.com/repos/${this.githubOwner}/${this.githubRepo}`;
    this.isMonitoring = false;
    this.monitoringInterval = null;
    this.lastCheckedWorkflowRun = null;
  }

  /**
   * Initialize the GitHub Actions monitor
   */
  async initialize() {
    try {
      if (!this.githubToken) {
        throw new Error('GitHub token not configured. Set GITHUB_TOKEN environment variable.');
      }

      // Test GitHub API connectivity
      await this._testGitHubConnection();
      
      // Get the latest workflow run to start monitoring from
      this.lastCheckedWorkflowRun = await this._getLatestWorkflowRun();
      
      console.log('GitHubActionsMonitor initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize GitHubActionsMonitor:', error.message);
      throw error;
    }
  }

  /**
   * Start monitoring GitHub Actions workflows
   */
  async startMonitoring() {
    if (this.isMonitoring) {
      console.log('GitHubActionsMonitor is already running');
      return;
    }

    this.isMonitoring = true;
    console.log('Starting GitHub Actions workflow monitoring...');

    // Start periodic workflow monitoring
    const interval = this.config.githubMonitorInterval || 60000; // 1 minute
    this.monitoringInterval = setInterval(() => {
      this._checkForNewWorkflowRuns();
    }, interval);

    console.log('GitHub Actions monitoring started');
  }

  /**
   * Stop monitoring GitHub Actions workflows
   */
  async stopMonitoring() {
    if (!this.isMonitoring) {
      console.log('GitHubActionsMonitor is not running');
      return;
    }

    this.isMonitoring = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    console.log('GitHub Actions monitoring stopped');
  }

  /**
   * Monitor a specific workflow run
   * @param {string} runId - Pipeline run ID
   * @param {number} workflowRunId - GitHub workflow run ID
   * @returns {Promise<Object>} Workflow monitoring results
   */
  async monitorWorkflow(runId, workflowRunId) {
    try {
      console.log(`Monitoring GitHub workflow ${workflowRunId} for pipeline run ${runId}`);

      // Update pipeline stage
      await this.engine.updatePipelineStage(runId, 'github_workflow_started', 'running', {
        workflowRunId,
        startTime: new Date().toISOString()
      });

      // Get workflow run details
      const workflowRun = await this._getWorkflowRun(workflowRunId);
      
      // Monitor workflow execution
      const result = await this._monitorWorkflowExecution(runId, workflowRun);
      
      // Update pipeline stage with results
      await this.engine.updatePipelineStage(runId, 'github_workflow_completed', 'completed', {
        workflowRunId,
        result,
        endTime: new Date().toISOString()
      });

      return result;
    } catch (error) {
      console.error('Failed to monitor workflow:', error.message);
      
      await this.engine.updatePipelineStage(runId, 'github_workflow_failed', 'failed', {
        workflowRunId,
        error: error.message,
        endTime: new Date().toISOString()
      });
      
      throw error;
    }
  }

  /**
   * Get workflow run details from GitHub API
   * @param {number} workflowRunId - GitHub workflow run ID
   * @returns {Promise<Object>} Workflow run details
   */
  async getWorkflowRun(workflowRunId) {
    try {
      return await this._getWorkflowRun(workflowRunId);
    } catch (error) {
      console.error('Failed to get workflow run:', error.message);
      throw error;
    }
  }

  /**
   * Get workflow jobs for a specific run
   * @param {number} workflowRunId - GitHub workflow run ID
   * @returns {Promise<Array>} Array of workflow jobs
   */
  async getWorkflowJobs(workflowRunId) {
    try {
      const response = await this._makeGitHubRequest(`/actions/runs/${workflowRunId}/jobs`);
      return response.jobs || [];
    } catch (error) {
      console.error('Failed to get workflow jobs:', error.message);
      throw error;
    }
  }

  /**
   * Get workflow run logs
   * @param {number} workflowRunId - GitHub workflow run ID
   * @returns {Promise<string>} Workflow logs
   */
  async getWorkflowLogs(workflowRunId) {
    try {
      const response = await fetch(`${this.baseUrl}/actions/runs/${workflowRunId}/logs`, {
        headers: {
          'Authorization': `token ${this.githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'mgrnz-monitoring-system'
        }
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      console.error('Failed to get workflow logs:', error.message);
      throw error;
    }
  }

  // Private methods

  /**
   * Test GitHub API connectivity
   */
  async _testGitHubConnection() {
    try {
      const response = await this._makeGitHubRequest('');
      console.log(`Connected to GitHub repository: ${response.full_name}`);
    } catch (error) {
      throw new Error(`GitHub API connection failed: ${error.message}`);
    }
  }

  /**
   * Get the latest workflow run
   */
  async _getLatestWorkflowRun() {
    try {
      const response = await this._makeGitHubRequest('/actions/runs?per_page=1');
      const runs = response.workflow_runs || [];
      return runs.length > 0 ? runs[0] : null;
    } catch (error) {
      console.error('Failed to get latest workflow run:', error.message);
      return null;
    }
  }

  /**
   * Check for new workflow runs
   */
  async _checkForNewWorkflowRuns() {
    try {
      const response = await this._makeGitHubRequest('/actions/runs?per_page=10');
      const runs = response.workflow_runs || [];

      for (const run of runs) {
        // Check if this is a new run we haven't seen before
        if (!this.lastCheckedWorkflowRun || 
            new Date(run.created_at) > new Date(this.lastCheckedWorkflowRun.created_at)) {
          
          console.log(`New workflow run detected: ${run.id} (${run.status})`);
          
          // Create a pipeline run for this workflow
          const trigger = {
            type: 'git',
            source: 'github_actions',
            timestamp: run.created_at,
            metadata: {
              workflowRunId: run.id,
              workflowName: run.name,
              event: run.event,
              branch: run.head_branch,
              commitSha: run.head_sha,
              actor: run.actor?.login
            }
          };

          const pipelineRunId = await this.engine.createPipelineRun(trigger);
          
          // Start monitoring this workflow
          this._monitorWorkflowInBackground(pipelineRunId, run);
        }
      }

      // Update the last checked workflow run
      if (runs.length > 0) {
        this.lastCheckedWorkflowRun = runs[0];
      }
    } catch (error) {
      console.error('Error checking for new workflow runs:', error.message);
    }
  }

  /**
   * Monitor workflow execution in the background
   */
  async _monitorWorkflowInBackground(runId, workflowRun) {
    try {
      // Don't await this - let it run in background
      this._monitorWorkflowExecution(runId, workflowRun)
        .then(result => {
          console.log(`Workflow monitoring completed for run ${runId}:`, result.status);
        })
        .catch(error => {
          console.error(`Workflow monitoring failed for run ${runId}:`, error.message);
        });
    } catch (error) {
      console.error('Failed to start background workflow monitoring:', error.message);
    }
  }

  /**
   * Monitor workflow execution until completion
   */
  async _monitorWorkflowExecution(runId, initialWorkflowRun) {
    const startTime = Date.now();
    let workflowRun = initialWorkflowRun;
    const pollInterval = 30000; // 30 seconds
    const maxWaitTime = 1800000; // 30 minutes

    try {
      // Wait for workflow to complete
      while (workflowRun.status === 'in_progress' || workflowRun.status === 'queued') {
        // Check timeout
        if (Date.now() - startTime > maxWaitTime) {
          throw new Error('Workflow monitoring timeout');
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        // Get updated workflow status
        workflowRun = await this._getWorkflowRun(workflowRun.id);
        
        // Update pipeline stage with current status
        await this.engine.updatePipelineStage(runId, 'github_workflow_progress', 'running', {
          workflowStatus: workflowRun.status,
          conclusion: workflowRun.conclusion,
          updatedAt: workflowRun.updated_at
        });
      }

      // Workflow completed - analyze results
      const jobs = await this.getWorkflowJobs(workflowRun.id);
      const analysis = await this._analyzeWorkflowResults(workflowRun, jobs);

      return {
        workflowRun,
        jobs,
        analysis,
        success: workflowRun.conclusion === 'success',
        duration: Date.now() - startTime
      };
    } catch (error) {
      console.error('Workflow execution monitoring failed:', error.message);
      throw error;
    }
  }

  /**
   * Analyze workflow results and performance
   */
  async _analyzeWorkflowResults(workflowRun, jobs) {
    try {
      const analysis = {
        status: workflowRun.status,
        conclusion: workflowRun.conclusion,
        totalDuration: new Date(workflowRun.updated_at) - new Date(workflowRun.created_at),
        jobs: [],
        buildTime: 0,
        deploymentTime: 0,
        bottlenecks: []
      };

      // Analyze each job
      for (const job of jobs) {
        const jobAnalysis = {
          name: job.name,
          status: job.status,
          conclusion: job.conclusion,
          duration: job.completed_at ? 
            new Date(job.completed_at) - new Date(job.started_at) : 0,
          steps: job.steps?.length || 0
        };

        // Identify job types for timing analysis
        if (job.name.toLowerCase().includes('build')) {
          analysis.buildTime += jobAnalysis.duration;
        } else if (job.name.toLowerCase().includes('deploy')) {
          analysis.deploymentTime += jobAnalysis.duration;
        }

        // Identify bottlenecks (jobs taking longer than 5 minutes)
        if (jobAnalysis.duration > 300000) {
          analysis.bottlenecks.push({
            job: job.name,
            duration: jobAnalysis.duration,
            type: 'slow_job'
          });
        }

        analysis.jobs.push(jobAnalysis);
      }

      return analysis;
    } catch (error) {
      console.error('Failed to analyze workflow results:', error.message);
      return {
        status: workflowRun.status,
        conclusion: workflowRun.conclusion,
        error: error.message
      };
    }
  }

  /**
   * Get workflow run details from GitHub API
   */
  async _getWorkflowRun(workflowRunId) {
    try {
      return await this._makeGitHubRequest(`/actions/runs/${workflowRunId}`);
    } catch (error) {
      throw new Error(`Failed to get workflow run ${workflowRunId}: ${error.message}`);
    }
  }

  /**
   * Make a request to GitHub API
   */
  async _makeGitHubRequest(endpoint) {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `token ${this.githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'mgrnz-monitoring-system'
        }
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      throw new Error(`GitHub API request failed: ${error.message}`);
    }
  }
}