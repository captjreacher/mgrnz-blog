import { IdGenerator } from './id-generator.js';

/**
 * Validation utilities for data models
 */
export class Validators {
  /**
   * Validate a pipeline run object
   * @param {import('../types/index.js').PipelineRun} pipelineRun 
   * @returns {{valid: boolean, errors: string[]}}
   */
  static validatePipelineRun(pipelineRun) {
    const errors = [];

    // Required fields
    if (!pipelineRun.id) {
      errors.push('Pipeline run ID is required');
    } else if (!IdGenerator.validateId(pipelineRun.id, 'run')) {
      errors.push('Invalid pipeline run ID format');
    }

    if (!pipelineRun.trigger) {
      errors.push('Trigger information is required');
    } else {
      const triggerValidation = this.validateTriggerEvent(pipelineRun.trigger);
      if (!triggerValidation.valid) {
        errors.push(...triggerValidation.errors.map(e => `Trigger: ${e}`));
      }
    }

    if (!pipelineRun.startTime) {
      errors.push('Start time is required');
    } else if (!this._isValidISODate(pipelineRun.startTime)) {
      errors.push('Start time must be a valid ISO date string');
    }

    if (!['running', 'completed', 'failed', 'timeout'].includes(pipelineRun.status)) {
      errors.push('Status must be one of: running, completed, failed, timeout');
    }

    if (typeof pipelineRun.success !== 'boolean') {
      errors.push('Success must be a boolean value');
    }

    // Validate stages array
    if (!Array.isArray(pipelineRun.stages)) {
      errors.push('Stages must be an array');
    } else {
      pipelineRun.stages.forEach((stage, index) => {
        const stageValidation = this.validatePipelineStage(stage);
        if (!stageValidation.valid) {
          errors.push(...stageValidation.errors.map(e => `Stage ${index}: ${e}`));
        }
      });
    }

    // Validate errors array
    if (!Array.isArray(pipelineRun.errors)) {
      errors.push('Errors must be an array');
    } else {
      pipelineRun.errors.forEach((error, index) => {
        const errorValidation = this.validateErrorRecord(error);
        if (!errorValidation.valid) {
          errors.push(...errorValidation.errors.map(e => `Error ${index}: ${e}`));
        }
      });
    }

    // Validate metrics if present
    if (pipelineRun.metrics) {
      const metricsValidation = this.validatePerformanceMetrics(pipelineRun.metrics);
      if (!metricsValidation.valid) {
        errors.push(...metricsValidation.errors.map(e => `Metrics: ${e}`));
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate a trigger event object
   * @param {import('../types/index.js').TriggerEvent} trigger 
   * @returns {{valid: boolean, errors: string[]}}
   */
  static validateTriggerEvent(trigger) {
    const errors = [];

    if (!['manual', 'git', 'webhook', 'scheduled'].includes(trigger.type)) {
      errors.push('Type must be one of: manual, git, webhook, scheduled');
    }

    if (!trigger.source || typeof trigger.source !== 'string') {
      errors.push('Source is required and must be a string');
    }

    if (!trigger.timestamp) {
      errors.push('Timestamp is required');
    } else if (!this._isValidISODate(trigger.timestamp)) {
      errors.push('Timestamp must be a valid ISO date string');
    }

    if (trigger.metadata && typeof trigger.metadata !== 'object') {
      errors.push('Metadata must be an object');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate a pipeline stage object
   * @param {import('../types/index.js').PipelineStage} stage 
   * @returns {{valid: boolean, errors: string[]}}
   */
  static validatePipelineStage(stage) {
    const errors = [];

    if (!stage.name || typeof stage.name !== 'string') {
      errors.push('Stage name is required and must be a string');
    }

    if (!['pending', 'running', 'completed', 'failed'].includes(stage.status)) {
      errors.push('Status must be one of: pending, running, completed, failed');
    }

    if (stage.startTime && !this._isValidISODate(stage.startTime)) {
      errors.push('Start time must be a valid ISO date string');
    }

    if (stage.endTime && !this._isValidISODate(stage.endTime)) {
      errors.push('End time must be a valid ISO date string');
    }

    if (stage.duration !== undefined && (typeof stage.duration !== 'number' || stage.duration < 0)) {
      errors.push('Duration must be a non-negative number');
    }

    if (!stage.data || typeof stage.data !== 'object') {
      errors.push('Data is required and must be an object');
    }

    if (!Array.isArray(stage.errors)) {
      errors.push('Errors must be an array');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate a webhook record object
   * @param {import('../types/index.js').WebhookRecord} webhook 
   * @returns {{valid: boolean, errors: string[]}}
   */
  static validateWebhookRecord(webhook) {
    const errors = [];

    if (!webhook.id) {
      errors.push('Webhook ID is required');
    } else if (!IdGenerator.validateId(webhook.id, 'webhook')) {
      errors.push('Invalid webhook ID format');
    }

    if (!webhook.runId) {
      errors.push('Run ID is required');
    } else if (!IdGenerator.validateId(webhook.runId, 'run')) {
      errors.push('Invalid run ID format');
    }

    if (!['mailerlite', 'github', 'external'].includes(webhook.source)) {
      errors.push('Source must be one of: mailerlite, github, external');
    }

    if (!['supabase', 'github', 'site'].includes(webhook.destination)) {
      errors.push('Destination must be one of: supabase, github, site');
    }

    if (!webhook.payload || typeof webhook.payload !== 'object') {
      errors.push('Payload is required and must be an object');
    }

    // Validate response
    if (!webhook.response) {
      errors.push('Response is required');
    } else {
      if (typeof webhook.response.status !== 'number') {
        errors.push('Response status must be a number');
      }
      if (!webhook.response.headers || typeof webhook.response.headers !== 'object') {
        errors.push('Response headers must be an object');
      }
    }

    // Validate timing
    if (!webhook.timing) {
      errors.push('Timing information is required');
    } else {
      if (!this._isValidISODate(webhook.timing.sent)) {
        errors.push('Timing.sent must be a valid ISO date string');
      }
      if (!this._isValidISODate(webhook.timing.received)) {
        errors.push('Timing.received must be a valid ISO date string');
      }
      if (!this._isValidISODate(webhook.timing.processed)) {
        errors.push('Timing.processed must be a valid ISO date string');
      }
    }

    // Validate authentication
    if (!webhook.authentication) {
      errors.push('Authentication information is required');
    } else {
      if (!webhook.authentication.method || typeof webhook.authentication.method !== 'string') {
        errors.push('Authentication method is required and must be a string');
      }
      if (typeof webhook.authentication.success !== 'boolean') {
        errors.push('Authentication success must be a boolean');
      }
    }

    if (!Array.isArray(webhook.retries)) {
      errors.push('Retries must be an array');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate performance metrics object
   * @param {import('../types/index.js').PerformanceMetrics} metrics 
   * @returns {{valid: boolean, errors: string[]}}
   */
  static validatePerformanceMetrics(metrics) {
    const errors = [];

    const requiredNumericFields = [
      'webhookLatency', 'buildTime', 'deploymentTime', 
      'siteResponseTime', 'totalPipelineTime', 'errorRate', 
      'successRate', 'throughput'
    ];

    requiredNumericFields.forEach(field => {
      if (typeof metrics[field] !== 'number' || metrics[field] < 0) {
        errors.push(`${field} must be a non-negative number`);
      }
    });

    // Validate percentage fields
    if (metrics.errorRate > 100) {
      errors.push('Error rate cannot exceed 100%');
    }

    if (metrics.successRate > 100) {
      errors.push('Success rate cannot exceed 100%');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate error record object
   * @param {import('../types/index.js').ErrorRecord} error 
   * @returns {{valid: boolean, errors: string[]}}
   */
  static validateErrorRecord(error) {
    const errors = [];

    if (!error.id) {
      errors.push('Error ID is required');
    } else if (!IdGenerator.validateId(error.id, 'error')) {
      errors.push('Invalid error ID format');
    }

    if (!error.stage || typeof error.stage !== 'string') {
      errors.push('Stage is required and must be a string');
    }

    if (!error.type || typeof error.type !== 'string') {
      errors.push('Type is required and must be a string');
    }

    if (!error.message || typeof error.message !== 'string') {
      errors.push('Message is required and must be a string');
    }

    if (!error.timestamp) {
      errors.push('Timestamp is required');
    } else if (!this._isValidISODate(error.timestamp)) {
      errors.push('Timestamp must be a valid ISO date string');
    }

    if (error.context && typeof error.context !== 'object') {
      errors.push('Context must be an object');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Check if a string is a valid ISO date
   * @param {string} dateString 
   * @returns {boolean}
   */
  static _isValidISODate(dateString) {
    if (typeof dateString !== 'string') return false;
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime()) && dateString === date.toISOString();
  }
}