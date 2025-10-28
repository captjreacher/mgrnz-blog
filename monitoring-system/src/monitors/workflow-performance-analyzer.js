/**
 * WorkflowPerformanceAnalyzer class for analyzing GitHub Actions workflow performance
 * Provides timing analysis, bottleneck identification, and performance metrics collection
 */
export class WorkflowPerformanceAnalyzer {
  constructor(testCycleEngine, config = {}) {
    this.engine = testCycleEngine;
    this.config = config;
    this.performanceThresholds = this._getPerformanceThresholds();
    this.historicalData = new Map(); // Store historical performance data
  }

  /**
   * Initialize the workflow performance analyzer
   */
  async initialize() {
    try {
      console.log('WorkflowPerformanceAnalyzer initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize WorkflowPerformanceAnalyzer:', error.message);
      throw error;
    }
  }

  /**
   * Analyze workflow performance
   * @param {string} runId - Pipeline run ID
   * @param {Object} workflowRun - GitHub workflow run object
   * @param {Array} jobs - Array of workflow jobs
   * @param {Object} buildAnalysis - Build analysis results
   * @returns {Promise<Object>} Performance analysis results
   */
  async analyzeWorkflowPerformance(runId, workflowRun, jobs, buildAnalysis) {
    try {
      console.log(`Analyzing workflow performance for pipeline run ${runId}`);

      // Update pipeline stage
      await this.engine.updatePipelineStage(runId, 'performance_analysis_started', 'running', {
        workflowRunId: workflowRun.id,
        startTime: new Date().toISOString()
      });

      // Perform timing analysis
      const timingAnalysis = await this._analyzeWorkflowTiming(workflowRun, jobs);
      
      // Identify bottlenecks
      const bottleneckAnalysis = await this._identifyBottlenecks(workflowRun, jobs, timingAnalysis);
      
      // Collect performance metrics
      const performanceMetrics = await this._collectPerformanceMetrics(workflowRun, jobs, buildAnalysis);
      
      // Track deployment success/failure
      const deploymentTracking = await this._trackDeploymentResults(workflowRun, jobs);
      
      // Generate performance insights
      const insights = await this._generatePerformanceInsights(timingAnalysis, bottleneckAnalysis, performanceMetrics);

      const result = {
        timingAnalysis,
        bottleneckAnalysis,
        performanceMetrics,
        deploymentTracking,
        insights,
        overallScore: this._calculatePerformanceScore(performanceMetrics, bottleneckAnalysis),
        recommendations: this._generateRecommendations(bottleneckAnalysis, performanceMetrics)
      };

      // Store historical data
      this._storeHistoricalData(workflowRun.id, result);

      // Update pipeline stage with results
      await this.engine.updatePipelineStage(runId, 'performance_analysis_completed', 'completed', {
        result,
        endTime: new Date().toISOString()
      });

      return result;
    } catch (error) {
      console.error('Failed to analyze workflow performance:', error.message);
      
      await this.engine.updatePipelineStage(runId, 'performance_analysis_failed', 'failed', {
        error: error.message,
        endTime: new Date().toISOString()
      });
      
      throw error;
    }
  }

  /**
   * Get performance trends over time
   * @param {number} days - Number of days to analyze
   * @returns {Object} Performance trends
   */
  getPerformanceTrends(days = 30) {
    try {
      const cutoffDate = Date.now() - (days * 24 * 60 * 60 * 1000);
      const recentData = Array.from(this.historicalData.values())
        .filter(data => data.timestamp > cutoffDate);

      if (recentData.length === 0) {
        return {
          totalRuns: 0,
          averageDuration: 0,
          successRate: 0,
          trends: {}
        };
      }

      const trends = {
        totalRuns: recentData.length,
        averageDuration: this._calculateAverage(recentData.map(d => d.performanceMetrics.totalPipelineTime)),
        successRate: this._calculateSuccessRate(recentData),
        buildTimeAverage: this._calculateAverage(recentData.map(d => d.performanceMetrics.buildTime)),
        deploymentTimeAverage: this._calculateAverage(recentData.map(d => d.performanceMetrics.deploymentTime)),
        trends: {
          duration: this._calculateTrend(recentData.map(d => d.performanceMetrics.totalPipelineTime)),
          successRate: this._calculateTrend(recentData.map(d => d.deploymentTracking.success ? 1 : 0)),
          buildTime: this._calculateTrend(recentData.map(d => d.performanceMetrics.buildTime))
        }
      };

      return trends;
    } catch (error) {
      console.error('Failed to get performance trends:', error.message);
      return {
        totalRuns: 0,
        averageDuration: 0,
        successRate: 0,
        trends: {}
      };
    }
  }

