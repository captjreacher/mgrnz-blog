import { IdGenerator } from '../utils/id-generator.js';
import { validateWebhookPayload } from '../utils/validators.js';

/**
 * MailerLite Webhook Monitor
 * Tracks webhooks from MailerLite to Supabase function
 * Monitors payload, authentication, timing, and response handling
 */
export class MailerLiteWebhookMonitor {
  constructor(dataStore, config) {
    this.dataStore = dataStore;
    this.config = config;
    this.activeWebhooks = new Map(); // Track in-flight webhooks
  }

  /**
   * Start monitoring a webhook from MailerLite to Supabase
   * @param {string} runId - Pipeline run ID
   * @param {Object} webhookData - Webhook information
   * @returns {Promise<string>} Webhook record ID
   */
  async startWebhookMonitoring(runId, webhookData) {
    const webhookId = IdGenerator.generateWebhookId();
    const timestamp = new Date().toISOString();

    const webhookRecord = {
      id: webhookId,
      runId: runId,
      source: 'mailerlite',
      destination: 'supabase',
      payload: webhookData.payload || {},
      response: null,
      timing: {
        sent: timestamp,
        received: null,
        processed: null
      },
      authentication: {
        method: 'token',
        success: false,
        errors: []
      },
      retries: []
    };

    // Store initial webhook record
    await this.dataStore.saveWebhookRecord(webhookRecord);
    this.activeWebhooks.set(webhookId, webhookRecord);

    console.log(`Started monitoring MailerLite webhook: ${webhookId} for run: ${runId}`);
    return webhookId;
  }

  /**
   * Log webhook payload and validate structure
   * @param {string} webhookId - Webhook record ID
   * @param {Object} payload - Webhook payload
   * @returns {Promise<Object>} Validation results
   */
  async logWebhookPayload(webhookId, payload) {
    try {
      const webhookRecord = await this.dataStore.getWebhookRecord(webhookId);
      if (!webhookRecord) {
        throw new Error(`Webhook record not found: ${webhookId}`);
      }

      // Validate payload structure
      const validation = this._validateMailerLitePayload(payload);
      
      // Update webhook record with payload and validation results
      webhookRecord.payload = payload;
      webhookRecord.timing.received = new Date().toISOString();
      
      if (!validation.isValid) {
        webhookRecord.authentication.errors.push(...validation.errors);
      }

      await this.dataStore.saveWebhookRecord(webhookRecord);
      this.activeWebhooks.set(webhookId, webhookRecord);

      console.log(`Logged webhook payload for ${webhookId}:`, {
        size: JSON.stringify(payload).length,
        valid: validation.isValid,
        errors: validation.errors
      });

      return validation;
    } catch (error) {
      console.error(`Failed to log webhook payload for ${webhookId}:`, error);
      throw error;
    }
  }

  /**
   * Track webhook authentication status
   * @param {string} webhookId - Webhook record ID
   * @param {Object} authData - Authentication information
   * @returns {Promise<boolean>} Authentication success status
   */
  async trackAuthentication(webhookId, authData) {
    try {
      const webhookRecord = await this.dataStore.getWebhookRecord(webhookId);
      if (!webhookRecord) {
        throw new Error(`Webhook record not found: ${webhookId}`);
      }

      // Validate authentication
      const authResult = this._validateAuthentication(authData);
      
      webhookRecord.authentication = {
        method: authData.method || 'token',
        success: authResult.success,
        errors: authResult.errors
      };

      await this.dataStore.saveWebhookRecord(webhookRecord);
      this.activeWebhooks.set(webhookId, webhookRecord);

      console.log(`Tracked authentication for ${webhookId}:`, {
        method: webhookRecord.authentication.method,
        success: authResult.success,
        errors: authResult.errors
      });

      return authResult.success;
    } catch (error) {
      console.error(`Failed to track authentication for ${webhookId}:`, error);
      throw error;
    }
  }

