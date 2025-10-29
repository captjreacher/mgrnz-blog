export const pipelineFixtures = {
  productionDeployment: {
    trigger: {
      type: 'webhook',
      source: 'mailerlite',
      timestamp: '2025-10-28T12:00:00.000Z',
      metadata: {
        campaign: 'autumn-promo',
        environment: 'production',
        payloadId: 'payload_001'
      }
    },
    stages: [
      {
        name: 'webhook_received',
        runningData: {
          payloadSize: 2048,
          attempts: 1
        },
        completedData: {
          statusCode: 200,
          processingLatency: 320,
          endpoint: 'supabase'
        }
      },
      {
        name: 'supabase_sync',
        runningData: {
          recordCount: 42,
          pendingMutations: 3
        },
        completedData: {
          inserted: 40,
          updated: 2,
          durationMs: 1800,
          checksum: '2b9f9c3b'
        }
      },
      {
        name: 'github_workflow',
        runningData: {
          workflowId: 78901,
          branch: 'main',
          commit: 'abc123def456'
        },
        completedData: {
          jobs: ['build-hugo-site', 'deploy-to-pages'],
          queuedDuration: 15000,
          executionDuration: 300000,
          runner: 'ubuntu-latest'
        }
      },
      {
        name: 'site_validation',
        runningData: {
          pages: 28,
          lighthouseChecks: true
        },
        completedData: {
          accessibilityScore: 98,
          performanceScore: 92,
          responseTimeMs: 420,
          brokenLinks: []
        }
      },
      {
        name: 'dashboard_update',
        runningData: {
          subscribers: 3,
          broadcastChannels: ['websocket', 'email']
        },
        completedData: {
          notificationsSent: 3,
          cacheInvalidated: true,
          dashboardLatency: 85
        }
      }
    ],
    metrics: {
      pipeline: {
        webhookLatency: 320,
        buildTime: 300000,
        deploymentTime: 120000,
        siteResponseTime: 420,
        totalPipelineTime: 480000,
        throughput: 1.4
      },
      performance: {
        build: {
          duration: 300000,
          success: true,
          jobCount: 2
        },
        deployment: {
          duration: 120000,
          success: true,
          target: 'github-pages'
        },
        site: {
          responseTime: 420,
          status: 200,
          validationScore: 96
        }
      }
    },
    github: {
      workflowRun: {
        id: 78901,
        name: 'Deploy Production Blog',
        status: 'completed',
        conclusion: 'success',
        created_at: '2025-10-28T12:00:00Z',
        updated_at: '2025-10-28T12:08:00Z',
        run_started_at: '2025-10-28T12:01:00Z',
        event: 'push',
        head_branch: 'main',
        head_sha: 'abc123def456',
        actor: { login: 'release-automation' }
      },
      jobs: [
        {
          id: 1,
          name: 'build-hugo-site',
          status: 'completed',
          conclusion: 'success',
          created_at: '2025-10-28T12:01:00Z',
          started_at: '2025-10-28T12:01:30Z',
          completed_at: '2025-10-28T12:04:00Z',
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
          created_at: '2025-10-28T12:04:10Z',
          started_at: '2025-10-28T12:04:30Z',
          completed_at: '2025-10-28T12:07:00Z',
          steps: [
            { name: 'Upload artifact' },
            { name: 'Deploy to GitHub Pages' }
          ]
        }
      ]
    }
  },
  recoveryPipeline: {
    trigger: {
      type: 'manual',
      source: 'operations-cli',
      timestamp: '2025-10-29T03:15:00.000Z',
      metadata: {
        operator: 'deploy-admin',
        maintenanceWindow: true
      }
    },
    stages: [
      {
        name: 'webhook_received',
        runningData: {
          payloadSize: 1024,
          attempts: 1
        },
        completedData: {
          statusCode: 200,
          processingLatency: 280,
          endpoint: 'supabase'
        }
      },
      {
        name: 'content_validation',
        runningData: {
          validators: ['markdown', 'links', 'images']
        },
        completedData: {
          status: 'failed',
          errors: ['missing-cover-image', 'link-check-failed'],
          durationMs: 5400
        }
      },
      {
        name: 'recovery_plan',
        runningData: {
          initiatedBy: 'deploy-admin',
          fallbackStrategy: 'rollback-last-success'
        },
        completedData: {
          status: 'completed',
          actions: ['restore-previous-content', 'notify-on-call'],
          durationMs: 90000
        }
      }
    ],
    metrics: {
      pipeline: {
        webhookLatency: 280,
        buildTime: 0,
        deploymentTime: 0,
        siteResponseTime: 0,
        totalPipelineTime: 150000,
        throughput: 0.4,
        errorRate: 66.7,
        successRate: 33.3
      },
      performance: {
        validation: {
          duration: 5400,
          success: false,
          failedChecks: 2
        },
        recovery: {
          duration: 90000,
          success: true,
          actions: 2
        }
      }
    },
    alerts: [
      {
        type: 'pipeline_failure',
        severity: 'high',
        message: 'Content validation failed during production deploy',
        context: {
          failedStage: 'content_validation',
          failingChecks: ['missing-cover-image', 'link-check-failed']
        }
      },
      {
        type: 'stage_failure',
        severity: 'high',
        message: 'Content validation encountered blocking issues',
        context: {
          stage: 'content_validation',
          validator: 'links'
        }
      }
    ],
    recoveryFollowUp: {
      trigger: {
        type: 'manual',
        source: 'operations-cli',
        timestamp: '2025-10-29T04:05:00.000Z',
        metadata: {
          operator: 'deploy-admin',
          notes: 'Resubmitted after fixing assets',
          reason: 'retry'
        }
      },
      metrics: {
        pipeline: {
          webhookLatency: 260,
          buildTime: 240000,
          deploymentTime: 90000,
          siteResponseTime: 410,
          totalPipelineTime: 420000,
          throughput: 1.1,
          errorRate: 0,
          successRate: 100
        }
      },
      stages: [
        {
          name: 'content_validation',
          runningData: {
            validators: ['markdown', 'links', 'images']
          },
          completedData: {
            status: 'completed',
            durationMs: 4200,
            resolvedIssues: ['missing-cover-image', 'link-check-failed']
          }
        },
        {
          name: 'github_workflow',
          runningData: {
            workflowId: 81234,
            branch: 'main',
            commit: 'def789abc012'
          },
          completedData: {
            jobs: ['build-hugo-site', 'deploy-to-pages'],
            queuedDuration: 9000,
            executionDuration: 270000,
            runner: 'ubuntu-latest'
          }
        }
      ]
    }
  }
};

export function clonePipelineFixture(name) {
  const fixture = pipelineFixtures[name];
  if (!fixture) {
    throw new Error(`Unknown pipeline fixture: ${name}`);
  }

  if (typeof structuredClone === 'function') {
    return structuredClone(fixture);
  }

  return JSON.parse(JSON.stringify(fixture));
}