  /**
   * Identify performance bottlenecks across multiple runs
   * @param {number} runs - Number of recent runs to analyze
   * @returns {Array} Common bottlenecks
   */
  identifyCommonBottlenecks(runs = 10) {
    try {
      const recentData = Array.from(this.historicalData.values())
        .slice(-runs);

      const bottleneckCounts = new Map();
      
      for (const data of recentData) {
        for (const bottleneck of data.bottleneckAnalysis.bottlenecks) {
          const key = `${bottleneck.type}_${bottleneck.stage}`;
          bottleneckCounts.set(key, (bottleneckCounts.get(key) || 0) + 1);
        }
      }

      // Sort by frequency
      const commonBottlenecks = Array.from(bottleneckCounts.entries())
        .map(([key, count]) => ({
          bottleneck: key,
          frequency: count,
          percentage: (count / recentData.length) * 100
        }))
        .sort((a, b) => b.frequency - a.frequency);

      return commonBottlenecks;
    } catch (error) {
      console.error('Failed to identify common bottlenecks:', error.message);
      return [];
    }
  }

  // Private methods

  /**
   * Analyze workflow timing
   */
  async _analyzeWorkflowTiming(workflowRun, jobs) {
    try {
      const timing = {
        totalDuration: new Date(workflowRun.updated_at) - new Date(workflowRun.created_at),
        queueTime: workflowRun.run_started_at ? 
          new Date(workflowRun.run_started_at) - new Date(workflowRun.created_at) : 0,
        executionTime: workflowRun.updated_at && workflowRun.run_started_at ?
          new Date(workflowRun.updated_at) - new Date(workflowRun.run_started_at) : 0,
        jobs: [],
        phases: {
          setup: 0,
          build: 0,
          test: 0,
          deploy: 0
        }
      };

      // Analyze each job timing
      for (const job of jobs) {
        const jobTiming = {
          id: job.id,
          name: job.name,
          queueTime: job.started_at ? 
            new Date(job.started_at) - new Date(job.created_at) : 0,
          executionTime: job.completed_at && job.started_at ?
            new Date(job.completed_at) - new Date(job.started_at) : 0,
          totalTime: job.completed_at ?
            new Date(job.completed_at) - new Date(job.created_at) : 0,
          steps: job.steps?.length || 0
        };

        timing.jobs.push(jobTiming);

        // Categorize into phases
        const jobName = job.name.toLowerCase();
        if (jobName.includes('setup') || jobName.includes('checkout')) {
          timing.phases.setup += jobTiming.executionTime;
        } else if (jobName.includes('build') || jobName.includes('hugo')) {
          timing.phases.build += jobTiming.executionTime;
        } else if (jobName.includes('test')) {
          timing.phases.test += jobTiming.executionTime;
        } else if (jobName.includes('deploy') || jobName.includes('pages')) {
          timing.phases.deploy += jobTiming.executionTime;
        }
      }

      return timing;
    } catch (error) {
      console.error('Failed to analyze workflow timing:', error.message);
      return {
        totalDuration: 0,
        queueTime: 0,
        executionTime: 0,
        jobs: [],
        phases: { setup: 0, build: 0, test: 0, deploy: 0 }
      };
    }
  }