  /**
   * Log webhook response from Supabase
   * @param {string} webhookId - Webhook record ID
   * @param {Object} response - Response from Supabase function
   * @returns {Promise<void>}
   */
  async logWebhookResponse(webhookId, response) {
    try {
      const webhookRecord = await this.dataStore.getWebhookRecord(webhookId);
      if (!webhookRecord) {
        throw new Error(`Webhook record not found: ${webhookId}`);
      }

      webhookRecord.response = {
        status: response.status || 0,
        body: response.body || null,
        headers: response.headers || {}
      };
      
      webhookRecord.timing.processed = new Date().toISOString();

      await this.dataStore.saveWebhookRecord(webhookRecord);
      this.activeWebhooks.set(webhookId, webhookRecord);

      console.log(`Logged webhook response for ${webhookId}:`, {
        status: response.status,
        processingTime: this._calculateProcessingTime(webhookRecord)
      });
    } catch (error) {
      console.error(`Failed to log webhook response for ${webhookId}:`, error);
      throw error;
    }
  }

  /**
   * Complete webhook monitoring and calculate final metrics
   * @param {string} webhookId - Webhook record ID
   * @returns {Promise<Object>} Final webhook metrics
   */
  async completeWebhookMonitoring(webhookId) {
    try {
      const webhookRecord = await this.dataStore.getWebhookRecord(webhookId);
      if (!webhookRecord) {
        throw new Error(`Webhook record not found: ${webhookId}`);
      }

      const metrics = this._calculateWebhookMetrics(webhookRecord);
      
      // Remove from active tracking
      this.activeWebhooks.delete(webhookId);

      console.log(`Completed webhook monitoring for ${webhookId}:`, metrics);
      return metrics;
    } catch (error) {
      console.error(`Failed to complete webhook monitoring for ${webhookId}:`, error);
      throw error;
    }
  }

