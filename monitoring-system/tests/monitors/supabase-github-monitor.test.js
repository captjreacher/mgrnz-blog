import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SupabaseGitHubMonitor } from '../../src/monitors/supabase-github-monitor.js';

describe('SupabaseGitHubMonitor', () => {
  let monitor;
  let mockDataStore;
  let config;

  beforeEach(() => {
    mockDataStore = {
      saveWebhookRecord: vi.fn(),
      getWebhookRecord: vi.fn(),
      getWebhookRecords: vi.fn()
    };

    config = {
      monitoring: {
        timeout: 30000,
        retryAttempts: 3
      }
    };

    monitor = new SupabaseGitHubMonitor(mockDataStore, config);
  });

  describe('startApiCallMonitoring', () => {
    it('should create and store initial API call record', async () => {
      const runId = 'test-run-123';
      const apiCallData = {
        endpoint: '/repos/owner/repo/actions/workflows/123/dispatches',
        method: 'POST',
        payload: { ref: 'main' }
      };

      mockDataStore.saveWebhookRecord.mockResolvedValue({});

      const apiCallId = await monitor.startApiCallMonitoring(runId, apiCallData);

      expect(apiCallId).toMatch(/^github_api_/);
      expect(mockDataStore.saveWebhookRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          id: apiCallId,
          runId: runId,
          source: 'supabase',
          destination: 'github',
          payload: apiCallData.payload
        })
      );
    });

    it('should initialize API call record with correct structure', async () => {
      const runId = 'test-run-123';
      const apiCallData = { payload: {} };

      mockDataStore.saveWebhookRecord.mockResolvedValue({});

      await monitor.startApiCallMonitoring(runId, apiCallData);

      const savedRecord = mockDataStore.saveWebhookRecord.mock.calls[0][0];
      
      expect(savedRecord).toMatchObject({
        source: 'supabase',
        destination: 'github',
        response: null,
        timing: {
          sent: expect.any(String),
          received: null,
          processed: null
        },
        authentication: {
          method: 'token',
          success: false,
          errors: []
        },
        retries: [],
        apiDetails: {
          endpoint: '',
          method: 'POST',
          rateLimitInfo: null
        }
      });
    });
  });

  describe('logApiRequest', () => {
    it('should log API request details', async () => {
      const apiCallId = 'github_api_123';
      const requestData = {
        endpoint: '/repos/owner/repo/actions/workflows/123/dispatches',
        method: 'POST',
        payload: { ref: 'main', inputs: {} },
        token: 'ghp_validtoken123'
      };

      const existingRecord = {
        id: apiCallId,
        payload: {},
        timing: {},
        apiDetails: { endpoint: '', method: 'POST' },
        authentication: { errors: [] }
      };

      mockDataStore.getWebhookRecord.mockResolvedValue(existingRecord);
      mockDataStore.saveWebhookRecord.mockResolvedValue({});

      await monitor.logApiRequest(apiCallId, requestData);

      expect(mockDataStore.saveWebhookRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: requestData.payload,
          apiDetails: expect.objectContaining({
            endpoint: requestData.endpoint,
            method: requestData.method
          }),
          authentication: expect.objectContaining({
            success: true
          })
        })
      );
    });

    it('should validate GitHub token in request', async () => {
      const apiCallId = 'github_api_123';
      const requestData = {
        endpoint: '/test',
        token: 'invalid-token'
      };

      const existingRecord = {
        id: apiCallId,
        payload: {},
        timing: {},
        apiDetails: { endpoint: '', method: 'POST' },
        authentication: { errors: [] }
      };

      mockDataStore.getWebhookRecord.mockResolvedValue(existingRecord);
      mockDataStore.saveWebhookRecord.mockResolvedValue({});

      await monitor.logApiRequest(apiCallId, requestData);

      expect(mockDataStore.saveWebhookRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          authentication: expect.objectContaining({
            success: false,
            errors: expect.arrayContaining([
              expect.stringContaining('GitHub token format not recognized')
            ])
          })
        })
      );
    });
  });

  describe('logApiResponse', () => {
    it('should log successful API response with rate limit info', async () => {
      const apiCallId = 'github_api_123';
      const response = {
        status: 204,
        body: null,
        headers: {
          'x-ratelimit-limit': '5000',
          'x-ratelimit-remaining': '4999',
          'x-ratelimit-reset': '1640995200',
          'x-ratelimit-used': '1'
        }
      };

      const existingRecord = {
        id: apiCallId,
        timing: { sent: '2025-01-01T00:00:00Z' },
        apiDetails: {}
      };

      mockDataStore.getWebhookRecord.mockResolvedValue(existingRecord);
      mockDataStore.saveWebhookRecord.mockResolvedValue({});

      const rateLimitInfo = await monitor.logApiResponse(apiCallId, response);

      expect(rateLimitInfo).toMatchObject({
        limit: 5000,
        remaining: 4999,
        resetTime: 1640995200000,
        used: 1,
        resource: 'core'
      });

      expect(mockDataStore.saveWebhookRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          response: response,
          timing: expect.objectContaining({
            received: expect.any(String)
          }),
          apiDetails: expect.objectContaining({
            rateLimitInfo: rateLimitInfo
          })
        })
      );
    });

    it('should handle rate limit exceeded response', async () => {
      const apiCallId = 'github_api_123';
      const response = {
        status: 429,
        body: { message: 'API rate limit exceeded' },
        headers: {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': '1640995200',
          'x-ratelimit-limit': '5000'
        }
      };

      const existingRecord = {
        id: apiCallId,
        timing: { sent: '2025-01-01T00:00:00Z' },
        apiDetails: {}
      };

      mockDataStore.getWebhookRecord.mockResolvedValue(existingRecord);
      mockDataStore.saveWebhookRecord.mockResolvedValue({});

      const rateLimitInfo = await monitor.logApiResponse(apiCallId, response);

      expect(rateLimitInfo.remaining).toBe(0);
      expect(monitor.rateLimitInfo.remaining).toBe(0);
    });
  });

  describe('trackRetryAttempt', () => {
    it('should track retry attempt with details', async () => {
      const apiCallId = 'github_api_123';
      const retryData = {
        reason: 'Rate limit exceeded',
        success: false,
        delay: 5000
      };

      const existingRecord = {
        id: apiCallId,
        retries: []
      };

      mockDataStore.getWebhookRecord.mockResolvedValue(existingRecord);
      mockDataStore.saveWebhookRecord.mockResolvedValue({});

      await monitor.trackRetryAttempt(apiCallId, retryData);

      expect(mockDataStore.saveWebhookRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          retries: [
            expect.objectContaining({
              attempt: 1,
              reason: retryData.reason,
              success: retryData.success,
              delay: retryData.delay,
              timestamp: expect.any(String)
            })
          ]
        })
      );
    });

    it('should increment attempt number for multiple retries', async () => {
      const apiCallId = 'github_api_123';
      const retryData = { reason: 'Server error', success: false };

      const existingRecord = {
        id: apiCallId,
        retries: [
          { attempt: 1, timestamp: '2025-01-01T00:00:01Z' }
        ]
      };

      mockDataStore.getWebhookRecord.mockResolvedValue(existingRecord);
      mockDataStore.saveWebhookRecord.mockResolvedValue({});

      await monitor.trackRetryAttempt(apiCallId, retryData);

      expect(mockDataStore.saveWebhookRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          retries: expect.arrayContaining([
            expect.objectContaining({ attempt: 2 })
          ])
        })
      );
    });
  });

  describe('checkRateLimitStatus', () => {
    it('should return not limited when rate limit is healthy', async () => {
      monitor.rateLimitInfo = {
        remaining: 1000,
        resetTime: Date.now() + 3600000, // 1 hour from now
        limit: 5000
      };

      const status = await monitor.checkRateLimitStatus();

      expect(status).toMatchObject({
        isLimited: false,
        remaining: 1000,
        waitTime: 0,
        recommendedDelay: 0
      });
    });

    it('should return limited when rate limit is low', async () => {
      const resetTime = Date.now() + 1800000; // 30 minutes from now
      monitor.rateLimitInfo = {
        remaining: 5,
        resetTime: resetTime,
        limit: 5000
      };

      const status = await monitor.checkRateLimitStatus();

      expect(status).toMatchObject({
        isLimited: true,
        remaining: 5,
        waitTime: expect.any(Number),
        recommendedDelay: expect.any(Number)
      });
      expect(status.waitTime).toBeGreaterThan(0);
      expect(status.recommendedDelay).toBeGreaterThan(0);
    });

    it('should handle no rate limit info', async () => {
      monitor.rateLimitInfo = {
        remaining: null,
        resetTime: null,
        limit: null
      };

      const status = await monitor.checkRateLimitStatus();

      expect(status).toMatchObject({
        isLimited: false,
        remaining: null,
        waitTime: 0,
        recommendedDelay: 0
      });
    });
  });

  describe('completeApiCallMonitoring', () => {
    it('should calculate comprehensive API call metrics', async () => {
      const apiCallId = 'github_api_123';
      const apiCallRecord = {
        id: apiCallId,
        apiDetails: {
          endpoint: '/repos/owner/repo/actions/workflows/123/dispatches',
          method: 'POST',
          rateLimitInfo: { remaining: 4999 }
        },
        timing: {
          sent: '2025-01-01T00:00:00Z',
          received: '2025-01-01T00:00:01Z'
        },
        response: { status: 204 },
        payload: { ref: 'main' },
        retries: []
      };

      mockDataStore.getWebhookRecord.mockResolvedValue(apiCallRecord);
      mockDataStore.saveWebhookRecord.mockResolvedValue({});

      const metrics = await monitor.completeApiCallMonitoring(apiCallId);

      expect(metrics).toMatchObject({
        apiCallId: apiCallId,
        endpoint: apiCallRecord.apiDetails.endpoint,
        method: apiCallRecord.apiDetails.method,
        responseTime: expect.any(Number),
        totalTime: expect.any(Number),
        success: true,
        statusCode: 204,
        retryCount: 0,
        rateLimitInfo: apiCallRecord.apiDetails.rateLimitInfo,
        payloadSize: expect.any(Number)
      });
    });

    it('should remove API call from active tracking', async () => {
      const apiCallId = 'github_api_123';
      const apiCallRecord = {
        id: apiCallId,
        apiDetails: { endpoint: '/test', method: 'POST' },
        timing: { sent: '2025-01-01T00:00:00Z' },
        response: { status: 204 },
        payload: {},
        retries: []
      };

      mockDataStore.getWebhookRecord.mockResolvedValue(apiCallRecord);
      mockDataStore.saveWebhookRecord.mockResolvedValue({});

      // Add to active tracking
      monitor.activeApiCalls.set(apiCallId, apiCallRecord);
      expect(monitor.activeApiCalls.has(apiCallId)).toBe(true);

      await monitor.completeApiCallMonitoring(apiCallId);

      expect(monitor.activeApiCalls.has(apiCallId)).toBe(false);
    });
  });

  describe('monitorWorkflowDispatch', () => {
    it('should return true for successful workflow dispatch', async () => {
      const apiCallId = 'github_api_123';
      const workflowId = 'workflow-123';

      const apiCallRecord = {
        id: apiCallId,
        response: { status: 204 }
      };

      mockDataStore.getWebhookRecord.mockResolvedValue(apiCallRecord);
      monitor._verifyWorkflowStarted = vi.fn().mockResolvedValue(true);

      const result = await monitor.monitorWorkflowDispatch(apiCallId, workflowId);

      expect(result).toBe(true);
      expect(monitor._verifyWorkflowStarted).toHaveBeenCalledWith(workflowId);
    });

    it('should return false for failed API call', async () => {
      const apiCallId = 'github_api_123';
      const workflowId = 'workflow-123';

      const apiCallRecord = {
        id: apiCallId,
        response: { status: 401 }
      };

      mockDataStore.getWebhookRecord.mockResolvedValue(apiCallRecord);

      const result = await monitor.monitorWorkflowDispatch(apiCallId, workflowId);

      expect(result).toBe(false);
    });
  });

  describe('getApiCallStatistics', () => {
    it('should calculate comprehensive statistics', async () => {
      const apiCalls = [
        {
          destination: 'github',
          response: { status: 204 },
          timing: { sent: '2025-01-01T00:00:00Z', received: '2025-01-01T00:00:01Z' },
          retries: []
        },
        {
          destination: 'github',
          response: { status: 429 },
          timing: { sent: '2025-01-01T00:00:00Z', received: '2025-01-01T00:00:02Z' },
          retries: [{ attempt: 1 }]
        },
        {
          destination: 'github',
          response: { status: 500 },
          timing: { sent: '2025-01-01T00:00:00Z' },
          retries: [{ attempt: 1 }, { attempt: 2 }]
        }
      ];

      monitor._getAllGitHubApiCalls = vi.fn().mockResolvedValue(apiCalls);

      const stats = await monitor.getApiCallStatistics();

      expect(stats).toMatchObject({
        total: 3,
        successful: 1,
        failed: 2,
        rateLimited: 1,
        retried: 2,
        totalRetries: 3,
        averageResponseTime: expect.any(Number)
      });
    });

    it('should filter by run ID when provided', async () => {
      const runId = 'test-run-123';
      const apiCalls = [
        {
          destination: 'github',
          response: { status: 204 },
          timing: { sent: '2025-01-01T00:00:00Z', received: '2025-01-01T00:00:01Z' },
          retries: []
        }
      ];

      mockDataStore.getWebhookRecords.mockResolvedValue(apiCalls);

      const stats = await monitor.getApiCallStatistics(runId);

      expect(mockDataStore.getWebhookRecords).toHaveBeenCalledWith(runId);
      expect(stats.total).toBe(1);
    });
  });

  describe('GitHub token validation', () => {
    it('should validate proper GitHub token formats', () => {
      const validTokens = [
        'ghp_1234567890abcdef1234567890abcdef12345678',
        'github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz'
      ];

      validTokens.forEach(token => {
        const result = monitor._validateGitHubToken(token);
        expect(result.success).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    it('should reject invalid GitHub token formats', () => {
      const invalidTokens = [
        '',
        'short',
        'invalid-format-token',
        123,
        null,
        undefined
      ];

      invalidTokens.forEach(token => {
        const result = monitor._validateGitHubToken(token);
        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });
  });

  describe('rate limit extraction', () => {
    it('should extract complete rate limit information', () => {
      const headers = {
        'x-ratelimit-limit': '5000',
        'x-ratelimit-remaining': '4999',
        'x-ratelimit-reset': '1640995200',
        'x-ratelimit-used': '1',
        'x-ratelimit-resource': 'core'
      };

      const rateLimitInfo = monitor._extractRateLimitInfo(headers);

      expect(rateLimitInfo).toEqual({
        limit: 5000,
        remaining: 4999,
        resetTime: 1640995200000,
        used: 1,
        resource: 'core'
      });
    });

    it('should handle missing rate limit headers', () => {
      const headers = {};

      const rateLimitInfo = monitor._extractRateLimitInfo(headers);

      expect(rateLimitInfo).toEqual({
        limit: null,
        remaining: null,
        resetTime: null,
        used: null,
        resource: 'core'
      });
    });
  });

  describe('backoff delay calculation', () => {
    it('should calculate appropriate delays for different remaining counts', () => {
      const testCases = [
        { remaining: 0, expectedDelay: 60000 },
        { remaining: 3, expectedDelay: 30000 },
        { remaining: 8, expectedDelay: 10000 },
        { remaining: 50, expectedDelay: 0 }
      ];

      testCases.forEach(({ remaining, expectedDelay }) => {
        const delay = monitor._calculateBackoffDelay(remaining);
        expect(delay).toBe(expectedDelay);
      });
    });
  });

  describe('response time calculation', () => {
    it('should calculate response time correctly', () => {
      const apiCallRecord = {
        timing: {
          sent: '2025-01-01T00:00:00Z',
          received: '2025-01-01T00:00:02Z'
        }
      };

      const responseTime = monitor._calculateResponseTime(apiCallRecord);

      expect(responseTime).toBe(2000); // 2 seconds in milliseconds
    });

    it('should return 0 for incomplete timing', () => {
      const apiCallRecord = {
        timing: {
          sent: '2025-01-01T00:00:00Z',
          received: null
        }
      };

      const responseTime = monitor._calculateResponseTime(apiCallRecord);

      expect(responseTime).toBe(0);
    });
  });
});