  /**
   * Identify performance bottlenecks
   */
  async _identifyBottlenecks(workflowRun, jobs, timingAnalysis) {
    try {
      const bottlenecks = [];
      const thresholds = this.performanceThresholds;

      // Check overall workflow duration
      if (timingAnalysis.totalDuration > thresholds.maxWorkflowDuration) {
        bottlenecks.push({
          type: 'workflow_duration',
          stage: 'overall',
          severity: 'high',
          duration: timingAnalysis.totalDuration,
          threshold: thresholds.maxWorkflowDuration,
          description: `Workflow took ${Math.round(timingAnalysis.totalDuration / 1000)}s, exceeding ${Math.round(thresholds.maxWorkflowDuration / 1000)}s threshold`
        });
      }

      // Check queue time
      if (timingAnalysis.queueTime > thresholds.maxQueueTime) {
        bottlenecks.push({
          type: 'queue_time',
          stage: 'queue',
          severity: 'medium',
          duration: timingAnalysis.queueTime,
          threshold: thresholds.maxQueueTime,
          description: `Workflow queued for ${Math.round(timingAnalysis.queueTime / 1000)}s, exceeding ${Math.round(thresholds.maxQueueTime / 1000)}s threshold`
        });
      }

      // Check individual job durations
      for (const jobTiming of timingAnalysis.jobs) {
        if (jobTiming.executionTime > thresholds.maxJobDuration) {
          bottlenecks.push({
            type: 'job_duration',
            stage: jobTiming.name,
            severity: 'medium',
            duration: jobTiming.executionTime,
            threshold: thresholds.maxJobDuration,
            description: `Job '${jobTiming.name}' took ${Math.round(jobTiming.executionTime / 1000)}s, exceeding ${Math.round(thresholds.maxJobDuration / 1000)}s threshold`
          });
        }
      }

      // Check phase durations
      for (const [phase, duration] of Object.entries(timingAnalysis.phases)) {
        const phaseThreshold = thresholds.maxPhaseDuration[phase];
        if (phaseThreshold && duration > phaseThreshold) {
          bottlenecks.push({
            type: 'phase_duration',
            stage: phase,
            severity: 'medium',
            duration: duration,
            threshold: phaseThreshold,
            description: `${phase} phase took ${Math.round(duration / 1000)}s, exceeding ${Math.round(phaseThreshold / 1000)}s threshold`
          });
        }
      }

      // Sort by severity and duration
      bottlenecks.sort((a, b) => {
        const severityOrder = { high: 3, medium: 2, low: 1 };
        const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
        if (severityDiff !== 0) return severityDiff;
        return b.duration - a.duration;
      });

      return {
        bottlenecks,
        totalBottlenecks: bottlenecks.length,
        highSeverity: bottlenecks.filter(b => b.severity === 'high').length,
        mediumSeverity: bottlenecks.filter(b => b.severity === 'medium').length,
        lowSeverity: bottlenecks.filter(b => b.severity === 'low').length
      };
    } catch (error) {
      console.error('Failed to identify bottlenecks:', error.message);
      return {
        bottlenecks: [],
        totalBottlenecks: 0,
        highSeverity: 0,
        mediumSeverity: 0,
        lowSeverity: 0
      };
    }
  }

  /**
   * Collect performance metrics
   */
  async _collectPerformanceMetrics(workflowRun, jobs, buildAnalysis) {
    try {
      const metrics = {
        totalPipelineTime: new Date(workflowRun.updated_at) - new Date(workflowRun.created_at),
        buildTime: buildAnalysis?.totalBuildTime || 0,
        deploymentTime: buildAnalysis?.totalDeploymentTime || 0,
        queueTime: workflowRun.run_started_at ? 
          new Date(workflowRun.run_started_at) - new Date(workflowRun.created_at) : 0,
        jobCount: jobs.length,
        stepCount: jobs.reduce((total, job) => total + (job.steps?.length || 0), 0),
        successRate: this._calculateJobSuccessRate(jobs),
        errorRate: this._calculateJobErrorRate(jobs),
        throughput: this._calculateThroughput(),
        resourceUtilization: {
          cpuTime: this._estimateCpuTime(jobs),
          memoryUsage: this._estimateMemoryUsage(jobs),
          networkUsage: this._estimateNetworkUsage(jobs)
        },
        efficiency: {
          timePerStep: 0,
          parallelization: this._calculateParallelization(jobs),
          resourceEfficiency: 0
        }
      };

      // Calculate derived metrics
      metrics.efficiency.timePerStep = metrics.stepCount > 0 ? 
        metrics.totalPipelineTime / metrics.stepCount : 0;
      
      metrics.efficiency.resourceEfficiency = 
        this._calculateResourceEfficiency(metrics.resourceUtilization, metrics.totalPipelineTime);

      return metrics;
    } catch (error) {
      console.error('Failed to collect performance metrics:', error.message);
      return {
        totalPipelineTime: 0,
        buildTime: 0,
        deploymentTime: 0,
        queueTime: 0,
        jobCount: 0,
        stepCount: 0,
        successRate: 0,
        errorRate: 0,
        throughput: 0,
        resourceUtilization: { cpuTime: 0, memoryUsage: 0, networkUsage: 0 },
        efficiency: { timePerStep: 0, parallelization: 0, resourceEfficiency: 0 }
      };
    }
  }

