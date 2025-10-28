export const pipelineFixtures = {
  successfulDeployment: {
    description: 'Webhook triggered Supabase sync leading to successful deployment',
    trigger: {
      type: 'webhook',
      source: 'supabase',
      timestamp: '2025-01-01T10:00:00.000Z',
      metadata: {
        eventId: 'evt_supabase_sync_1001',
        recordCount: 18,
        siteSection: 'blog-posts',
        user: 'automation@mgrnz.com'
      }
    },
    stages: [
      {
        name: 'webhook_received',
        updates: [
          {
            at: '2025-01-01T10:00:01.000Z',
            status: 'running',
            data: {
              payloadId: 'payload-9f42',
              source: 'supabase',
              schema: 'public'
            }
          },
          {
            at: '2025-01-01T10:00:03.000Z',
            status: 'completed',
            data: {
              validated: true,
              latencyMs: 420
            }
          }
        ]
      },
      {
        name: 'pipeline_dispatch',
        updates: [
          {
            at: '2025-01-01T10:00:04.000Z',
            status: 'running',
            data: {
              workflow: 'deploy-blog.yml',
              branch: 'main'
            }
          },
          {
            at: '2025-01-01T10:00:06.000Z',
            status: 'completed',
            data: {
              queuedWorkflowId: 7821,
              queueLatencyMs: 1850
            }
          }
        ]
      },
      {
        name: 'build_process',
        updates: [
          {
            at: '2025-01-01T10:00:08.000Z',
            status: 'running',
            data: {
              environment: 'production',
              hugoVersion: '0.120.0'
            }
          },
          {
            at: '2025-01-01T10:03:08.000Z',
            status: 'completed',
            data: {
              artifactSizeMb: 132.4,
              contentFiles: 287
            }
          }
        ]
      },
      {
        name: 'deployment',
        updates: [
          {
            at: '2025-01-01T10:03:09.000Z',
            status: 'running',
            data: {
              provider: 'cloudflare-pages',
              environment: 'production'
            }
          },
          {
            at: '2025-01-01T10:04:09.000Z',
            status: 'completed',
            data: {
              deploymentUrl: 'https://mgrnz.com',
              version: '2025.01.01-1'
            }
          }
        ]
      },
      {
        name: 'post_deploy_validation',
        updates: [
          {
            at: '2025-01-01T10:04:10.000Z',
            status: 'running',
            data: {
              lighthouseProfile: 'production',
              monitoredEndpoints: ['/', '/posts/latest', '/rss.xml']
            }
          },
          {
            at: '2025-01-01T10:05:00.000Z',
            status: 'completed',
            data: {
              performanceScore: 0.96,
              pagesValidated: 24,
              syntheticResponseMs: 840
            }
          }
        ]
      }
    ],
    completion: {
      at: '2025-01-01T10:05:05.000Z',
      success: true,
      metrics: {
        webhookLatency: 1200,
        buildTime: 180000,
        deploymentTime: 60000,
        siteResponseTime: 840,
        throughput: 6.2
      }
    },
    detailedMetrics: {
      build: {
        cacheHitRate: 0.78,
        warnings: 2,
        averageStepDuration: 35000
      },
      deployment: {
        edgePropagationMs: 42000,
        purgeOperations: 3
      },
      validation: {
        averageResponseMs: 860,
        uptimeCheckSuccess: true
      }
    }
  },
  failedDeployment: {
    description: 'GitHub dispatch with failing build stage and recovery follow-up',
    trigger: {
      type: 'git',
      source: 'github',
      timestamp: '2025-02-10T18:30:00.000Z',
      metadata: {
        commitHash: 'b7e8c3d4',
        branch: 'main',
        author: 'deploy-bot',
        message: 'Add new landing page assets'
      }
    },
    stages: [
      {
        name: 'webhook_received',
        updates: [
          {
            at: '2025-02-10T18:30:01.000Z',
            status: 'running',
            data: {
              deliveryId: 'ghw-9912',
              event: 'push'
            }
          },
          {
            at: '2025-02-10T18:30:02.500Z',
            status: 'completed',
            data: {
              validated: true
            }
          }
        ]
      },
      {
        name: 'pipeline_dispatch',
        updates: [
          {
            at: '2025-02-10T18:30:03.000Z',
            status: 'running',
            data: {
              workflow: 'deploy-blog.yml',
              branch: 'main'
            }
          },
          {
            at: '2025-02-10T18:30:05.000Z',
            status: 'completed',
            data: {
              queuedWorkflowId: 9102,
              queueLatencyMs: 980
            }
          }
        ]
      },
      {
        name: 'build_process',
        updates: [
          {
            at: '2025-02-10T18:30:08.000Z',
            status: 'running',
            data: {
              environment: 'production',
              hugoVersion: '0.120.0'
            }
          },
          {
            at: '2025-02-10T18:36:08.000Z',
            status: 'failed',
            data: {
              failedStep: 'npm run build',
              logExcerpt: 'Error: build script timed out'
            }
          }
        ]
      }
    ],
    errors: [
      {
        stage: 'build_process',
        type: 'build_failure',
        message: 'Build process exceeded timeout threshold',
        context: {
          job: 'build-hugo-site',
          timeoutMs: 360000
        }
      }
    ],
    completion: {
      at: '2025-02-10T18:36:15.000Z',
      success: false,
      metrics: {
        webhookLatency: 900,
        buildTime: 360000,
        deploymentTime: 0,
        siteResponseTime: 0,
        throughput: 1.4
      }
    },
    detailedMetrics: {
      build: {
        cacheHitRate: 0.12,
        warnings: 6,
        averageStepDuration: 48000
      },
      deployment: {
        edgePropagationMs: 0,
        purgeOperations: 0
      },
      validation: {
        averageResponseMs: 0,
        uptimeCheckSuccess: false
      }
    },
    expectedAlerts: [
      {
        type: 'pipeline_failure',
        severity: 'high'
      },
      {
        type: 'slow_pipeline',
        severity: 'medium'
      },
      {
        type: 'stage_failure',
        severity: 'high'
      }
    ]
  }
};
