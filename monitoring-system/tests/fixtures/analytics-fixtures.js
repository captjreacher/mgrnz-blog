export function generateTrendDataset() {
  const now = Date.now();
  const totalPipelineTimes = [110, 120, 130, 140, 150, 160, 170, 180, 190, 200];
  const buildTimes = [320, 315, 310, 305, 300, 220, 215, 210, 205, 200];
  const deploymentTimes = [400, 410, 420, 430, 440, 450, 460, 470, 480, 490];
  const successFlags = [true, false, false, true, false, true, true, true, false, true];

  return totalPipelineTimes.map((totalPipelineTime, index) => ({
    id: `run-${index + 1}`,
    timestamp: now - ((totalPipelineTimes.length - index) * 60_000),
    result: {
      timingAnalysis: {
        totalDuration: totalPipelineTime
      },
      bottleneckAnalysis: {
        bottlenecks: index < 5
          ? [{ type: 'phase', stage: 'build' }]
          : [{ type: 'phase', stage: 'deploy' }]
      },
      performanceMetrics: {
        totalPipelineTime,
        buildTime: buildTimes[index],
        deploymentTime: deploymentTimes[index],
        jobCount: 2
      },
      deploymentTracking: {
        success: successFlags[index]
      },
      insights: [],
      overallScore: 90 - index,
      recommendations: []
    }
  }));
}

export function generateBottleneckDataset() {
  const now = Date.now();
  return [
    {
      id: 'run-a',
      timestamp: now - 180_000,
      result: {
        timingAnalysis: { totalDuration: 150 },
        bottleneckAnalysis: {
          bottlenecks: [
            { type: 'phase', stage: 'build' },
            { type: 'phase', stage: 'deploy' }
          ]
        },
        performanceMetrics: {
          totalPipelineTime: 150,
          buildTime: 320,
          deploymentTime: 410,
          jobCount: 2
        },
        deploymentTracking: { success: true },
        insights: [],
        overallScore: 88,
        recommendations: []
      }
    },
    {
      id: 'run-b',
      timestamp: now - 120_000,
      result: {
        timingAnalysis: { totalDuration: 160 },
        bottleneckAnalysis: {
          bottlenecks: [
            { type: 'phase', stage: 'build' }
          ]
        },
        performanceMetrics: {
          totalPipelineTime: 160,
          buildTime: 315,
          deploymentTime: 405,
          jobCount: 2
        },
        deploymentTracking: { success: false },
        insights: [],
        overallScore: 76,
        recommendations: []
      }
    },
    {
      id: 'run-c',
      timestamp: now - 60_000,
      result: {
        timingAnalysis: { totalDuration: 170 },
        bottleneckAnalysis: {
          bottlenecks: [
            { type: 'phase', stage: 'test' },
            { type: 'phase', stage: 'build' }
          ]
        },
        performanceMetrics: {
          totalPipelineTime: 170,
          buildTime: 310,
          deploymentTime: 400,
          jobCount: 2
        },
        deploymentTracking: { success: true },
        insights: [],
        overallScore: 82,
        recommendations: []
      }
    }
  ];
}

export const samplePipelineRun = {
  id: 'run-analytics-1',
  trigger: {
    type: 'git',
    source: 'push',
    timestamp: '2025-10-26T10:00:00Z',
    metadata: { branch: 'main' }
  },
  stages: [
    {
      name: 'webhook_received',
      status: 'completed',
      startTime: '2025-10-26T10:00:00Z',
      endTime: '2025-10-26T10:00:05Z',
      duration: 5_000,
      data: { attempts: 1 },
      errors: []
    },
    {
      name: 'build',
      status: 'completed',
      startTime: '2025-10-26T10:01:00Z',
      endTime: '2025-10-26T10:07:00Z',
      duration: 360_000,
      data: { jobs: 2 },
      errors: []
    },
    {
      name: 'deploy',
      status: 'completed',
      startTime: '2025-10-26T10:07:30Z',
      endTime: '2025-10-26T10:12:00Z',
      duration: 270_000,
      data: { target: 'production' },
      errors: []
    }
  ],
  status: 'completed',
  startTime: '2025-10-26T10:00:00Z',
  endTime: '2025-10-26T10:12:00Z',
  duration: 720_000,
  success: true,
  errors: [
    {
      id: 'err-analytics-1',
      stage: 'validation',
      type: 'warning',
      message: 'Minor delay detected',
      timestamp: '2025-10-26T10:05:00Z',
      context: { check: 'content-validation' }
    }
  ],
  metrics: {
    webhookLatency: 1_200,
    buildTime: 360_000,
    deploymentTime: 270_000,
    siteResponseTime: 900,
    totalPipelineTime: 720_000,
    errorRate: 5,
    successRate: 95,
    throughput: 1.2
  }
};

export const sampleWebhookRecords = [
  {
    id: 'webhook-1',
    runId: 'run-analytics-1',
    source: 'github',
    destination: 'site',
    payload: { event: 'push', branch: 'main' },
    response: { status: 200, body: 'ok', headers: { 'x-request-id': 'abc' } },
    timing: {
      sent: '2025-10-26T10:00:00Z',
      received: '2025-10-26T10:00:01Z',
      processed: '2025-10-26T10:00:02Z'
    },
    authentication: { method: 'signature', success: true },
    retries: []
  },
  {
    id: 'webhook-2',
    runId: 'run-analytics-1',
    source: 'supabase',
    destination: 'github',
    payload: { event: 'status', state: 'success' },
    response: { status: 202, body: 'accepted', headers: {} },
    timing: {
      sent: '2025-10-26T10:02:00Z',
      received: '2025-10-26T10:02:01Z',
      processed: '2025-10-26T10:02:02Z'
    },
    authentication: { method: 'api-key', success: true },
    retries: []
  }
];

export function createMetricsFixture(overrides = {}) {
  return {
    webhookLatency: 1_200,
    buildTime: 360_000,
    deploymentTime: 270_000,
    siteResponseTime: 900,
    totalPipelineTime: 720_000,
    errorRate: 5,
    successRate: 95,
    throughput: 1.2,
    jobCount: 3,
    ...overrides
  };
}

export function createAnalyticsResultFromRun(run, overrides = {}) {
  return {
    timingAnalysis: {
      totalDuration: run.metrics.totalPipelineTime,
      queueTime: overrides.queueTime ?? 30_000,
      executionTime: overrides.executionTime ?? run.metrics.totalPipelineTime - 30_000,
      jobs: [],
      phases: {
        setup: 60_000,
        build: run.metrics.buildTime,
        test: 120_000,
        deploy: run.metrics.deploymentTime
      }
    },
    bottleneckAnalysis: overrides.bottleneckAnalysis ?? {
      criticalPath: ['build', 'deploy'],
      bottlenecks: [
        { type: 'phase', stage: 'build', duration: run.metrics.buildTime },
        { type: 'phase', stage: 'deploy', duration: run.metrics.deploymentTime }
      ]
    },
    performanceMetrics: {
      totalPipelineTime: run.metrics.totalPipelineTime,
      buildTime: run.metrics.buildTime,
      deploymentTime: run.metrics.deploymentTime,
      jobCount: overrides.jobCount ?? 3,
      throughput: run.metrics.throughput
    },
    deploymentTracking: overrides.deploymentTracking ?? {
      success: run.success,
      failures: []
    },
    insights: overrides.insights ?? [],
    overallScore: overrides.overallScore ?? 92,
    recommendations: overrides.recommendations ?? []
  };
}
