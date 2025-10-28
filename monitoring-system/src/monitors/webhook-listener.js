import { IdGenerator } from '../utils/id-generator.js';

/**
 * WebhookListener class intercepts and monitors webhook events
 * Specifically designed to monitor MailerLite webhooks and correlate them with pipeline runs
 */
export class WebhookListener {
  constructor(triggerMonitor, dataStore, config = {}) {
    this.triggerMonitor = triggerMonitor;
    this.dataStore = dataStore;
    this.config = config;
    this.activeWebhooks = new Map();
    this.isListening = false;
  }

  /**
   * Initialize the webhook listener
   */
  async initialize() {
    try {
      // Register webhook handlers with the trigger monitor
      this.triggerMonitor.registerWebhookListener('mailerlite', this._handleMailerLiteWebhook.bind(this));
      this.triggerMonitor.registerWebhookListener('github', this._handleGitHubWebhook.bind(this));
      
      console.log('WebhookListener initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize WebhookListener:', error.message);
      throw error;
    }
  }

  /**
   * Start listening for webhook events
   */
  async startListening() {
    if (this.isListening) {
      console.log('WebhookListener is already listening');
      return;
    }

    this.isListening = true;
    console.log('WebhookListener started');
  }

  /**
   * Stop listening for webhook events
   */
  async stopListening() {
    if (!this.isListening) {
      console.log('WebhookListener is not listening');
      return;
    }

    this.isListening = false;
    this.activeWebhooks.clear();
    console.log('WebhookListener stopped');
  }

  /**
   * Intercept and process a webhook event
   * @param {string} webhookType - Type of webhook (mailerlite, github, etc.)
   * @param {Object} payload - Webhook payload
   * @param {Object} headers - Request headers
   * @param {Object} requestInfo - Additional request information
   * @returns {Promise<string>} Webhook record ID
   */
  async interceptWebhook(webhookType, payload, headers = {}, requestInfo = {}) {
    try {
      const webhookId = IdGenerator.generateWebhookId();
      const timestamp = new Date().toISOString();

      // Extract metadata from the webhook
      const metadata = await this._extractWebhookMetadata(webhookType, payload, headers);
      
      // Process through trigger monitor to create pipeline run
      const runId = await this.triggerMonitor.processWebhookTrigger(webhookType, payload, headers);
      
      // Create webhook record
      const webhookRecord = {
        id: webhookId,
        runId: runId || 'unknown',
        source: webhookType,
        destination: this._determineDestination(webhookType),
        payload: this._sanitizePayload(payload),
        response: {
          status: 0, // Will be updated when response is sent
          body: null,
          headers: {}
        },
        timing: {
          sent: requestInfo.sentTime || timestamp,
          received: timestamp,
          processed: null // Will be updated when processing completes
        },
        authentication: await this._validateAuthentication(webhookType, headers, payload),
        retries: [],
        metadata
      };

      // Store the webhook record
      await this.dataStore.saveWebhookRecord(webhookRecord);
      this.activeWebhooks.set(webhookId, webhookRecord);

      console.log(`Intercepted ${webhookType} webhook: ${webhookId} (run: ${runId})`);
      return webhookId;
    } catch (error) {
      console.error('Failed to intercept webhook:', error.message);
      throw error;
    }
  }

  /**
   * Update webhook record with response information
   * @param {string} webhookId - Webhook record ID
   * @param {number} statusCode - HTTP response status code
   * @param {*} responseBody - Response body
   * @param {Object} responseHeaders - Response headers
   */
  async updateWebhookResponse(webhookId, statusCode, responseBody, responseHeaders = {}) {
    try {
      const webhookRecord = this.activeWebhooks.get(webhookId) || 
                           await this.dataStore.getWebhookRecord(webhookId);
      
      if (!webhookRecord) {
        throw new Error(`Webhook record not found: ${webhookId}`);
      }

      const now = new Date().toISOString();
      
      webhookRecord.response = {
        status: statusCode,
        body: this._sanitizeResponseBody(responseBody),
        headers: responseHeaders
      };
      
      webhookRecord.timing.processed = now;
      
      // Calculate processing time
      if (webhookRecord.timing.received) {
        const processingTime = new Date(now) - new Date(webhookRecord.timing.received);
        webhookRecord.metadata = {
          ...webhookRecord.metadata,
          processingTimeMs: processingTime
        };
      }

      await this.dataStore.saveWebhookRecord(webhookRecord);
      
      if (this.activeWebhooks.has(webhookId)) {
        this.activeWebhooks.set(webhookId, webhookRecord);
      }

      console.log(`Updated webhook response: ${webhookId} (status: ${statusCode})`);
    } catch (error) {
      console.error('Failed to update webhook response:', error.message);
      throw error;
    }
  }

