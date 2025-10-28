import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebhookValidator } from '../../src/monitors/webhook-validator.js';

describe('WebhookValidator', () => {
  let validator;
  let mockDataStore;
  let config;

  beforeEach(() => {
    mockDataStore = {
      getWebhookRecord: vi.fn(),
      saveWebhookRecord: vi.fn()
    };

    config = {
      monitoring: {
        timeout: 300000,
        retryAttempts: 3
      }
    };

    validator = new WebhookValidator(mockDataStore, config);
  });

  describe('validateWebhookPayload', () => {
    it('should validate valid MailerLite payload', async () => {
      const payload = {
        events: [
          { type: 'subscriber.created', data: { email: 'test@example.com' } },
          { type: 'subscriber.updated', data: { email: 'test2@example.com' } }
        ]
      };

      const result = await validator.validateWebhookPayload(payload, 'mailerlite');

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.metadata.source).toBe('mailerlite');
      expect(result.metadata.payloadSize).toBeGreaterThan(0);
    });

    it('should detect invalid MailerLite payload', async () => {
      const payload = {
        events: [
          { type: 'subscriber.created' }, // Missing data
          { data: { email: 'test@example.com' } } // Missing type
        ]
      };

      const result = await validator.validateWebhookPayload(payload, 'mailerlite');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Event 0: missing data field');
      expect(result.errors).toContain('Event 1: missing type field');
    });

    it('should validate GitHub payload', async () => {
      const payload = {
        ref: 'refs/heads/main',
        inputs: { message: 'Deploy now' }
      };

      const result = await validator.validateWebhookPayload(payload, 'github');

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid GitHub payload', async () => {
      const payload = {
        inputs: 'invalid-inputs' // Should be object
      };

      const result = await validator.validateWebhookPayload(payload, 'github');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('GitHub payload missing ref or workflow_id');
      expect(result.errors).toContain('GitHub payload inputs must be an object');
    });

    it('should warn about large payloads', async () => {
      const largePayload = {
        events: [{
          type: 'subscriber.created',
          data: { 
            email: 'test@example.com',
            largeField: 'x'.repeat(2000000) // > 1MB
          }
        }]
      };

      const result = await validator.validateWebhookPayload(largePayload, 'mailerlite');

      expect(result.warnings).toContain('Payload size exceeds 1MB, may cause performance issues');
    });

    it('should handle invalid payload object', async () => {
      const result = await validator.validateWebhookPayload(null, 'mailerlite');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Payload must be a valid object');
    });
  });

  describe('validateWebhookResponse', () => {
    it('should validate successful response', async () => {
      const response = {
        status: 200,
        body: { success: true },
        headers: { 'content-type': 'application/json' }
      };

      const result = await validator.validateWebhookResponse(response, '2xx');

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.errorCategory).toBeNull();
      expect(result.retryRecommended).toBe(false);
    });

    it('should detect authentication errors', async () => {
      const response = {
        status: 401,
        body: { error: 'Unauthorized' },
        headers: {}
      };

      const result = await validator.validateWebhookResponse(response, '2xx');

      expect(result.isValid).toBe(false);
      expect(result.errorCategory).toBe(validator.errorCategories.AUTHENTICATION);
      expect(result.retryRecommended).toBe(false);
      expect(result.errors[0]).toContain('HTTP 401');
    });

    it('should detect rate limiting errors', async () => {
      const response = {
        status: 429,
        body: { error: 'Rate limit exceeded' },
        headers: {}
      };

      const result = await validator.validateWebhookResponse(response, '2xx');

      expect(result.isValid).toBe(false);
      expect(result.errorCategory).toBe(validator.errorCategories.RATE_LIMIT);
      expect(result.retryRecommended).toBe(true);
    });

    it('should detect server errors', async () => {
      const response = {
        status: 500,
        body: { error: 'Internal server error' },
        headers: {}
      };

      const result = await validator.validateWebhookResponse(response, '2xx');

      expect(result.isValid).toBe(false);
      expect(result.errorCategory).toBe(validator.errorCategories.SERVER_ERROR);
      expect(result.retryRecommended).toBe(true);
    });

    it('should handle network/timeout errors', async () => {
      const response = {
        status: 0,
        body: null,
        headers: {}
      };

      const result = await validator.validateWebhookResponse(response, '2xx');

      expect(result.isValid).toBe(false);
      expect(result.errorCategory).toBe(validator.errorCategories.NETWORK);
      expect(result.retryRecommended).toBe(true);
    });
  });

  describe('detectAndCategorizeErrors', () => {
    it('should detect authentication errors', async () => {
      const webhookRecord = {
        id: 'webhook-123',
        authentication: {
          success: false,
          errors: ['Invalid token']
        },
        response: { status: 200 },
        timing: { sent: '2025-01-01T00:00:00Z', processed: '2025-01-01T00:00:02Z' },
        retries: []
      };

      const analysis = await validator.detectAndCategorizeErrors(webhookRecord);

      expect(analysis.hasErrors).toBe(true);
      expect(analysis.primaryError).toBe('Authentication failed');
      expect(analysis.errorCategory).toBe(validator.errorCategories.AUTHENTICATION);
      expect(analysis.severity).toBe('high');
      expect(analysis.retryRecommended).toBe(false);
    });

    it('should detect timeout errors', async () => {
      const webhookRecord = {
        id: 'webhook-123',
        authentication: { success: true, errors: [] },
        response: null,
        timing: { 
          sent: new Date(Date.now() - 400000).toISOString(), // 400 seconds ago
          processed: null 
        },
        retries: []
      };

      const analysis = await validator.detectAndCategorizeErrors(webhookRecord);

      expect(analysis.hasErrors).toBe(true);
      expect(analysis.primaryError).toBe('Webhook processing timeout');
      expect(analysis.errorCategory).toBe(validator.errorCategories.TIMEOUT);
      expect(analysis.severity).toBe('medium');
      expect(analysis.retryRecommended).toBe(true);
    });

    it('should analyze retry patterns', async () => {
      const webhookRecord = {
        id: 'webhook-123',
        authentication: { success: true, errors: [] },
        response: { status: 200 },
        timing: { sent: '2025-01-01T00:00:00Z', processed: '2025-01-01T00:00:02Z' },
        retries: [
          { attempt: 1, success: false },
          { attempt: 2, success: false },
          { attempt: 3, success: false },
          { attempt: 4, success: false }
        ]
      };

      const analysis = await validator.detectAndCategorizeErrors(webhookRecord);

      expect(analysis.errorDetails).toContain('4 retry attempts made');
      expect(analysis.severity).toBe('high');
      expect(analysis.suggestedActions).toContain('Investigate underlying cause of failures');
    });

    it('should return no errors for successful webhook', async () => {
      const webhookRecord = {
        id: 'webhook-123',
        authentication: { success: true, errors: [] },
        response: { status: 200 },
        timing: { sent: '2025-01-01T00:00:00Z', processed: '2025-01-01T00:00:02Z' },
        retries: []
      };

      const analysis = await validator.detectAndCategorizeErrors(webhookRecord);

      expect(analysis.hasErrors).toBe(false);
      expect(analysis.primaryError).toBeNull();
      expect(analysis.errorCategory).toBeNull();
    });
  });

  describe('trackRetryAttempt', () => {
    it('should track retry attempt with backoff calculation', async () => {
      const webhookId = 'webhook-123';
      const retryContext = {
        reason: 'Server error',
        errorCategory: validator.errorCategories.SERVER_ERROR
      };

      const webhookRecord = {
        id: webhookId,
        retries: []
      };

      mockDataStore.getWebhookRecord.mockResolvedValue(webhookRecord);
      mockDataStore.saveWebhookRecord.mockResolvedValue({});

      const result = await validator.trackRetryAttempt(webhookId, retryContext);

      expect(result.shouldRetry).toBe(true);
      expect(result.delay).toBeGreaterThan(0);
      expect(result.strategy).toBe('exponential_backoff');
      expect(result.attemptNumber).toBe(1);
      expect(result.maxAttemptsReached).toBe(false);

      expect(mockDataStore.saveWebhookRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          retries: [
            expect.objectContaining({
              attempt: 1,
              reason: retryContext.reason,
              delay: result.delay
            })
          ]
        })
      );
    });

    it('should not retry authentication errors', async () => {
      const webhookId = 'webhook-123';
      const retryContext = {
        reason: 'Authentication failed',
        errorCategory: validator.errorCategories.AUTHENTICATION
      };

      const webhookRecord = {
        id: webhookId,
        retries: []
      };

      mockDataStore.getWebhookRecord.mockResolvedValue(webhookRecord);
      mockDataStore.saveWebhookRecord.mockResolvedValue({});

      const result = await validator.trackRetryAttempt(webhookId, retryContext);

      expect(result.shouldRetry).toBe(false);
      expect(result.strategy).toBe('no_retry_auth_error');
    });

    it('should stop retrying after max attempts', async () => {
      const webhookId = 'webhook-123';
      const retryContext = { reason: 'Server error' };

      const webhookRecord = {
        id: webhookId,
        retries: [
          { attempt: 1 },
          { attempt: 2 },
          { attempt: 3 }
        ]
      };

      mockDataStore.getWebhookRecord.mockResolvedValue(webhookRecord);
      mockDataStore.saveWebhookRecord.mockResolvedValue({});

      const result = await validator.trackRetryAttempt(webhookId, retryContext);

      expect(result.shouldRetry).toBe(false);
      expect(result.strategy).toBe('max_attempts_reached');
      expect(result.maxAttemptsReached).toBe(true);
    });

    it('should use longer delays for rate limiting', async () => {
      const webhookId = 'webhook-123';
      const retryContext = {
        reason: 'Rate limit exceeded',
        errorCategory: validator.errorCategories.RATE_LIMIT
      };

      const webhookRecord = {
        id: webhookId,
        retries: []
      };

      mockDataStore.getWebhookRecord.mockResolvedValue(webhookRecord);
      mockDataStore.saveWebhookRecord.mockResolvedValue({});

      const result = await validator.trackRetryAttempt(webhookId, retryContext);

      expect(result.delay).toBeGreaterThanOrEqual(60000); // At least 1 minute for rate limiting
    });
  });

  describe('updateRetryResult', () => {
    it('should update retry attempt success status', async () => {
      const webhookId = 'webhook-123';
      const attemptNumber = 2;
      const success = true;

      const webhookRecord = {
        id: webhookId,
        retries: [
          { attempt: 1, success: false },
          { attempt: 2, success: false }
        ]
      };

      mockDataStore.getWebhookRecord.mockResolvedValue(webhookRecord);
      mockDataStore.saveWebhookRecord.mockResolvedValue({});

      await validator.updateRetryResult(webhookId, attemptNumber, success);

      expect(mockDataStore.saveWebhookRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          retries: [
            { attempt: 1, success: false },
            { attempt: 2, success: true }
          ]
        })
      );
    });

    it('should handle non-existent retry attempt', async () => {
      const webhookId = 'webhook-123';
      const attemptNumber = 5; // Doesn't exist
      const success = true;

      const webhookRecord = {
        id: webhookId,
        retries: [
          { attempt: 1, success: false }
        ]
      };

      mockDataStore.getWebhookRecord.mockResolvedValue(webhookRecord);
      mockDataStore.saveWebhookRecord.mockResolvedValue({});

      await validator.updateRetryResult(webhookId, attemptNumber, success);

      // Should not save the record since no retry attempt was found
      expect(mockDataStore.saveWebhookRecord).not.toHaveBeenCalled();
    });
  });

  describe('generateErrorReport', () => {
    it('should generate comprehensive error report', async () => {
      const webhookId = 'webhook-123';
      const webhookRecord = {
        id: webhookId,
        runId: 'run-456',
        source: 'mailerlite',
        destination: 'supabase',
        authentication: { success: false, errors: ['Invalid token'] },
        response: { status: 401 },
        timing: { 
          sent: '2025-01-01T00:00:00Z',
          received: '2025-01-01T00:00:01Z',
          processed: '2025-01-01T00:00:02Z'
        },
        retries: [{ attempt: 1, timestamp: '2025-01-01T00:00:03Z' }],
        payload: { events: [] }
      };

      mockDataStore.getWebhookRecord.mockResolvedValue(webhookRecord);

      const report = await validator.generateErrorReport(webhookId);

      expect(report).toMatchObject({
        webhookId: webhookId,
        runId: 'run-456',
        source: 'mailerlite',
        destination: 'supabase',
        timestamp: expect.any(String),
        errorAnalysis: expect.objectContaining({
          hasErrors: true,
          primaryError: 'Authentication failed',
          errorCategory: validator.errorCategories.AUTHENTICATION
        }),
        timeline: expect.arrayContaining([
          expect.objectContaining({
            event: 'webhook_sent',
            timestamp: '2025-01-01T00:00:00Z'
          })
        ]),
        recommendations: expect.any(Array),
        metadata: expect.objectContaining({
          totalRetries: 1,
          processingTime: expect.any(Number),
          payloadSize: expect.any(Number)
        })
      });
    });

    it('should build correct timeline', async () => {
      const webhookId = 'webhook-123';
      const webhookRecord = {
        id: webhookId,
        runId: 'run-456',
        source: 'mailerlite',
        destination: 'supabase',
        authentication: { success: true, errors: [] },
        response: { status: 200 },
        timing: { 
          sent: '2025-01-01T00:00:00Z',
          received: '2025-01-01T00:00:01Z',
          processed: '2025-01-01T00:00:03Z'
        },
        retries: [
          { attempt: 1, timestamp: '2025-01-01T00:00:02Z', reason: 'Timeout' }
        ],
        payload: {}
      };

      mockDataStore.getWebhookRecord.mockResolvedValue(webhookRecord);

      const report = await validator.generateErrorReport(webhookId);

      expect(report.timeline).toHaveLength(4);
      expect(report.timeline[0]).toMatchObject({
        event: 'webhook_sent',
        timestamp: '2025-01-01T00:00:00Z'
      });
      expect(report.timeline[1]).toMatchObject({
        event: 'webhook_received',
        timestamp: '2025-01-01T00:00:01Z'
      });
      expect(report.timeline[2]).toMatchObject({
        event: 'retry_attempt',
        timestamp: '2025-01-01T00:00:02Z'
      });
      expect(report.timeline[3]).toMatchObject({
        event: 'webhook_processed',
        timestamp: '2025-01-01T00:00:03Z'
      });
    });
  });

  describe('status code validation', () => {
    it('should validate 2xx status codes', () => {
      expect(validator._isStatusCodeValid(200, '2xx')).toBe(true);
      expect(validator._isStatusCodeValid(204, '2xx')).toBe(true);
      expect(validator._isStatusCodeValid(299, '2xx')).toBe(true);
      expect(validator._isStatusCodeValid(300, '2xx')).toBe(false);
      expect(validator._isStatusCodeValid(199, '2xx')).toBe(false);
    });

    it('should validate specific status codes', () => {
      expect(validator._isStatusCodeValid(200, '200')).toBe(true);
      expect(validator._isStatusCodeValid(201, '200')).toBe(false);
    });

    it('should validate status code ranges', () => {
      expect(validator._isStatusCodeValid(200, '200-299')).toBe(true);
      expect(validator._isStatusCodeValid(250, '200-299')).toBe(true);
      expect(validator._isStatusCodeValid(299, '200-299')).toBe(true);
      expect(validator._isStatusCodeValid(300, '200-299')).toBe(false);
    });
  });

  describe('HTTP error categorization', () => {
    it('should categorize authentication errors', () => {
      const result401 = validator._categorizeHttpError(401);
      const result403 = validator._categorizeHttpError(403);

      expect(result401.category).toBe(validator.errorCategories.AUTHENTICATION);
      expect(result401.retryRecommended).toBe(false);
      expect(result403.category).toBe(validator.errorCategories.AUTHENTICATION);
    });

    it('should categorize payload validation errors', () => {
      const result400 = validator._categorizeHttpError(400);
      const result422 = validator._categorizeHttpError(422);

      expect(result400.category).toBe(validator.errorCategories.PAYLOAD_VALIDATION);
      expect(result400.retryRecommended).toBe(false);
      expect(result422.category).toBe(validator.errorCategories.PAYLOAD_VALIDATION);
    });

    it('should categorize rate limit errors', () => {
      const result = validator._categorizeHttpError(429);

      expect(result.category).toBe(validator.errorCategories.RATE_LIMIT);
      expect(result.retryRecommended).toBe(true);
    });

    it('should categorize server errors', () => {
      const result500 = validator._categorizeHttpError(500);
      const result502 = validator._categorizeHttpError(502);

      expect(result500.category).toBe(validator.errorCategories.SERVER_ERROR);
      expect(result500.retryRecommended).toBe(true);
      expect(result502.category).toBe(validator.errorCategories.SERVER_ERROR);
    });

    it('should categorize network errors', () => {
      const result0 = validator._categorizeHttpError(0);
      const result408 = validator._categorizeHttpError(408);

      expect(result0.category).toBe(validator.errorCategories.NETWORK);
      expect(result0.retryRecommended).toBe(true);
      expect(result408.category).toBe(validator.errorCategories.NETWORK);
    });
  });

  describe('backoff delay calculation', () => {
    it('should calculate exponential backoff', () => {
      const delay1 = validator._calculateBackoffDelay(0, validator.errorCategories.SERVER_ERROR);
      const delay2 = validator._calculateBackoffDelay(1, validator.errorCategories.SERVER_ERROR);
      const delay3 = validator._calculateBackoffDelay(2, validator.errorCategories.SERVER_ERROR);

      expect(delay1.delay).toBe(1000); // 1 second
      expect(delay2.delay).toBe(2000); // 2 seconds
      expect(delay3.delay).toBe(4000); // 4 seconds
      expect(delay1.strategy).toBe('exponential_backoff');
    });

    it('should use longer delays for rate limiting', () => {
      const delay = validator._calculateBackoffDelay(0, validator.errorCategories.RATE_LIMIT);

      expect(delay.delay).toBe(60000); // 1 minute
      expect(delay.strategy).toBe('exponential_backoff');
    });

    it('should cap maximum delay', () => {
      const delay = validator._calculateBackoffDelay(10, validator.errorCategories.SERVER_ERROR);

      expect(delay.delay).toBeLessThanOrEqual(300000); // Max 5 minutes
    });
  });
});