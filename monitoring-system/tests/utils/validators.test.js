import { describe, it, expect } from 'vitest';
import { Validators } from '../../src/utils/validators.js';
import { IdGenerator } from '../../src/utils/id-generator.js';

describe('Validators', () => {
  describe('validateTriggerEvent', () => {
    it('should validate a valid trigger event', () => {
      const trigger = {
        type: 'webhook',
        source: 'mailerlite',
        timestamp: new Date().toISOString(),
        metadata: { campaign: 'test' }
      };

      const result = Validators.validateTriggerEvent(trigger);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid trigger type', () => {
      const trigger = {
        type: 'invalid',
        source: 'mailerlite',
        timestamp: new Date().toISOString()
      };

      const result = Validators.validateTriggerEvent(trigger);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Type must be one of: manual, git, webhook, scheduled');
    });

    it('should reject missing required fields', () => {
      const trigger = {};

      const result = Validators.validateTriggerEvent(trigger);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid timestamp', () => {
      const trigger = {
        type: 'webhook',
        source: 'mailerlite',
        timestamp: 'invalid-date'
      };

      const result = Validators.validateTriggerEvent(trigger);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Timestamp must be a valid ISO date string');
    });
  });

  describe('validatePipelineStage', () => {
    it('should validate a valid pipeline stage', () => {
      const stage = {
        name: 'webhook_received',
        status: 'completed',
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        duration: 1000,
        data: { payload: 'test' },
        errors: []
      };

      const result = Validators.validatePipelineStage(stage);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid status', () => {
      const stage = {
        name: 'test_stage',
        status: 'invalid',
        data: {},
        errors: []
      };

      const result = Validators.validatePipelineStage(stage);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Status must be one of: pending, running, completed, failed');
    });
  });

  describe('validatePipelineRun', () => {
    it('should validate a complete pipeline run', () => {
      const pipelineRun = {
        id: IdGenerator.generatePipelineRunId(),
        trigger: {
          type: 'webhook',
          source: 'mailerlite',
          timestamp: new Date().toISOString(),
          metadata: {}
        },
        stages: [],
        status: 'running',
        startTime: new Date().toISOString(),
        success: false,
        errors: [],
        metrics: {
          webhookLatency: 100,
          buildTime: 5000,
          deploymentTime: 3000,
          siteResponseTime: 200,
          totalPipelineTime: 8300,
          errorRate: 0,
          successRate: 100,
          throughput: 1
        }
      };

      const result = Validators.validatePipelineRun(pipelineRun);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('validateWebhookRecord', () => {
    it('should validate a complete webhook record', () => {
      const webhook = {
        id: IdGenerator.generateWebhookId(),
        runId: IdGenerator.generatePipelineRunId(),
        source: 'mailerlite',
        destination: 'supabase',
        payload: { test: 'data' },
        response: {
          status: 200,
          body: { success: true },
          headers: { 'content-type': 'application/json' }
        },
        timing: {
          sent: new Date().toISOString(),
          received: new Date().toISOString(),
          processed: new Date().toISOString()
        },
        authentication: {
          method: 'token',
          success: true
        },
        retries: []
      };

      const result = Validators.validateWebhookRecord(webhook);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('validatePerformanceMetrics', () => {
    it('should validate valid performance metrics', () => {
      const metrics = {
        webhookLatency: 100,
        buildTime: 5000,
        deploymentTime: 3000,
        siteResponseTime: 200,
        totalPipelineTime: 8300,
        errorRate: 5,
        successRate: 95,
        throughput: 2.5
      };

      const result = Validators.validatePerformanceMetrics(metrics);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid percentage values', () => {
      const metrics = {
        webhookLatency: 100,
        buildTime: 5000,
        deploymentTime: 3000,
        siteResponseTime: 200,
        totalPipelineTime: 8300,
        errorRate: 150, // Invalid: > 100%
        successRate: 95,
        throughput: 2.5
      };

      const result = Validators.validatePerformanceMetrics(metrics);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Error rate cannot exceed 100%');
    });
  });
});