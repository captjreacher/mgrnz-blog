import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebhookListener } from '../../src/monitors/webhook-listener.js';
import { TriggerMonitor } from '../../src/monitors/trigger-monitor.js';
import { DataStore } from '../../src/storage/data-store.js';

// Mock dependencies
vi.mock('../../src/monitors/trigger-monitor.js');
vi.mock('../../src/storage/data-store.js');

describe('WebhookListener', () => {
  let webhookListener;
  let mockTriggerMonitor;
  let mockDataStore;
  let mockConfig;

  beforeEach(() => {
    // Create mock trigger monitor
    mockTriggerMonitor = {
      registerWebhookListener: vi.fn(),
      processWebhookTrigger: vi.fn().mockResolvedValue('test-run-id'),
      engine: {
        updatePipelineStage: vi.fn().mockResolvedValue(),
        addError: vi.fn().mockResolvedValue()
      }
    };

    // Create mock data store
    mockDataStore = {
      saveWebhookRecord: vi.fn().mockResolvedValue(),
      getWebhookRecord: vi.fn().mockResolvedValue(null),
      getWebhookRecords: vi.fn().mockResolvedValue([])
    };

    mockConfig = {
      webhookTimeout: 30000
    };

    webhookListener = new WebhookListener(mockTriggerMonitor, mockDataStore, mockConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully and register webhook handlers', async () => {
      const result = await webhookListener.initialize();

      expect(result).toBe(true);
      expect(mockTriggerMonitor.registerWebhookListener).toHaveBeenCalledWith(
        'mailerlite',
        expect.any(Function)
      );
      expect(mockTriggerMonitor.registerWebhookListener).toHaveBeenCalledWith(
        'github',
        expect.any(Function)
      );
    });

    it('should handle initialization errors', async () => {
      mockTriggerMonitor.registerWebhookListener.mockImplementation(() => {
        throw new Error('Registration failed');
      });

      await expect(webhookListener.initialize()).rejects.toThrow('Registration failed');
    });
  });

  describe('webhook interception', () => {
    beforeEach(async () => {
      await webhookListener.initialize();
    });

    it('should intercept MailerLite webhook successfully', async () => {
      const payload = {
        type: 'subscriber.created',
        data: { email: 'test@example.com', name: 'Test User' }
      };
      const headers = {
        'content-type': 'application/json',
        'user-agent': 'MailerLite-Webhook/1.0',
        'x-mailerlite-signature': 'valid-signature'
      };
      const requestInfo = { sentTime: '2025-10-28T12:00:00Z' };

      const webhookId = await webhookListener.interceptWebhook('mailerlite', payload, headers, requestInfo);

      expect(webhookId).toMatch(/^webhook_[a-f0-9]{12}$/);
      expect(mockTriggerMonitor.processWebhookTrigger).toHaveBeenCalledWith('mailerlite', payload, headers);
      expect(mockDataStore.saveWebhookRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          id: webhookId,
          runId: 'test-run-id',
          source: 'mailerlite',
          destination: 'supabase',
          payload: expect.objectContaining({
            type: 'subscriber.created',
            data: { email: 'test@example.com', name: 'Test User' }
          }),
          timing: expect.objectContaining({
            sent: '2025-10-28T12:00:00Z',
            received: expect.any(String)
          }),
          authentication: expect.objectContaining({
            method: 'token',
            success: true
          })
        })
      );
    });

    it('should intercept GitHub webhook successfully', async () => {
      const payload = {
        action: 'opened',
        repository: { full_name: 'user/repo' },
        pull_request: { id: 123 }
      };
      const headers = {
        'content-type': 'application/json',
        'x-github-event': 'pull_request',
        'x-github-delivery': 'delivery-123',
        'x-hub-signature-256': 'sha256=valid-signature'
      };

      const webhookId = await webhookListener.interceptWebhook('github', payload, headers);

      expect(webhookId).toMatch(/^webhook_[a-f0-9]{12}$/);
      expect(mockDataStore.saveWebhookRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'github',
          destination: 'site',
          authentication: expect.objectContaining({
            method: 'signature',
            success: true
          }),
          metadata: expect.objectContaining({
            eventType: 'pull_request',
            deliveryId: 'delivery-123'
          })
        })
      );
    });

    it('should sanitize sensitive data in payload', async () => {
      const payload = {
        type: 'test',
        password: 'secret123',
        token: 'api-token-456',
        data: {
          email: 'test@example.com',
          secret: 'another-secret'
        }
      };

      await webhookListener.interceptWebhook('mailerlite', payload);

      const saveCall = mockDataStore.saveWebhookRecord.mock.calls[0][0];
      expect(saveCall.payload.password).toBe('[REDACTED]');
      expect(saveCall.payload.token).toBe('[REDACTED]');
      expect(saveCall.payload.data.secret).toBe('[REDACTED]');
      expect(saveCall.payload.data.email).toBe('test@example.com');
    });

    it('should handle webhook interception errors', async () => {
      mockTriggerMonitor.processWebhookTrigger.mockRejectedValue(new Error('Processing failed'));

      await expect(webhookListener.interceptWebhook('mailerlite', {})).rejects.toThrow('Processing failed');
    });
  });

  describe('webhook response handling', () => {
    let webhookId;

    beforeEach(async () => {
      await webhookListener.initialize();
      
      const mockWebhookRecord = {
        id: 'webhook_123456789012',
        runId: 'test-run-id',
        timing: { received: '2025-10-28T12:00:00Z' },
        metadata: {}
      };
      
      webhookListener.activeWebhooks.set('webhook_123456789012', mockWebhookRecord);
      webhookId = 'webhook_123456789012';
    });

    it('should update webhook response successfully', async () => {
      const responseBody = { success: true, message: 'Processed' };
      const responseHeaders = { 'content-type': 'application/json' };

      await webhookListener.updateWebhookResponse(webhookId, 200, responseBody, responseHeaders);

      expect(mockDataStore.saveWebhookRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          response: {
            status: 200,
            body: responseBody,
            headers: responseHeaders
          },
          timing: expect.objectContaining({
            processed: expect.any(String)
          }),
          metadata: expect.objectContaining({
            processingTimeMs: expect.any(Number)
          })
        })
      );
    });

    it('should handle webhook record not found', async () => {
      await expect(webhookListener.updateWebhookResponse('nonexistent', 200, {}))
        .rejects.toThrow('Webhook record not found: nonexistent');
    });

    it('should sanitize response body', async () => {
      const responseBody = {
        success: true,
        token: 'secret-token',
        data: { password: 'secret-password' }
      };

      await webhookListener.updateWebhookResponse(webhookId, 200, responseBody);

      const saveCall = mockDataStore.saveWebhookRecord.mock.calls[0][0];
      expect(saveCall.response.body.token).toBe('[REDACTED]');
      expect(saveCall.response.body.data.password).toBe('[REDACTED]');
      expect(saveCall.response.body.success).toBe(true);
    });
  });

  describe('retry attempt recording', () => {
    let webhookId;

    beforeEach(async () => {
      await webhookListener.initialize();
      
      const mockWebhookRecord = {
        id: 'webhook_123456789012',
        retries: []
      };
      
      webhookListener.activeWebhooks.set('webhook_123456789012', mockWebhookRecord);
      webhookId = 'webhook_123456789012';
    });

    it('should record retry attempt successfully', async () => {
      await webhookListener.recordRetryAttempt(webhookId, 1, 'timeout', false);

      expect(mockDataStore.saveWebhookRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          retries: [
            {
              attempt: 1,
              timestamp: expect.any(String),
              reason: 'timeout',
              success: false
            }
          ]
        })
      );
    });

    it('should record multiple retry attempts', async () => {
      await webhookListener.recordRetryAttempt(webhookId, 1, 'timeout', false);
      await webhookListener.recordRetryAttempt(webhookId, 2, 'network_error', false);
      await webhookListener.recordRetryAttempt(webhookId, 3, 'retry_success', true);

      const finalCall = mockDataStore.saveWebhookRecord.mock.calls[2][0];
      expect(finalCall.retries).toHaveLength(3);
      expect(finalCall.retries[2].success).toBe(true);
    });
  });

  describe('webhook correlation', () => {
    beforeEach(async () => {
      await webhookListener.initialize();
    });

    it('should get webhook correlation for pipeline run', async () => {
      const mockWebhooks = [
        { id: 'webhook_1', runId: 'test-run-id', source: 'mailerlite' },
        { id: 'webhook_2', runId: 'test-run-id', source: 'github' }
      ];
      
      mockDataStore.getWebhookRecords.mockResolvedValue(mockWebhooks);

      const result = await webhookListener.getWebhookCorrelation('test-run-id');

      expect(result).toEqual(mockWebhooks);
      expect(mockDataStore.getWebhookRecords).toHaveBeenCalledWith('test-run-id');
    });

    it('should handle correlation errors', async () => {
      mockDataStore.getWebhookRecords.mockRejectedValue(new Error('Database error'));

      await expect(webhookListener.getWebhookCorrelation('test-run-id'))
        .rejects.toThrow('Database error');
    });
  });

  describe('MailerLite webhook handler', () => {
    beforeEach(async () => {
      await webhookListener.initialize();
    });

    it('should handle MailerLite subscriber created event', async () => {
      const payload = {
        type: 'subscriber.created',
        data: { email: 'test@example.com', name: 'Test User' }
      };

      await webhookListener._handleMailerLiteWebhook('test-run-id', payload, {});

      expect(mockTriggerMonitor.engine.updatePipelineStage).toHaveBeenCalledWith(
        'test-run-id',
        'mailerlite_webhook_received',
        'completed',
        expect.objectContaining({
          eventType: 'subscriber.created',
          subscriberEmail: 'test@example.com',
          webhookSource: 'mailerlite'
        })
      );
    });

    it('should trigger Supabase processing for relevant events', async () => {
      const payload = {
        type: 'subscriber.created',
        data: { email: 'test@example.com' }
      };

      await webhookListener._handleMailerLiteWebhook('test-run-id', payload, {});

      expect(mockTriggerMonitor.engine.updatePipelineStage).toHaveBeenCalledWith(
        'test-run-id',
        'supabase_processing_triggered',
        'running',
        expect.objectContaining({
          triggerReason: 'MailerLite subscriber.created event',
          expectedAction: 'content_creation'
        })
      );
    });

    it('should handle MailerLite webhook errors', async () => {
      mockTriggerMonitor.engine.updatePipelineStage.mockRejectedValue(new Error('Stage update failed'));

      await webhookListener._handleMailerLiteWebhook('test-run-id', {}, {});

      expect(mockTriggerMonitor.engine.addError).toHaveBeenCalledWith(
        'test-run-id',
        'mailerlite_webhook',
        'processing_error',
        'Stage update failed'
      );
    });
  });

  describe('GitHub webhook handler', () => {
    beforeEach(async () => {
      await webhookListener.initialize();
    });

    it('should handle GitHub push event', async () => {
      const payload = {
        ref: 'refs/heads/main',
        repository: { full_name: 'user/repo' },
        commits: [{ id: 'abc123' }]
      };
      const headers = { 'x-github-event': 'push' };

      await webhookListener._handleGitHubWebhook('test-run-id', payload, headers);

      expect(mockTriggerMonitor.engine.updatePipelineStage).toHaveBeenCalledWith(
        'test-run-id',
        'github_webhook_received',
        'completed',
        expect.objectContaining({
          eventType: 'push',
          action: 'unknown',
          repository: 'user/repo',
          webhookSource: 'github'
        })
      );
    });

    it('should trigger workflow for push to main branch', async () => {
      const payload = {
        ref: 'refs/heads/main',
        repository: { full_name: 'user/repo' }
      };
      const headers = { 'x-github-event': 'push' };

      await webhookListener._handleGitHubWebhook('test-run-id', payload, headers);

      expect(mockTriggerMonitor.engine.updatePipelineStage).toHaveBeenCalledWith(
        'test-run-id',
        'github_workflow_triggered',
        'running',
        expect.objectContaining({
          triggerReason: 'GitHub push unknown',
          expectedWorkflow: 'deploy-gh-pages'
        })
      );
    });

    it('should handle GitHub webhook errors', async () => {
      mockTriggerMonitor.engine.updatePipelineStage.mockRejectedValue(new Error('Stage update failed'));

      await webhookListener._handleGitHubWebhook('test-run-id', {}, {});

      expect(mockTriggerMonitor.engine.addError).toHaveBeenCalledWith(
        'test-run-id',
        'github_webhook',
        'processing_error',
        'Stage update failed'
      );
    });
  });

  describe('authentication validation', () => {
    beforeEach(async () => {
      await webhookListener.initialize();
    });

    it('should validate MailerLite authentication with token', async () => {
      const headers = { 'x-mailerlite-signature': 'valid-signature' };
      
      const auth = await webhookListener._validateAuthentication('mailerlite', headers, {});
      
      expect(auth).toEqual({
        method: 'token',
        success: true,
        errors: []
      });
    });

    it('should fail MailerLite authentication without token', async () => {
      const auth = await webhookListener._validateAuthentication('mailerlite', {}, {});
      
      expect(auth).toEqual({
        method: 'token',
        success: false,
        errors: ['Missing MailerLite webhook signature/token']
      });
    });

    it('should validate GitHub authentication with signature', async () => {
      const headers = { 'x-hub-signature-256': 'sha256=valid-signature' };
      
      const auth = await webhookListener._validateAuthentication('github', headers, {});
      
      expect(auth).toEqual({
        method: 'signature',
        success: true,
        errors: []
      });
    });

    it('should fail GitHub authentication without signature', async () => {
      const auth = await webhookListener._validateAuthentication('github', {}, {});
      
      expect(auth).toEqual({
        method: 'signature',
        success: false,
        errors: ['Missing GitHub webhook signature']
      });
    });

    it('should handle unknown webhook types', async () => {
      const auth = await webhookListener._validateAuthentication('unknown', {}, {});
      
      expect(auth).toEqual({
        method: 'unknown',
        success: true,
        errors: []
      });
    });
  });

  describe('lifecycle management', () => {
    it('should start listening successfully', async () => {
      await webhookListener.startListening();

      expect(webhookListener.isListening).toBe(true);
    });

    it('should stop listening successfully', async () => {
      await webhookListener.startListening();
      
      await webhookListener.stopListening();

      expect(webhookListener.isListening).toBe(false);
      expect(webhookListener.activeWebhooks.size).toBe(0);
    });
  });
});