  /**
   * Track deployment success/failure
   */
  async _trackDeploymentResults(workflowRun, jobs) {
    try {
      const tracking = {
        success: workflowRun.conclusion === 'success',
        conclusion: workflowRun.conclusion,
        status: workflowRun.status,
        failedJobs: [],
        successfulJobs: [],
        deploymentJobs: [],
        errors: []
      };

      // Analyze job results
      for (const job of jobs) {
        const jobResult = {
          id: job.id,
          name: job.name,
          conclusion: job.conclusion,
          status: job.status
        };

        if (job.conclusion === 'success') {
          tracking.successfulJobs.push(jobResult);
        } else if (job.conclusion === 'failure') {
          tracking.failedJobs.push(jobResult);
          tracking.errors.push({
            job: job.name,
            conclusion: job.conclusion,
            message: `Job failed: ${job.name}`
          });
        }

        // Identify deployment jobs
        if (this._isDeploymentJob(job.name)) {
          tracking.deploymentJobs.push(jobResult);
        }
      }

      // Calculate deployment-specific success rate
      tracking.deploymentSuccess = tracking.deploymentJobs.length > 0 ?
        tracking.deploymentJobs.every(job => job.conclusion === 'success') : true;

      return tracking;
    } catch (error) {
      console.error('Failed to track deployment results:', error.message);
      return {
        success: false,
        conclusion: 'unknown',
        status: 'unknown',
        failedJobs: [],
        successfulJobs: [],
        deploymentJobs: [],
        errors: [{ message: error.message }]
      };
    }
  }

  /**
   * Generate performance insights
   */
  async _generatePerformanceInsights(timingAnalysis, bottleneckAnalysis, performanceMetrics) {
    try {
      const insights = {
        summary: '',
        strengths: [],
        weaknesses: [],
        trends: [],
        recommendations: []
      };

      // Generate summary
      const duration = Math.round(performanceMetrics.totalPipelineTime / 1000);
      const successRate = Math.round(performanceMetrics.successRate * 100);
      insights.summary = `Workflow completed in ${duration}s with ${successRate}% job success rate`;

      // Identify strengths
      if (performanceMetrics.successRate >= 0.95) {
        insights.strengths.push('High job success rate');
      }
      if (performanceMetrics.totalPipelineTime < this.performanceThresholds.maxWorkflowDuration) {
        insights.strengths.push('Fast workflow execution');
      }
      if (bottleneckAnalysis.totalBottlenecks === 0) {
        insights.strengths.push('No performance bottlenecks detected');
      }

      // Identify weaknesses
      if (performanceMetrics.successRate < 0.9) {
        insights.weaknesses.push('Low job success rate');
      }
      if (bottleneckAnalysis.highSeverity > 0) {
        insights.weaknesses.push('High severity performance bottlenecks');
      }
      if (performanceMetrics.queueTime > this.performanceThresholds.maxQueueTime) {
        insights.weaknesses.push('Long queue times');
      }

      // Generate recommendations based on analysis
      if (bottleneckAnalysis.totalBottlenecks > 0) {
        insights.recommendations.push('Address identified performance bottlenecks');
      }
      if (performanceMetrics.efficiency.parallelization < 0.5) {
        insights.recommendations.push('Consider parallelizing jobs to improve efficiency');
      }

      return insights;
    } catch (error) {
      console.error('Failed to generate performance insights:', error.message);
      return {
        summary: 'Performance analysis failed',
        strengths: [],
        weaknesses: [],
        trends: [],
        recommendations: []
      };
    }
  }

  /**
   * Calculate overall performance score
   */
  _calculatePerformanceScore(performanceMetrics, bottleneckAnalysis) {
    try {
      let score = 100;

      // Deduct points for duration
      const durationRatio = performanceMetrics.totalPipelineTime / this.performanceThresholds.maxWorkflowDuration;
      if (durationRatio > 1) {
        score -= Math.min(30, (durationRatio - 1) * 20);
      }

      // Deduct points for bottlenecks
      score -= bottleneckAnalysis.highSeverity * 15;
      score -= bottleneckAnalysis.mediumSeverity * 10;
      score -= bottleneckAnalysis.lowSeverity * 5;

      // Deduct points for low success rate
      if (performanceMetrics.successRate < 1) {
        score -= (1 - performanceMetrics.successRate) * 20;
      }

      return Math.max(0, Math.round(score));
    } catch (error) {
      return 0;
    }
  }