  /**
   * Record a webhook retry attempt
   * @param {string} webhookId - Webhook record ID
   * @param {number} attemptNumber - Retry attempt number
   * @param {string} reason - Reason for retry
   * @param {boolean} success - Whether retry was successful
   */
  async recordRetryAttempt(webhookId, attemptNumber, reason, success) {
    try {
      const webhookRecord = this.activeWebhooks.get(webhookId) || 
                           await this.dataStore.getWebhookRecord(webhookId);
      
      if (!webhookRecord) {
        throw new Error(`Webhook record not found: ${webhookId}`);
      }

      const retryAttempt = {
        attempt: attemptNumber,
        timestamp: new Date().toISOString(),
        reason,
        success
      };

      webhookRecord.retries.push(retryAttempt);
      await this.dataStore.saveWebhookRecord(webhookRecord);
      
      if (this.activeWebhooks.has(webhookId)) {
        this.activeWebhooks.set(webhookId, webhookRecord);
      }

      console.log(`Recorded retry attempt ${attemptNumber} for webhook ${webhookId}: ${success ? 'SUCCESS' : 'FAILED'}`);
    } catch (error) {
      console.error('Failed to record retry attempt:', error.message);
      throw error;
    }
  }

  /**
   * Get webhook correlation data for a pipeline run
   * @param {string} runId - Pipeline run ID
   * @returns {Promise<Object[]>} Array of webhook records for the run
   */
  async getWebhookCorrelation(runId) {
    try {
      return await this.dataStore.getWebhookRecords(runId);
    } catch (error) {
      console.error('Failed to get webhook correlation:', error.message);
      throw error;
    }
  }

  // Private webhook handlers

  /**
   * Handle MailerLite webhook events
   */
  async _handleMailerLiteWebhook(runId, payload, headers) {
    try {
      console.log(`Processing MailerLite webhook for run ${runId}`);
      
      // Extract MailerLite specific information
      const eventType = payload.type || payload.event || 'unknown';
      const subscriberData = payload.data || payload.subscriber || {};
      
      // Update pipeline stage
      await this.triggerMonitor.engine.updatePipelineStage(runId, 'mailerlite_webhook_received', 'completed', {
        eventType,
        subscriberEmail: subscriberData.email || 'unknown',
        webhookSource: 'mailerlite',
        processingTime: new Date().toISOString()
      });

      // Check if this should trigger Supabase processing
      if (this._shouldTriggerSupabaseProcessing(eventType, payload)) {
        await this.triggerMonitor.engine.updatePipelineStage(runId, 'supabase_processing_triggered', 'running', {
          triggerReason: `MailerLite ${eventType} event`,
          expectedAction: 'content_creation'
        });
      }

    } catch (error) {
      console.error('Error handling MailerLite webhook:', error.message);
      await this.triggerMonitor.engine.addError(runId, 'mailerlite_webhook', 'processing_error', error.message);
    }
  }

  /**
   * Handle GitHub webhook events
   */
  async _handleGitHubWebhook(runId, payload, headers) {
    try {
      console.log(`Processing GitHub webhook for run ${runId}`);
      
      // Extract GitHub specific information
      const eventType = headers['x-github-event'] || 'unknown';
      const action = payload.action || 'unknown';
      const repository = payload.repository?.full_name || 'unknown';
      
      // Update pipeline stage
      await this.triggerMonitor.engine.updatePipelineStage(runId, 'github_webhook_received', 'completed', {
        eventType,
        action,
        repository,
        webhookSource: 'github',
        processingTime: new Date().toISOString()
      });

      // Check if this should trigger workflow
      if (this._shouldTriggerWorkflow(eventType, action, payload)) {
        await this.triggerMonitor.engine.updatePipelineStage(runId, 'github_workflow_triggered', 'running', {
          triggerReason: `GitHub ${eventType} ${action}`,
          expectedWorkflow: 'deploy-gh-pages'
        });
      }

    } catch (error) {
      console.error('Error handling GitHub webhook:', error.message);
      await this.triggerMonitor.engine.addError(runId, 'github_webhook', 'processing_error', error.message);
    }
  }

