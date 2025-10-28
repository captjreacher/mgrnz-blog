export function createWorkflowRunFixture(overrides = {}) {
  return {
    id: 987654,
    name: 'Deploy Blog',
    status: 'completed',
    conclusion: 'success',
    event: 'workflow_dispatch',
    created_at: '2025-01-01T00:00:00.000Z',
    run_started_at: '2025-01-01T00:01:00.000Z',
    updated_at: '2025-01-01T00:06:00.000Z',
    head_branch: 'main',
    head_sha: 'abc123',
    actor: { login: 'automation-bot' },
    ...overrides
  };
}

export function createJobsFixture() {
  return [
    {
      id: 1,
      name: 'setup-environment',
      status: 'completed',
      conclusion: 'success',
      created_at: '2025-01-01T00:00:00.000Z',
      started_at: '2025-01-01T00:01:00.000Z',
      completed_at: '2025-01-01T00:02:30.000Z',
      steps: [
        { name: 'Checkout repository' },
        { name: 'Install dependencies' }
      ]
    },
    {
      id: 2,
      name: 'deploy-to-pages',
      status: 'completed',
      conclusion: 'success',
      created_at: '2025-01-01T00:02:30.000Z',
      started_at: '2025-01-01T00:03:00.000Z',
      completed_at: '2025-01-01T00:05:30.000Z',
      steps: [
        { name: 'Build site' },
        { name: 'Upload artifacts' }
      ]
    }
  ];
}

export function createJobsWithFailureFixture() {
  const jobs = createJobsFixture();
  jobs[1] = {
    ...jobs[1],
    conclusion: 'failure',
    status: 'completed'
  };
  return jobs;
}

export function createBuildAnalysisFixture(overrides = {}) {
  return {
    totalBuildTime: 180000,
    totalDeploymentTime: 120000,
    buildAnalysis: {
      buildJobs: 1,
      deployJobs: 1
    },
    logAnalysis: {
      buildSteps: 5
    },
    ...overrides
  };
}

export function createPipelineRunFixture(overrides = {}) {
  return {
    id: 'run-fixture-001',
    trigger: {
      type: 'webhook',
      source: 'github',
    timestamp: '2025-01-01T00:00:00.000Z',
      metadata: { branch: 'main' }
    },
    stages: [
      {
        name: 'build',
        status: 'completed',
        duration: 180000,
        data: { steps: 10 },
        errors: []
      },
      {
        name: 'deploy',
        status: 'completed',
        duration: 120000,
        data: { provider: 'pages' },
        errors: []
      }
    ],
    status: 'completed',
    startTime: '2025-01-01T00:00:00.000Z',
    endTime: '2025-01-01T00:10:00.000Z',
    duration: 600000,
    success: true,
    errors: [],
    metrics: {
      webhookLatency: 5000,
      buildTime: 180000,
      deploymentTime: 120000,
      siteResponseTime: 2000,
      totalPipelineTime: 600000,
      errorRate: 0,
      successRate: 100,
      throughput: 1
    },
    ...overrides
  };
}

export function createWebhookRecordFixture(overrides = {}) {
  return {
    id: 'webhook-001',
    runId: 'run-fixture-001',
    source: 'github',
    destination: 'supabase',
    payload: { action: 'deploy' },
    response: { status: 200, body: { success: true }, headers: {} },
    timing: {
      sent: '2025-01-01T00:00:10.000Z',
      received: '2025-01-01T00:00:12.000Z',
      processed: '2025-01-01T00:00:15.000Z'
    },
    authentication: { method: 'token', success: true },
    retries: [],
    ...overrides
  };
}

export function createMetricsFixture(overrides = {}) {
  return {
    webhookLatency: 5000,
    buildTime: 180000,
    deploymentTime: 120000,
    siteResponseTime: 2100,
    totalPipelineTime: 300000,
    errorRate: 0,
    successRate: 100,
    throughput: 2,
    ...overrides
  };
}

export function createHistoricalAnalyticsSamples() {
  return [
    {
      performanceMetrics: {
        totalPipelineTime: 300000,
        buildTime: 150000,
        deploymentTime: 60000,
        queueTime: 30000,
        jobCount: 2,
        stepCount: 8,
        successRate: 0.95,
        errorRate: 0.05,
        throughput: 2,
        resourceUtilization: { cpuTime: 150000, memoryUsage: 1024, networkUsage: 200 },
        efficiency: { timePerStep: 37500, parallelization: 0.5, resourceEfficiency: 0.6 }
      },
      bottleneckAnalysis: {
        bottlenecks: [
          { type: 'job_duration', stage: 'build', severity: 'medium', duration: 200000, threshold: 300000 }
        ],
        totalBottlenecks: 1,
        highSeverity: 0,
        mediumSeverity: 1,
        lowSeverity: 0
      },
      deploymentTracking: { success: true }
    },
    {
      performanceMetrics: {
        totalPipelineTime: 420000,
        buildTime: 240000,
        deploymentTime: 90000,
        queueTime: 60000,
        jobCount: 3,
        stepCount: 12,
        successRate: 0.85,
        errorRate: 0.15,
        throughput: 1,
        resourceUtilization: { cpuTime: 220000, memoryUsage: 1536, networkUsage: 320 },
        efficiency: { timePerStep: 35000, parallelization: 0.4, resourceEfficiency: 0.5 }
      },
      bottleneckAnalysis: {
        bottlenecks: [
          { type: 'phase_duration', stage: 'build', severity: 'medium', duration: 240000, threshold: 300000 }
        ],
        totalBottlenecks: 1,
        highSeverity: 0,
        mediumSeverity: 1,
        lowSeverity: 0
      },
      deploymentTracking: { success: true }
    },
    {
      performanceMetrics: {
        totalPipelineTime: 360000,
        buildTime: 180000,
        deploymentTime: 120000,
        queueTime: 45000,
        jobCount: 2,
        stepCount: 10,
        successRate: 0.75,
        errorRate: 0.25,
        throughput: 1,
        resourceUtilization: { cpuTime: 180000, memoryUsage: 2048, networkUsage: 400 },
        efficiency: { timePerStep: 36000, parallelization: 0.5, resourceEfficiency: 0.55 }
      },
      bottleneckAnalysis: {
        bottlenecks: [
          { type: 'job_duration', stage: 'deploy', severity: 'medium', duration: 120000, threshold: 120000 }
        ],
        totalBottlenecks: 1,
        highSeverity: 0,
        mediumSeverity: 1,
        lowSeverity: 0
      },
      deploymentTracking: { success: false }
    }
  ];
}
