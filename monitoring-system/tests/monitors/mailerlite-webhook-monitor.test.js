import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MailerLiteWebhookMonitor } from '../../src/monitors/mailerlite-webhook-monitor.js';
import { DataStore } from '../../src/storage/data-store.js';

describe('MailerLiteWebhookMonitor', () => {
  let monitor;
  let mockDataStore;
  let config;

  beforeEach(() => {
    // Mock DataStore
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

    monitor = new MailerLiteWebhookMonitor(mockDataStore, config);
  });

  describe('startWebhookMonitoring', () => {
    it('should create and store initial webhook record', async () => {
      const runId = 'test-run-123';
      const webhookData = {
        payload: { events: [{ type: 'subscriber.created', data: {} }] }
      };

      mockDataStore.saveWebhookRecord.mockResolvedValue({});

      const webhookId = await monitor.startWebhookMonitoring(runId, webhookData);

      expect(webhookId).toMatch(/^webhook_/);
      expect(mockDataStore.saveWebhookRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          id: webhookId,
          runId: runId,
          source: 'mailerlite',
          destination: 'supabase',
          payload: webhookData.payload
        })
      );
    });

    it('should initialize webhook record with correct structure', async () => {
      const runId = 'test-run-123';
      const webhookData = { payload: {} };

      mockDataStore.saveWebhookRecord.mockResolvedValue({});

      await monitor.startWebhookMonitoring(runId, webhookData);

      const savedRecord = mockDataStore.saveWebhookRecord.mock.calls[0][0];
      
      expect(savedRecord).toMatchObject({
        source: 'mailerlite',
        destination: 'supabase',
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
        retries: []
      });
    });
  });

  describe('logWebhookPayload', () => {
    it('should validate and log valid MailerLite payload', async () => {
      const webhookId = 'webhook-123';
      const payload = {
        events: [
          { type: 'subscriber.created', data: { email: 'test@example.com' } }
        ]
      };

      const existingRecord = {
        id: webhookId,
        payload: {},
        timing: { sent: '2025-01-01T00:00:00Z' },
        authentication: { errors: [] }
      };

      mockDataStore.getWebhookRecord.mockResolvedValue(existingRecord);
      mockDataStore.saveWebhookRecord.mockResolvedValue({});

      const validation = await monitor.logWebhookPayload(webhookId, payload);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(mockDataStore.saveWebhookRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: payload,
          timing: expect.objectContaining({
            received: expect.any(String)
          })
        })
      );
    });

    it('should detect invalid MailerLite payload', async () => {
      const webhookId = 'webhook-123';
      const invalidPayload = { invalid: 'payload' }; // Missing events array

      const existingRecord = {
        id: webhookId,
        payload: {},
        timing: { sent: '2025-01-01T00:00:00Z' },
        authentication: { errors: [] }
      };

      mockDataStore.getWebhookRecord.mockResolvedValue(existingRecord);
      mockDataStore.saveWebhookRecord.mockResolvedValue({});

      const validation = await monitor.logWebhookPayload(webhookId, invalidPayload);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Missing or invalid events array');
    });

    it('should handle missing webhook record', async () => {
      const webhookId = 'nonexistent-webhook';
      const payload = { events: [] };

      mockDataStore.getWebhookRecord.mockResolvedValue(null);

      await expect(monitor.logWebhookPayload(webhookId, payload))
        .rejects.toThrow('Webhook record not found: nonexistent-webhook');
    });
  });

  describe('trackAuthentication', () => {
    it('should track successful authentication', async () => {
      const webhookId = 'webhook-123';
      const authData = { method: 'token', token: 'valid-token' };

      const existingRecord = {
        id: webhookId,
        authentication: { method: 'token', success: false, errors: [] }
      };

      mockDataStore.getWebhookRecord.mockResolvedValue(existingRecord);
      mockDataStore.saveWebhookRecord.mockResolvedValue({});

      const success = await monitor.trackAuthentication(webhookId, authData);

      expect(success).toBe(true);
      expect(mockDataStore.saveWebhookRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          authentication: {
            method: 'token',
            success: true,
            errors: []
          }
        })
      );
    });

    it('should track failed authentication', async () => {
      const webhookId = 'webhook-123';
      const authData = { method: 'token' }; // Missing token

      const existingRecord = {
        id: webhookId,
        authentication: { method: 'token', success: false, errors: [] }
      };

      mockDataStore.getWebhookRecord.mockResolvedValue(existingRecord);
      mockDataStore.saveWebhookRecord.mockResolvedValue({});

      const success = await monitor.trackAuthentication(webhookId, authData);

      expect(success).toBe(false);
      expect(mockDataStore.saveWebhookRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          authentication: expect.objectContaining({
            success: false,
            errors: expect.arrayContaining([
              expect.stringContaining('No authentication token')
            ])
          })
        })
      );
    });
  });

  describe('logWebhookResponse', () => {
    it('should log successful webhook response', async () => {
      const webhookId = 'webhook-123';
      const response = {
        status: 200,
        body: { success: true },
        headers: { 'content-type': 'application/json' }
      };

      const existingRecord = {
        id: webhookId,
        timing: { sent: '2025-01-01T00:00:00Z' }
      };

      mockDataStore.getWebhookRecord.mockResolvedValue(existingRecord);
      mockDataStore.saveWebhookRecord.mockResolvedValue({});

      await monitor.logWebhookResponse(webhookId, response);

      expect(mockDataStore.saveWebhookRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          response: response,
          timing: expect.objectContaining({
            processed: expect.any(String)
          })
        })
      );
    });

    it('should log error webhook response', async () => {
      const webhookId = 'webhook-123';
      const response = {
        status: 500,
        body: { error: 'Internal server error' },
        headers: {}
      };

      const existingRecord = {
        id: webhookId,
        timing: { sent: '2025-01-01T00:00:00Z' }
      };

      mockDataStore.getWebhookRecord.mockResolvedValue(existingRecord);
      mockDataStore.saveWebhookRecord.mockResolvedValue({});

      await monitor.logWebhookResponse(webhookId, response);

      expect(mockDataStore.saveWebhookRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          response: response
        })
      );
    });
  });

  describe('completeWebhookMonitoring', () => {
    it('should calculate and return webhook metrics', async () => {
      const webhookId = 'webhook-123';
      const webhookRecord = {
        id: webhookId,
        timing: {
          sent: '2025-01-01T00:00:00Z',
          received: '2025-01-01T00:00:01Z',
          processed: '2025-01-01T00:00:02Z'
        },
        response: { status: 200 },
        authentication: { success: true },
        payload: { events: [] },
        retries: []
      };

      mockDataStore.getWebhookRecord.mockResolvedValue(webhookRecord);

      const metrics = await monitor.completeWebhookMonitoring(webhookId);

      expect(metrics).toMatchObject({
        webhookId: webhookId,
        processingTime: expect.any(Number),
        totalTime: expect.any(Number),
        success: true,
        authSuccess: true,
        payloadSize: expect.any(Number),
        retryCount: 0
      });
    });

    it('should remove webhook from active tracking', async () => {
      const webhookId = 'webhook-123';
      const webhookRecord = {
        id: webhookId,
        timing: { sent: '2025-01-01T00:00:00Z', processed: '2025-01-01T00:00:02Z' },
        response: { status: 200 },
        authentication: { success: true },
        payload: {},
        retries: []
      };

      mockDataStore.getWebhookRecord.mockResolvedValue(webhookRecord);

      // Add to active tracking first
      monitor.activeWebhooks.set(webhookId, webhookRecord);
      expect(monitor.activeWebhooks.has(webhookId)).toBe(true);

      await monitor.completeWebhookMonitoring(webhookId);

      expect(monitor.activeWebhooks.has(webhookId)).toBe(false);
    });
  });

  describe('monitorWebhookTimeout', () => {
    it('should resolve true when webhook completes within timeout', async () => {
      const webhookId = 'webhook-123';
      const timeoutMs = 5000;

      // Mock webhook record that gets processed
      const webhookRecord = {
        id: webhookId,
        timing: { processed: null }
      };

      const processedRecord = {
        ...webhookRecord,
        timing: { processed: '2025-01-01T00:00:02Z' }
      };

      mockDataStore.getWebhookRecord
        .mockResolvedValueOnce(webhookRecord)
        .mockResolvedValueOnce(processedRecord);

      const result = await monitor.monitorWebhookTimeout(webhookId, timeoutMs);

      expect(result).toBe(true);
    });

    it('should resolve false when webhook times out', async () => {
      const webhookId = 'webhook-123';
      const timeoutMs = 100; // Very short timeout for testing

      const webhookRecord = {
        id: webhookId,
        timing: { processed: null }
      };

      mockDataStore.getWebhookRecord.mockResolvedValue(webhookRecord);
      mockDataStore.saveWebhookRecord.mockResolvedValue({});

      const result = await monitor.monitorWebhookTimeout(webhookId, timeoutMs);

      expect(result).toBe(false);
      expect(mockDataStore.saveWebhookRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          response: expect.objectContaining({
            status: 408,
            body: { error: 'Webhook processing timeout' }
          })
        })
      );
    });
  });

  describe('getWebhookStatistics', () => {
    it('should calculate statistics for all webhooks', async () => {
      const webhooks = [
        {
          source: 'mailerlite',
          response: { status: 200 },
          authentication: { success: true },
          timing: { sent: '2025-01-01T00:00:00Z', processed: '2025-01-01T00:00:02Z' },
          retries: []
        },
        {
          source: 'mailerlite',
          response: { status: 500 },
          authentication: { success: false },
          timing: { sent: '2025-01-01T00:00:00Z' },
          retries: [{ attempt: 1 }]
        }
      ];

      // Mock the private method
      monitor._getAllMailerLiteWebhooks = vi.fn().mockResolvedValue(webhooks);

      const stats = await monitor.getWebhookStatistics();

      expect(stats).toMatchObject({
        total: 2,
        successful: 1,
        failed: 1,
        authFailures: 1,
        timeouts: 1,
        averageProcessingTime: expect.any(Number)
      });
    });

    it('should filter statistics by run ID', async () => {
      const runId = 'test-run-123';
      const webhooks = [
        {
          source: 'mailerlite',
          response: { status: 200 },
          authentication: { success: true },
          timing: { sent: '2025-01-01T00:00:00Z', processed: '2025-01-01T00:00:02Z' },
          retries: []
        }
      ];

      mockDataStore.getWebhookRecords.mockResolvedValue(webhooks);

      const stats = await monitor.getWebhookStatistics(runId);

      expect(mockDataStore.getWebhookRecords).toHaveBeenCalledWith(runId);
      expect(stats.total).toBe(1);
    });
  });

  describe('payload validation', () => {
    it('should validate MailerLite payload with multiple events', async () => {
      const payload = {
        events: [
          { type: 'subscriber.created', data: { email: 'test1@example.com' } },
          { type: 'subscriber.updated', data: { email: 'test2@example.com' } }
        ]
      };

      const validation = monitor._validateMailerLitePayload(payload);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect missing event fields', async () => {
      const payload = {
        events: [
          { type: 'subscriber.created' }, // Missing data
          { data: { email: 'test@example.com' } } // Missing type
        ]
      };

      const validation = monitor._validateMailerLitePayload(payload);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Event 0: missing data field');
      expect(validation.errors).toContain('Event 1: missing type field');
    });
  });

  describe('authentication validation', () => {
    it('should validate token authentication', () => {
      const authData = { token: 'valid-token-123' };
      const result = monitor._validateAuthentication(authData);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate signature authentication', () => {
      const authData = { signature: 'valid-signature-abc' };
      const result = monitor._validateAuthentication(authData);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject missing authentication', () => {
      const authData = {};
      const result = monitor._validateAuthentication(authData);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('No authentication token or signature provided');
    });
  });

  describe('timing calculations', () => {
    it('should calculate processing time correctly', () => {
      const webhookRecord = {
        timing: {
          received: '2025-01-01T00:00:01Z',
          processed: '2025-01-01T00:00:03Z'
        }
      };

      const processingTime = monitor._calculateProcessingTime(webhookRecord);

      expect(processingTime).toBe(2000); // 2 seconds in milliseconds
    });

    it('should return 0 for incomplete timing', () => {
      const webhookRecord = {
        timing: {
          received: '2025-01-01T00:00:01Z',
          processed: null
        }
      };

      const processingTime = monitor._calculateProcessingTime(webhookRecord);

      expect(processingTime).toBe(0);
    });
  });
});