  /**
   * Monitor webhook for timeout and handle failures
   * @param {string} webhookId - Webhook record ID
   * @param {number} timeoutMs - Timeout in milliseconds
   * @returns {Promise<boolean>} Whether webhook completed within timeout
   */
  async monitorWebhookTimeout(webhookId, timeoutMs = 30000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      
      const checkInterval = setInterval(async () => {
        try {
          const webhookRecord = await this.dataStore.getWebhookRecord(webhookId);
          
          // Check if webhook completed
          if (webhookRecord && webhookRecord.timing.processed) {
            clearInterval(checkInterval);
            resolve(true);
            return;
          }

          // Check for timeout
          if (Date.now() - startTime > timeoutMs) {
            clearInterval(checkInterval);
            await this._handleWebhookTimeout(webhookId);
            resolve(false);
            return;
          }
        } catch (error) {
          console.error(`Error monitoring webhook timeout for ${webhookId}:`, error);
          clearInterval(checkInterval);
          resolve(false);
        }
      }, 1000); // Check every second
    });
  }

  /**
   * Get webhook statistics for analysis
   * @param {string} runId - Optional pipeline run ID to filter by
   * @returns {Promise<Object>} Webhook statistics
   */
  async getWebhookStatistics(runId = null) {
    try {
      const webhooks = runId 
        ? await this.dataStore.getWebhookRecords(runId)
        : await this._getAllMailerLiteWebhooks();

      const stats = {
        total: webhooks.length,
        successful: 0,
        failed: 0,
        authFailures: 0,
        averageProcessingTime: 0,
        timeouts: 0
      };

      let totalProcessingTime = 0;

      webhooks.forEach(webhook => {
        if (webhook.response && webhook.response.status >= 200 && webhook.response.status < 300) {
          stats.successful++;
        } else {
          stats.failed++;
        }

        if (!webhook.authentication.success) {
          stats.authFailures++;
        }

        if (webhook.timing.processed) {
          const processingTime = this._calculateProcessingTime(webhook);
          totalProcessingTime += processingTime;
        } else {
          stats.timeouts++;
        }
      });

      if (stats.successful > 0) {
        stats.averageProcessingTime = totalProcessingTime / stats.successful;
      }

      return stats;
    } catch (error) {
      console.error('Failed to get webhook statistics:', error);
      throw error;
    }
  }

  // Private helper methods

  /**
   * Validate MailerLite webhook payload structure
   * @param {Object} payload - Webhook payload
   * @returns {Object} Validation result
   */
  _validateMailerLitePayload(payload) {
    const errors = [];
    
    // Check required fields based on MailerLite webhook structure
    if (!payload.events || !Array.isArray(payload.events)) {
      errors.push('Missing or invalid events array');
    }

    if (payload.events && payload.events.length > 0) {
      payload.events.forEach((event, index) => {
        if (!event.type) {
          errors.push(`Event ${index}: missing type field`);
        }
        if (!event.data) {
          errors.push(`Event ${index}: missing data field`);
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * Validate webhook authentication
   * @param {Object} authData - Authentication data
   * @returns {Object} Authentication result
   */
  _validateAuthentication(authData) {
    const errors = [];
    
    if (!authData.token && !authData.signature) {
      errors.push('No authentication token or signature provided');
    }

    if (authData.token && !this._isValidToken(authData.token)) {
      errors.push('Invalid authentication token format');
    }

    if (authData.signature && !this._isValidSignature(authData.signature)) {
      errors.push('Invalid webhook signature');
    }

    return {
      success: errors.length === 0,
      errors: errors
    };
  }

  /**
   * Validate authentication token format
   * @param {string} token - Authentication token
   * @returns {boolean} Whether token is valid
   */
  _isValidToken(token) {
    // Basic token validation - should be non-empty string
    return typeof token === 'string' && token.length > 0;
  }

  /**
   * Validate webhook signature
   * @param {string} signature - Webhook signature
   * @returns {boolean} Whether signature is valid
   */
  _isValidSignature(signature) {
    // Basic signature validation - should be non-empty string
    return typeof signature === 'string' && signature.length > 0;
  }

  /**
   * Calculate processing time for webhook
   * @param {Object} webhookRecord - Webhook record
   * @returns {number} Processing time in milliseconds
   */
  _calculateProcessingTime(webhookRecord) {
    if (!webhookRecord.timing.received || !webhookRecord.timing.processed) {
      return 0;
    }

    const received = new Date(webhookRecord.timing.received);
    const processed = new Date(webhookRecord.timing.processed);
    return processed - received;
  }

  /**
   * Calculate comprehensive webhook metrics
   * @param {Object} webhookRecord - Webhook record
   * @returns {Object} Webhook metrics
   */
  _calculateWebhookMetrics(webhookRecord) {
    const processingTime = this._calculateProcessingTime(webhookRecord);
    const totalTime = webhookRecord.timing.processed && webhookRecord.timing.sent
      ? new Date(webhookRecord.timing.processed) - new Date(webhookRecord.timing.sent)
      : 0;

    return {
      webhookId: webhookRecord.id,
      processingTime: processingTime,
      totalTime: totalTime,
      success: webhookRecord.response && webhookRecord.response.status >= 200 && webhookRecord.response.status < 300,
      authSuccess: webhookRecord.authentication.success,
      payloadSize: JSON.stringify(webhookRecord.payload).length,
      retryCount: webhookRecord.retries.length
    };
  }

  /**
   * Handle webhook timeout
   * @param {string} webhookId - Webhook record ID
   */
  async _handleWebhookTimeout(webhookId) {
    try {
      const webhookRecord = await this.dataStore.getWebhookRecord(webhookId);
      if (webhookRecord) {
        webhookRecord.response = {
          status: 408,
          body: { error: 'Webhook processing timeout' },
          headers: {}
        };
        
        await this.dataStore.saveWebhookRecord(webhookRecord);
        this.activeWebhooks.delete(webhookId);
        
        console.warn(`Webhook ${webhookId} timed out`);
      }
    } catch (error) {
      console.error(`Failed to handle webhook timeout for ${webhookId}:`, error);
    }
  }

  /**
   * Get all MailerLite webhooks from storage
   * @returns {Promise<Array>} Array of MailerLite webhook records
   */
  async _getAllMailerLiteWebhooks() {
    // This would need to be implemented in DataStore to filter by source
    // For now, we'll implement a basic version
    const allWebhooks = await this.dataStore.getWebhookRecords();
    return allWebhooks.filter(webhook => webhook.source === 'mailerlite');
  }
}