  // Private helper methods

  /**
   * Extract metadata from webhook payload and headers
   */
  async _extractWebhookMetadata(webhookType, payload, headers) {
    const metadata = {
      webhookType,
      contentType: headers['content-type'] || 'unknown',
      userAgent: headers['user-agent'] || 'unknown',
      contentLength: headers['content-length'] || 0,
      timestamp: new Date().toISOString()
    };

    // Add webhook-specific metadata
    switch (webhookType) {
      case 'mailerlite':
        metadata.eventType = payload.type || payload.event || 'unknown';
        metadata.subscriberCount = payload.data?.length || (payload.subscriber ? 1 : 0);
        break;
      
      case 'github':
        metadata.eventType = headers['x-github-event'] || 'unknown';
        metadata.deliveryId = headers['x-github-delivery'] || 'unknown';
        metadata.hookId = headers['x-github-hook-id'] || 'unknown';
        break;
    }

    return metadata;
  }

  /**
   * Determine the destination for a webhook based on its type
   */
  _determineDestination(webhookType) {
    const destinationMap = {
      'mailerlite': 'supabase',
      'github': 'site',
      'supabase': 'github'
    };
    
    return destinationMap[webhookType] || 'unknown';
  }

  /**
   * Validate webhook authentication
   */
  async _validateAuthentication(webhookType, headers, payload) {
    const auth = {
      method: 'none',
      success: false,
      errors: []
    };

    try {
      switch (webhookType) {
        case 'mailerlite':
          auth.method = 'token';
          // Check for MailerLite webhook token in headers or payload
          const mlToken = headers['x-mailerlite-signature'] || payload.token;
          auth.success = !!mlToken;
          if (!mlToken) {
            auth.errors.push('Missing MailerLite webhook signature/token');
          }
          break;

        case 'github':
          auth.method = 'signature';
          // Check for GitHub webhook signature
          const ghSignature = headers['x-hub-signature-256'] || headers['x-hub-signature'];
          auth.success = !!ghSignature;
          if (!ghSignature) {
            auth.errors.push('Missing GitHub webhook signature');
          }
          break;

        default:
          auth.method = 'unknown';
          auth.success = true; // Assume success for unknown webhook types
      }
    } catch (error) {
      auth.success = false;
      auth.errors.push(`Authentication validation error: ${error.message}`);
    }

    return auth;
  }

  /**
   * Check if MailerLite event should trigger Supabase processing
   */
  _shouldTriggerSupabaseProcessing(eventType, payload) {
    // Trigger on subscriber events that might create content
    const triggerEvents = ['subscriber.created', 'subscriber.updated', 'campaign.sent'];
    return triggerEvents.includes(eventType);
  }

  /**
   * Check if GitHub event should trigger workflow
   */
  _shouldTriggerWorkflow(eventType, action, payload) {
    // Trigger on push events to main branch or workflow dispatch
    if (eventType === 'push' && payload.ref === 'refs/heads/main') {
      return true;
    }
    
    if (eventType === 'workflow_dispatch') {
      return true;
    }
    
    return false;
  }

  /**
   * Sanitize webhook payload for storage
   */
  _sanitizePayload(payload) {
    if (!payload || typeof payload !== 'object') {
      return payload;
    }

    const sanitized = JSON.parse(JSON.stringify(payload));
    
    // Remove sensitive fields
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth', 'signature'];
    
    const removeSensitiveData = (obj) => {
      if (Array.isArray(obj)) {
        return obj.map(removeSensitiveData);
      }
      
      if (obj && typeof obj === 'object') {
        const cleaned = {};
        for (const [key, value] of Object.entries(obj)) {
          if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
            cleaned[key] = '[REDACTED]';
          } else {
            cleaned[key] = removeSensitiveData(value);
          }
        }
        return cleaned;
      }
      
      return obj;
    };

    return removeSensitiveData(sanitized);
  }

  /**
   * Sanitize response body for storage
   */
  _sanitizeResponseBody(responseBody) {
    if (typeof responseBody === 'string') {
      try {
        const parsed = JSON.parse(responseBody);
        return this._sanitizePayload(parsed);
      } catch {
        // If not JSON, return as-is but truncate if too long
        return responseBody.length > 1000 ? 
               responseBody.substring(0, 1000) + '...[truncated]' : 
               responseBody;
      }
    }
    
    return this._sanitizePayload(responseBody);
  }
}