  /**
   * Generate performance recommendations
   */
  _generateRecommendations(bottleneckAnalysis, performanceMetrics) {
    const recommendations = [];

    try {
      // Recommendations based on bottlenecks
      for (const bottleneck of bottleneckAnalysis.bottlenecks) {
        switch (bottleneck.type) {
          case 'workflow_duration':
            recommendations.push({
              type: 'optimization',
              priority: 'high',
              description: 'Consider parallelizing jobs or optimizing slow steps',
              impact: 'Reduce overall workflow duration'
            });
            break;
          case 'queue_time':
            recommendations.push({
              type: 'infrastructure',
              priority: 'medium',
              description: 'Consider using self-hosted runners or upgrading GitHub plan',
              impact: 'Reduce queue waiting time'
            });
            break;
          case 'job_duration':
            recommendations.push({
              type: 'optimization',
              priority: 'medium',
              description: `Optimize job '${bottleneck.stage}' by caching dependencies or reducing scope`,
              impact: 'Reduce individual job execution time'
            });
            break;
        }
      }

      // Recommendations based on metrics
      if (performanceMetrics.efficiency.parallelization < 0.5) {
        recommendations.push({
          type: 'architecture',
          priority: 'medium',
          description: 'Increase job parallelization to improve resource utilization',
          impact: 'Better resource utilization and faster execution'
        });
      }

      if (performanceMetrics.successRate < 0.95) {
        recommendations.push({
          type: 'reliability',
          priority: 'high',
          description: 'Investigate and fix failing jobs to improve reliability',
          impact: 'Higher success rate and more reliable deployments'
        });
      }

      return recommendations;
    } catch (error) {
      console.error('Failed to generate recommendations:', error.message);
      return [];
    }
  }

  // Helper methods

  _calculateJobSuccessRate(jobs) {
    if (jobs.length === 0) return 1;
    const successfulJobs = jobs.filter(job => job.conclusion === 'success').length;
    return successfulJobs / jobs.length;
  }

  _calculateJobErrorRate(jobs) {
    return 1 - this._calculateJobSuccessRate(jobs);
  }

  _calculateThroughput() {
    // Simplified throughput calculation - pipelines per hour
    // In a real implementation, this would use historical data
    return 1; // Placeholder
  }

  _estimateCpuTime(jobs) {
    // Estimate CPU time based on job duration and complexity
    return jobs.reduce((total, job) => {
      const duration = job.completed_at && job.started_at ?
        new Date(job.completed_at) - new Date(job.started_at) : 0;
      return total + duration;
    }, 0);
  }

  _estimateMemoryUsage(jobs) {
    // Estimate memory usage based on job types
    return jobs.length * 512; // MB - placeholder
  }

  _estimateNetworkUsage(jobs) {
    // Estimate network usage based on job types
    return jobs.length * 100; // MB - placeholder
  }

  _calculateParallelization(jobs) {
    // Calculate how well jobs are parallelized
    if (jobs.length <= 1) return 1;
    
    // Simple heuristic: ratio of concurrent jobs to total jobs
    return Math.min(1, jobs.length / 4); // Assume max 4 concurrent jobs
  }

  _calculateResourceEfficiency(resourceUtilization, totalTime) {
    // Calculate resource efficiency score (0-1)
    const cpuEfficiency = Math.min(1, resourceUtilization.cpuTime / totalTime);
    return cpuEfficiency; // Simplified calculation
  }

  _isDeploymentJob(jobName) {
    const deployKeywords = ['deploy', 'publish', 'pages', 'upload'];
    return deployKeywords.some(keyword => 
      jobName.toLowerCase().includes(keyword)
    );
  }

  _calculateAverage(values) {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  _calculateSuccessRate(data) {
    if (data.length === 0) return 0;
    const successful = data.filter(d => d.deploymentTracking.success).length;
    return successful / data.length;
  }

  _calculateTrend(values) {
    if (values.length < 2) return 'stable';
    
    const recent = values.slice(-5); // Last 5 values
    const older = values.slice(-10, -5); // Previous 5 values
    
    if (recent.length === 0 || older.length === 0) return 'stable';
    
    const recentAvg = this._calculateAverage(recent);
    const olderAvg = this._calculateAverage(older);
    
    const change = (recentAvg - olderAvg) / olderAvg;
    
    if (change > 0.1) return 'improving';
    if (change < -0.1) return 'degrading';
    return 'stable';
  }

  _storeHistoricalData(workflowRunId, result) {
    try {
      this.historicalData.set(workflowRunId, {
        ...result,
        timestamp: Date.now()
      });

      // Keep only last 100 entries to prevent memory issues
      if (this.historicalData.size > 100) {
        const entries = Array.from(this.historicalData.entries());
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        
        // Remove oldest entries
        for (let i = 0; i < entries.length - 100; i++) {
          this.historicalData.delete(entries[i][0]);
        }
      }
    } catch (error) {
      console.error('Failed to store historical data:', error.message);
    }
  }

  _getPerformanceThresholds() {
    return {
      maxWorkflowDuration: 600000,    // 10 minutes
      maxJobDuration: 300000,         // 5 minutes
      maxQueueTime: 120000,           // 2 minutes
      maxPhaseDuration: {
        setup: 60000,                 // 1 minute
        build: 300000,                // 5 minutes
        test: 180000,                 // 3 minutes
        deploy: 120000                // 2 minutes
      }
    };
  }
}