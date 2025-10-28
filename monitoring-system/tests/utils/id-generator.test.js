import { describe, it, expect } from 'vitest';
import { IdGenerator } from '../../src/utils/id-generator.js';

describe('IdGenerator', () => {
  describe('generatePipelineRunId', () => {
    it('should generate a valid pipeline run ID', () => {
      const id = IdGenerator.generatePipelineRunId();
      expect(id).toMatch(/^run_\d{8}_\d{6}_[a-f0-9]{8}$/);
    });

    it('should generate unique IDs', () => {
      const id1 = IdGenerator.generatePipelineRunId();
      const id2 = IdGenerator.generatePipelineRunId();
      expect(id1).not.toBe(id2);
    });

    it('should include current date and time', () => {
      const id = IdGenerator.generatePipelineRunId();
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      expect(id).toContain(dateStr);
    });
  });

  describe('generateWebhookId', () => {
    it('should generate a valid webhook ID', () => {
      const id = IdGenerator.generateWebhookId();
      expect(id).toMatch(/^webhook_[a-f0-9]{12}$/);
    });

    it('should generate unique IDs', () => {
      const id1 = IdGenerator.generateWebhookId();
      const id2 = IdGenerator.generateWebhookId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('generateErrorId', () => {
    it('should generate a valid error ID', () => {
      const id = IdGenerator.generateErrorId();
      expect(id).toMatch(/^error_[a-f0-9]{10}$/);
    });
  });

  describe('generateStageId', () => {
    it('should generate a valid stage ID', () => {
      const id = IdGenerator.generateStageId();
      expect(id).toMatch(/^stage_[a-f0-9]{8}$/);
    });
  });

  describe('generateUuid', () => {
    it('should generate a valid UUID', () => {
      const id = IdGenerator.generateUuid();
      expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i);
    });
  });

  describe('extractTimestampFromRunId', () => {
    it('should extract timestamp from valid run ID', () => {
      const id = IdGenerator.generatePipelineRunId();
      const timestamp = IdGenerator.extractTimestampFromRunId(id);
      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should return null for invalid run ID', () => {
      const timestamp = IdGenerator.extractTimestampFromRunId('invalid_id');
      expect(timestamp).toBeNull();
    });
  });

  describe('validateId', () => {
    it('should validate run IDs correctly', () => {
      const runId = IdGenerator.generatePipelineRunId();
      expect(IdGenerator.validateId(runId, 'run')).toBe(true);
      expect(IdGenerator.validateId('invalid', 'run')).toBe(false);
    });

    it('should validate webhook IDs correctly', () => {
      const webhookId = IdGenerator.generateWebhookId();
      expect(IdGenerator.validateId(webhookId, 'webhook')).toBe(true);
      expect(IdGenerator.validateId('invalid', 'webhook')).toBe(false);
    });

    it('should validate error IDs correctly', () => {
      const errorId = IdGenerator.generateErrorId();
      expect(IdGenerator.validateId(errorId, 'error')).toBe(true);
      expect(IdGenerator.validateId('invalid', 'error')).toBe(false);
    });

    it('should validate UUIDs correctly', () => {
      const uuid = IdGenerator.generateUuid();
      expect(IdGenerator.validateId(uuid, 'uuid')).toBe(true);
      expect(IdGenerator.validateId('invalid', 'uuid')).toBe(false);
    });
  });

  describe('generateBatch', () => {
    it('should generate a batch of unique run IDs', () => {
      const ids = IdGenerator.generateBatch('run', 5);
      expect(ids).toHaveLength(5);
      expect(new Set(ids).size).toBe(5); // All unique
      ids.forEach(id => {
        expect(IdGenerator.validateId(id, 'run')).toBe(true);
      });
    });

    it('should throw error for unknown ID type', () => {
      expect(() => {
        IdGenerator.generateBatch('unknown', 1);
      }).toThrow('Unknown ID type: unknown');
    });
  });
});