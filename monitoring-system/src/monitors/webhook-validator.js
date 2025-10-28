import { IdGenerator } from '../utils/id-generator.js';

/**
 * Webhook Validator and Error Handler
 * Provides comprehensive validation for webhook payloads and responses
 * Handles error detection, categorization, and retry logic
 */
export class WebhookValidator {
  constructor(dataStore, config) {
    this.dataStore = dataStore;
    this.config = config;
    this.errorCategories = {
      AUTHENTICATION: 'authentication',
      PAYLOAD_VALIDATION: 'payload_validation',
      NETWORK: 'network',
      RATE_LIMIT: 'rate_limit',
      SERVER_ERROR: 'server_error',
      TIMEOUT: 'timeout',
      UNKNOWN: 'unknown'
    };
  }

  /**
   * Validate webhook payload structure and content
   * @param {Object} payload - Webhook payload to validate
   * @param {string} source - Source of the webhook (mailerlite, github, etc.)
   * @returns {Promise<Object>} Validation result
   */
  async validateWebhookPayload(payload, source) {
    const validationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      metadata: {
        source: source,
        payloadSize: JSON.stringify(payload).length,
        timestamp: new Date().toISOString()
      }
    };

    try {
      // Basic payload validation
      if (!payload || typeof payload !== 'object') {
        validationResult.errors.push('Payload must be a valid object');
        validationResult.isValid = false;
        return validationResult;
      }

      // Source-specific validation
      switch (source) {
        case 'mailerlite':
          this._validateMailerLitePayload(payload, validationResult);
          break;
        case 'github':
          this._validateGitHubPayload(payload, validationResult);
          break;
        case 'supabase':
          this._validateSupabasePayload(payload, validationResult);
          break;
        default:
          this._validateGenericPayload(payload, validationResult);
      }

      // Check payload size limits
      if (validationResult.metadata.payloadSize > 1048576) { // 1MB limit
        validationResult.warnings.push('Payload size exceeds 1MB, may cause performance issues');
      }

      console.log(`Webhook payload validation for ${source}:`, {
        valid: validationResult.isValid,
        errors: validationResult.errors.length,
        warnings: validationResult.warnings.length,
        size: validationResult.metadata.payloadSize
      });

      return validationResult;
    } catch (error) {
      validationResult.isValid = false;
      validationResult.errors.push(`Validation error: ${error.message}`);
      return validationResult;
    }
  }

  /**
   * Validate webhook response and detect errors
   * @param {Object} response - Webhook response to validate
   * @param {string} expectedStatus - Expected HTTP status code range
   * @returns {Promise<Object>} Response validation result
   */
  async validateWebhookResponse(response, expectedStatus = '2xx') {
    const validationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      errorCategory: null,
      retryRecommended: false,
      metadata: {
        statusCode: response.status,
        timestamp: new Date().toISOString()
      }
    };

    try {
      // Validate response structure
      if (!response || typeof response !== 'object') {
        validationResult.errors.push('Response must be a valid object');
        validationResult.isValid = false;
        return validationResult;
      }

      // Check status code
      const statusCode = response.status || 0;
      validationResult.metadata.statusCode = statusCode;

      if (!this._isStatusCodeValid(statusCode, expectedStatus)) {
        const errorInfo = this._categorizeHttpError(statusCode);
        validationResult.isValid = false;
        validationResult.errors.push(`HTTP ${statusCode}: ${errorInfo.message}`);
        validationResult.errorCategory = errorInfo.category;
        validationResult.retryRecommended = errorInfo.retryRecommended;
      }

      // Validate response headers
      if (response.headers) {
        this._validateResponseHeaders(response.headers, validationResult);
      }

      // Validate response body
      if (response.body) {
        this._validateResponseBody(response.body, validationResult);
      }

      console.log(`Webhook response validation:`, {
        valid: validationResult.isValid,
        statusCode: statusCode,
        category: validationResult.errorCategory,
        retryRecommended: validationResult.retryRecommended
      });

      return validationResult;
    } catch (error) {
      validationResult.isValid = false;
      validationResult.errors.push(`Response validation error: ${error.message}`);
      validationResult.errorCategory = this.errorCategories.UNKNOWN;
      return validationResult;
    }
  }

  /**
   * Detect and categorize webhook errors
   * @param {Object} webhookRecord - Complete webhook record
   * @returns {Promise<Object>} Error analysis result
   */
  async detectAndCategorizeErrors(webhookRecord) {
    const errorAnalysis = {
      hasErrors: false,
      primaryError: null,
      errorCategory: null,
      severity: 'low',
      retryRecommended: false,
      suggestedActions: [],
      errorDetails: []
    };

    try {
      // Check authentication errors
      if (!webhookRecord.authentication.success) {
        errorAnalysis.hasErrors = true;
        errorAnalysis.primaryError = 'Authentication failed';
        errorAnalysis.errorCategory = this.errorCategories.AUTHENTICATION;
        errorAnalysis.severity = 'high';
        errorAnalysis.retryRecommended = false;
        errorAnalysis.suggestedActions.push('Verify authentication credentials');
        errorAnalysis.errorDetails.push(...webhookRecord.authentication.errors);
      }

      // Check response errors
      if (webhookRecord.response) {
        const responseValidation = await this.validateWebhookResponse(webhookRecord.response);
        if (!responseValidation.isValid) {
          errorAnalysis.hasErrors = true;
          if (!errorAnalysis.primaryError) {
            errorAnalysis.primaryError = responseValidation.errors[0];
            errorAnalysis.errorCategory = responseValidation.errorCategory;
            errorAnalysis.retryRecommended = responseValidation.retryRecommended;
          }
          errorAnalysis.errorDetails.push(...responseValidation.errors);
        }
      }

      // Check timeout errors
      if (!webhookRecord.timing.processed && webhookRecord.timing.sent) {
        const timeSinceSent = Date.now() - new Date(webhookRecord.timing.sent);
        const timeoutThreshold = this.config.monitoring?.timeout || 300000; // 5 minutes

        if (timeSinceSent > timeoutThreshold) {
          errorAnalysis.hasErrors = true;
          errorAnalysis.primaryError = 'Webhook processing timeout';
          errorAnalysis.errorCategory = this.errorCategories.TIMEOUT;
          errorAnalysis.severity = 'medium';
          errorAnalysis.retryRecommended = true;
          errorAnalysis.suggestedActions.push('Check endpoint availability', 'Increase timeout threshold');
        }
      }

      // Check retry patterns
      if (webhookRecord.retries.length > 0) {
        const retryAnalysis = this._analyzeRetryPattern(webhookRecord.retries);
        errorAnalysis.errorDetails.push(`${webhookRecord.retries.length} retry attempts made`);
        
        if (retryAnalysis.isExcessive) {
          errorAnalysis.severity = 'high';
          errorAnalysis.suggestedActions.push('Investigate underlying cause of failures');
        }
      }

      console.log(`Error analysis for webhook ${webhookRecord.id}:`, {
        hasErrors: errorAnalysis.hasErrors,
        category: errorAnalysis.errorCategory,
        severity: errorAnalysis.severity,
        retryRecommended: errorAnalysis.retryRecommended
      });

      return errorAnalysis;
    } catch (error) {
      console.error(`Failed to analyze webhook errors:`, error);
      return {
        hasErrors: true,
        primaryError: `Error analysis failed: ${error.message}`,
        errorCategory: this.errorCategories.UNKNOWN,
        severity: 'high',
        retryRecommended: false,
        suggestedActions: ['Manual investigation required'],
        errorDetails: [error.message]
      };
    }
  }

  /**
   * Track and log retry attempts with intelligent backoff
   * @param {string} webhookId - Webhook record ID
   * @param {Object} retryContext - Context for the retry attempt
   * @returns {Promise<Object>} Retry decision and timing
   */
  async trackRetryAttempt(webhookId, retryContext) {
    try {
      const webhookRecord = await this.dataStore.getWebhookRecord(webhookId);
      if (!webhookRecord) {
        throw new Error(`Webhook record not found: ${webhookId}`);
      }

      const retryAttempt = {
        attempt: webhookRecord.retries.length + 1,
        timestamp: new Date().toISOString(),
        reason: retryContext.reason || 'Unknown',
        success: false, // Will be updated when retry completes
        delay: 0
      };

      // Calculate intelligent backoff delay
      const backoffStrategy = this._calculateBackoffDelay(
        webhookRecord.retries.length,
        retryContext.errorCategory
      );

      retryAttempt.delay = backoffStrategy.delay;

      // Add retry attempt to record
      webhookRecord.retries.push(retryAttempt);
      await this.dataStore.saveWebhookRecord(webhookRecord);

      console.log(`Tracked retry attempt ${retryAttempt.attempt} for webhook ${webhookId}:`, {
        reason: retryAttempt.reason,
        delay: retryAttempt.delay,
        strategy: backoffStrategy.strategy
      });

      return {
        shouldRetry: backoffStrategy.shouldRetry,
        delay: backoffStrategy.delay,
        strategy: backoffStrategy.strategy,
        attemptNumber: retryAttempt.attempt,
        maxAttemptsReached: retryAttempt.attempt >= (this.config.monitoring?.retryAttempts || 3)
      };
    } catch (error) {
      console.error(`Failed to track retry attempt for ${webhookId}:`, error);
      throw error;
    }
  }

  /**
   * Update retry attempt with success/failure result
   * @param {string} webhookId - Webhook record ID
   * @param {number} attemptNumber - Retry attempt number
   * @param {boolean} success - Whether retry was successful
   * @returns {Promise<void>}
   */
  async updateRetryResult(webhookId, attemptNumber, success) {
    try {
      const webhookRecord = await this.dataStore.getWebhookRecord(webhookId);
      if (!webhookRecord) {
        throw new Error(`Webhook record not found: ${webhookId}`);
      }

      const retryIndex = webhookRecord.retries.findIndex(retry => retry.attempt === attemptNumber);
      if (retryIndex >= 0) {
        webhookRecord.retries[retryIndex].success = success;
        await this.dataStore.saveWebhookRecord(webhookRecord);

        console.log(`Updated retry result for webhook ${webhookId}, attempt ${attemptNumber}: ${success ? 'success' : 'failure'}`);
      }
    } catch (error) {
      console.error(`Failed to update retry result for ${webhookId}:`, error);
      throw error;
    }
  }

  /**
   * Generate comprehensive error report for a webhook
   * @param {string} webhookId - Webhook record ID
   * @returns {Promise<Object>} Detailed error report
   */
  async generateErrorReport(webhookId) {
    try {
      const webhookRecord = await this.dataStore.getWebhookRecord(webhookId);
      if (!webhookRecord) {
        throw new Error(`Webhook record not found: ${webhookId}`);
      }

      const errorAnalysis = await this.detectAndCategorizeErrors(webhookRecord);
      
      const report = {
        webhookId: webhookId,
        runId: webhookRecord.runId,
        source: webhookRecord.source,
        destination: webhookRecord.destination,
        timestamp: new Date().toISOString(),
        errorAnalysis: errorAnalysis,
        timeline: this._buildErrorTimeline(webhookRecord),
        recommendations: this._generateRecommendations(errorAnalysis, webhookRecord),
        metadata: {
          totalRetries: webhookRecord.retries.length,
          processingTime: this._calculateProcessingTime(webhookRecord),
          payloadSize: JSON.stringify(webhookRecord.payload).length
        }
      };

      console.log(`Generated error report for webhook ${webhookId}`);
      return report;
    } catch (error) {
      console.error(`Failed to generate error report for ${webhookId}:`, error);
      throw error;
    }
  }

  // Private helper methods

  /**
   * Validate MailerLite specific payload structure
   * @param {Object} payload - Payload to validate
   * @param {Object} result - Validation result object to update
   */
  _validateMailerLitePayload(payload, result) {
    if (!payload.events || !Array.isArray(payload.events)) {
      result.errors.push('MailerLite payload missing events array');
      result.isValid = false;
    }

    if (payload.events) {
      payload.events.forEach((event, index) => {
        if (!event.type) {
          result.errors.push(`Event ${index}: missing type field`);
          result.isValid = false;
        }
        if (!event.data) {
          result.errors.push(`Event ${index}: missing data field`);
          result.isValid = false;
        }
        if (event.type && !['subscriber.created', 'subscriber.updated', 'subscriber.unsubscribed'].includes(event.type)) {
          result.warnings.push(`Event ${index}: unknown event type '${event.type}'`);
        }
      });
    }
  }

  /**
   * Validate GitHub specific payload structure
   * @param {Object} payload - Payload to validate
   * @param {Object} result - Validation result object to update
   */
  _validateGitHubPayload(payload, result) {
    if (!payload.ref && !payload.workflow_id) {
      result.errors.push('GitHub payload missing ref or workflow_id');
      result.isValid = false;
    }

    if (payload.inputs && typeof payload.inputs !== 'object') {
      result.errors.push('GitHub payload inputs must be an object');
      result.isValid = false;
    }
  }

  /**
   * Validate Supabase specific payload structure
   * @param {Object} payload - Payload to validate
   * @param {Object} result - Validation result object to update
   */
  _validateSupabasePayload(payload, result) {
    // Basic Supabase function payload validation
    if (!payload.body && !payload.query) {
      result.warnings.push('Supabase payload has no body or query parameters');
    }
  }

  /**
   * Validate generic payload structure
   * @param {Object} payload - Payload to validate
   * @param {Object} result - Validation result object to update
   */
  _validateGenericPayload(payload, result) {
    // Basic validation for unknown payload types
    if (Object.keys(payload).length === 0) {
      result.warnings.push('Payload is empty');
    }
  }

  /**
   * Check if status code matches expected pattern
   * @param {number} statusCode - HTTP status code
   * @param {string} expected - Expected pattern (e.g., '2xx', '200', '200-299')
   * @returns {boolean} Whether status code is valid
   */
  _isStatusCodeValid(statusCode, expected) {
    if (expected === '2xx') {
      return statusCode >= 200 && statusCode < 300;
    }
    if (expected === '3xx') {
      return statusCode >= 300 && statusCode < 400;
    }
    if (expected.includes('-')) {
      const [min, max] = expected.split('-').map(Number);
      return statusCode >= min && statusCode <= max;
    }
    return statusCode === parseInt(expected);
  }

  /**
   * Categorize HTTP error by status code
   * @param {number} statusCode - HTTP status code
   * @returns {Object} Error categorization
   */
  _categorizeHttpError(statusCode) {
    if (statusCode === 401 || statusCode === 403) {
      return {
        category: this.errorCategories.AUTHENTICATION,
        message: 'Authentication or authorization failed',
        retryRecommended: false
      };
    }
    if (statusCode === 400 || statusCode === 422) {
      return {
        category: this.errorCategories.PAYLOAD_VALIDATION,
        message: 'Invalid request payload',
        retryRecommended: false
      };
    }
    if (statusCode === 429) {
      return {
        category: this.errorCategories.RATE_LIMIT,
        message: 'Rate limit exceeded',
        retryRecommended: true
      };
    }
    if (statusCode >= 500) {
      return {
        category: this.errorCategories.SERVER_ERROR,
        message: 'Server error',
        retryRecommended: true
      };
    }
    if (statusCode === 0 || statusCode === 408) {
      return {
        category: this.errorCategories.NETWORK,
        message: 'Network or timeout error',
        retryRecommended: true
      };
    }
    
    return {
      category: this.errorCategories.UNKNOWN,
      message: `Unexpected status code: ${statusCode}`,
      retryRecommended: false
    };
  }

  /**
   * Validate response headers
   * @param {Object} headers - Response headers
   * @param {Object} result - Validation result object to update
   */
  _validateResponseHeaders(headers, result) {
    // Check for important headers
    if (!headers['content-type']) {
      result.warnings.push('Response missing Content-Type header');
    }

    // Check for rate limiting headers
    if (headers['x-ratelimit-remaining']) {
      const remaining = parseInt(headers['x-ratelimit-remaining']);
      if (remaining < 10) {
        result.warnings.push(`Rate limit low: ${remaining} requests remaining`);
      }
    }
  }

  /**
   * Validate response body
   * @param {*} body - Response body
   * @param {Object} result - Validation result object to update
   */
  _validateResponseBody(body, result) {
    if (typeof body === 'string') {
      try {
        JSON.parse(body);
      } catch {
        result.warnings.push('Response body is not valid JSON');
      }
    }
  }

  /**
   * Analyze retry pattern for excessive retries
   * @param {Array} retries - Array of retry attempts
   * @returns {Object} Retry analysis
   */
  _analyzeRetryPattern(retries) {
    const maxRetries = this.config.monitoring?.retryAttempts || 3;
    const isExcessive = retries.length > maxRetries;
    
    const successfulRetries = retries.filter(retry => retry.success).length;
    const failureRate = (retries.length - successfulRetries) / retries.length;

    return {
      isExcessive: isExcessive,
      failureRate: failureRate,
      totalAttempts: retries.length,
      successfulAttempts: successfulRetries
    };
  }

  /**
   * Calculate intelligent backoff delay
   * @param {number} attemptNumber - Current attempt number
   * @param {string} errorCategory - Category of error
   * @returns {Object} Backoff strategy
   */
  _calculateBackoffDelay(attemptNumber, errorCategory) {
    const maxRetries = this.config.monitoring?.retryAttempts || 3;
    
    if (attemptNumber >= maxRetries) {
      return {
        shouldRetry: false,
        delay: 0,
        strategy: 'max_attempts_reached'
      };
    }

    // Don't retry authentication errors
    if (errorCategory === this.errorCategories.AUTHENTICATION) {
      return {
        shouldRetry: false,
        delay: 0,
        strategy: 'no_retry_auth_error'
      };
    }

    // Exponential backoff for most errors
    let baseDelay = 1000; // 1 second
    
    // Longer delays for rate limiting
    if (errorCategory === this.errorCategories.RATE_LIMIT) {
      baseDelay = 60000; // 1 minute
    }

    const delay = baseDelay * Math.pow(2, attemptNumber);
    
    return {
      shouldRetry: true,
      delay: Math.min(delay, 300000), // Cap at 5 minutes
      strategy: 'exponential_backoff'
    };
  }

  /**
   * Build error timeline from webhook record
   * @param {Object} webhookRecord - Webhook record
   * @returns {Array} Timeline of events
   */
  _buildErrorTimeline(webhookRecord) {
    const timeline = [];

    if (webhookRecord.timing.sent) {
      timeline.push({
        timestamp: webhookRecord.timing.sent,
        event: 'webhook_sent',
        details: 'Webhook request initiated'
      });
    }

    if (webhookRecord.timing.received) {
      timeline.push({
        timestamp: webhookRecord.timing.received,
        event: 'webhook_received',
        details: 'Webhook request received'
      });
    }

    webhookRecord.retries.forEach(retry => {
      timeline.push({
        timestamp: retry.timestamp,
        event: 'retry_attempt',
        details: `Retry attempt ${retry.attempt}: ${retry.reason}`
      });
    });

    if (webhookRecord.timing.processed) {
      timeline.push({
        timestamp: webhookRecord.timing.processed,
        event: 'webhook_processed',
        details: 'Webhook processing completed'
      });
    }

    return timeline.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  /**
   * Generate recommendations based on error analysis
   * @param {Object} errorAnalysis - Error analysis result
   * @param {Object} webhookRecord - Webhook record
   * @returns {Array} Array of recommendations
   */
  _generateRecommendations(errorAnalysis, webhookRecord) {
    const recommendations = [...errorAnalysis.suggestedActions];

    // Add specific recommendations based on error patterns
    if (webhookRecord.retries.length > 2) {
      recommendations.push('Consider increasing timeout values or checking endpoint reliability');
    }

    if (errorAnalysis.errorCategory === this.errorCategories.RATE_LIMIT) {
      recommendations.push('Implement request throttling or increase rate limit quotas');
    }

    if (errorAnalysis.errorCategory === this.errorCategories.NETWORK) {
      recommendations.push('Check network connectivity and DNS resolution');
    }

    return recommendations;
  }

  /**
   * Calculate processing time for webhook
   * @param {Object} webhookRecord - Webhook record
   * @returns {number} Processing time in milliseconds
   */
  _calculateProcessingTime(webhookRecord) {
    if (!webhookRecord.timing.sent || !webhookRecord.timing.processed) {
      return 0;
    }

    const sent = new Date(webhookRecord.timing.sent);
    const processed = new Date(webhookRecord.timing.processed);
    return processed - sent;
  }
}