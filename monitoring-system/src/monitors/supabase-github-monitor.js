import { IdGenerator } from '../utils/id-generator.js';

/**
 * Supabase to GitHub Monitor
 * Tracks API calls from Supabase function to GitHub Actions
 * Monitors API responses, timing, rate limiting, and retry logic
 */
export class SupabaseGitHubMonitor {
  constructor(dataStore, config) {
    this.dataStore = dataStore;
    this.config = config;
    this.activeApiCalls = new Map(); // Track in-flight API calls
    this.rateLimitInfo = {
      remaining: null,
      resetTime: null,
      limit: null
    };
  }

  /**
   * Start monitoring a GitHub API call from Supabase
   * @param {string} runId - Pipeline run ID
   * @param {Object} apiCallData - API call information
   * @returns {Promise<string>} API call record ID
   */
  async startApiCallMonitoring(runId, apiCallData) {
    const apiCallId = `github_api_${IdGenerator.generateUuid().slice(0, 8)}`;
    const timestamp = new Date().toISOString();

    const apiCallRecord = {
      id: apiCallId,
      runId: runId,
      source: 'supabase',
      destination: 'github',
      payload: apiCallData.payload || {},
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
      retries: [],
      apiDetails: {
        endpoint: apiCallData.endpoint || '',
        method: apiCallData.method || 'POST',
        rateLimitInfo: null
      }
    };

    // Store initial API call record
    await this.dataStore.saveWebhookRecord(apiCallRecord);
    this.activeApiCalls.set(apiCallId, apiCallRecord);

    console.log(`Started monitoring GitHub API call: ${apiCallId} for run: ${runId}`);
    return apiCallId;
  }

  /**
   * Log GitHub API request details
   * @param {string} apiCallId - API call record ID
   * @param {Object} requestData - Request information
   * @returns {Promise<void>}
   */
  async logApiRequest(apiCallId, requestData) {
    try {
      const apiCallRecord = await this.dataStore.getWebhookRecord(apiCallId);
      if (!apiCallRecord) {
        throw new Error(`API call record not found: ${apiCallId}`);
      }

      // Update API call record with request details
      apiCallRecord.payload = requestData.payload || {};
      apiCallRecord.apiDetails.endpoint = requestData.endpoint || '';
      apiCallRecord.apiDetails.method = requestData.method || 'POST';
      apiCallRecord.timing.sent = new Date().toISOString();

      // Validate GitHub token if provided
      if (requestData.token) {
        const authResult = this._validateGitHubToken(requestData.token);
        apiCallRecord.authentication = {
          method: 'token',
          success: authResult.success,
          errors: authResult.errors
        };
      }

      await this.dataStore.saveWebhookRecord(apiCallRecord);
      this.activeApiCalls.set(apiCallId, apiCallRecord);

      console.log(`Logged GitHub API request for ${apiCallId}:`, {
        endpoint: requestData.endpoint,
        method: requestData.method,
        payloadSize: JSON.stringify(requestData.payload || {}).length
      });
    } catch (error) {
      console.error(`Failed to log API request for ${apiCallId}:`, error);
      throw error;
    }
  }

  /**
   * Log GitHub API response and extract rate limiting information
   * @param {string} apiCallId - API call record ID
   * @param {Object} response - Response from GitHub API
   * @returns {Promise<Object>} Rate limiting information
   */
  async logApiResponse(apiCallId, response) {
    try {
      const apiCallRecord = await this.dataStore.getWebhookRecord(apiCallId);
      if (!apiCallRecord) {
        throw new Error(`API call record not found: ${apiCallId}`);
      }

      const receivedTime = new Date().toISOString();
      
      // Extract rate limiting information from headers
      const rateLimitInfo = this._extractRateLimitInfo(response.headers || {});
      this.rateLimitInfo = rateLimitInfo;

      apiCallRecord.response = {
        status: response.status || 0,
        body: response.body || null,
        headers: response.headers || {}
      };
      
      apiCallRecord.timing.received = receivedTime;
      apiCallRecord.apiDetails.rateLimitInfo = rateLimitInfo;

      await this.dataStore.saveWebhookRecord(apiCallRecord);
      this.activeApiCalls.set(apiCallId, apiCallRecord);

      console.log(`Logged GitHub API response for ${apiCallId}:`, {
        status: response.status,
        rateLimitRemaining: rateLimitInfo.remaining,
        responseTime: this._calculateResponseTime(apiCallRecord)
      });

      return rateLimitInfo;
    } catch (error) {
      console.error(`Failed to log API response for ${apiCallId}:`, error);
      throw error;
    }
  }

  /**
   * Track retry attempts for failed API calls
   * @param {string} apiCallId - API call record ID
   * @param {Object} retryData - Retry attempt information
   * @returns {Promise<void>}
   */
  async trackRetryAttempt(apiCallId, retryData) {
    try {
      const apiCallRecord = await this.dataStore.getWebhookRecord(apiCallId);
      if (!apiCallRecord) {
        throw new Error(`API call record not found: ${apiCallId}`);
      }

      const retryAttempt = {
        attempt: apiCallRecord.retries.length + 1,
        timestamp: new Date().toISOString(),
        reason: retryData.reason || 'Unknown',
        success: retryData.success || false,
        delay: retryData.delay || 0
      };

      apiCallRecord.retries.push(retryAttempt);
      await this.dataStore.saveWebhookRecord(apiCallRecord);
      this.activeApiCalls.set(apiCallId, apiCallRecord);

      console.log(`Tracked retry attempt for ${apiCallId}:`, retryAttempt);
    } catch (error) {
      console.error(`Failed to track retry attempt for ${apiCallId}:`, error);
      throw error;
    }
  }

  /**
   * Monitor for rate limiting and implement intelligent backoff
   * @returns {Promise<Object>} Current rate limit status
   */
  async checkRateLimitStatus() {
    const now = Date.now();
    
    if (this.rateLimitInfo.resetTime && now < this.rateLimitInfo.resetTime) {
      const waitTime = this.rateLimitInfo.resetTime - now;
      
      if (this.rateLimitInfo.remaining <= 10) { // Low remaining requests
        console.warn(`GitHub API rate limit low: ${this.rateLimitInfo.remaining} remaining, resets in ${waitTime}ms`);
        
        return {
          isLimited: true,
          remaining: this.rateLimitInfo.remaining,
          waitTime: waitTime,
          recommendedDelay: this._calculateBackoffDelay(this.rateLimitInfo.remaining)
        };
      }
    }

    return {
      isLimited: false,
      remaining: this.rateLimitInfo.remaining,
      waitTime: 0,
      recommendedDelay: 0
    };
  }

  /**
   * Complete API call monitoring and calculate final metrics
   * @param {string} apiCallId - API call record ID
   * @returns {Promise<Object>} Final API call metrics
   */
  async completeApiCallMonitoring(apiCallId) {
    try {
      const apiCallRecord = await this.dataStore.getWebhookRecord(apiCallId);
      if (!apiCallRecord) {
        throw new Error(`API call record not found: ${apiCallId}`);
      }

      apiCallRecord.timing.processed = new Date().toISOString();
      await this.dataStore.saveWebhookRecord(apiCallRecord);

      const metrics = this._calculateApiCallMetrics(apiCallRecord);
      
      // Remove from active tracking
      this.activeApiCalls.delete(apiCallId);

      console.log(`Completed GitHub API call monitoring for ${apiCallId}:`, metrics);
      return metrics;
    } catch (error) {
      console.error(`Failed to complete API call monitoring for ${apiCallId}:`, error);
      throw error;
    }
  }

  /**
   * Monitor workflow dispatch success
   * @param {string} apiCallId - API call record ID
   * @param {string} workflowId - GitHub workflow ID
   * @returns {Promise<boolean>} Whether workflow was successfully triggered
   */
  async monitorWorkflowDispatch(apiCallId, workflowId) {
    try {
      const apiCallRecord = await this.dataStore.getWebhookRecord(apiCallId);
      if (!apiCallRecord) {
        throw new Error(`API call record not found: ${apiCallId}`);
      }

      // Check if the API call was successful (status 2xx)
      const isSuccessful = apiCallRecord.response && 
        apiCallRecord.response.status >= 200 && 
        apiCallRecord.response.status < 300;

      if (isSuccessful) {
        // Additional validation: check if workflow actually started
        const workflowStarted = await this._verifyWorkflowStarted(workflowId);
        
        console.log(`Workflow dispatch monitoring for ${apiCallId}:`, {
          apiSuccess: isSuccessful,
          workflowStarted: workflowStarted
        });

        return workflowStarted;
      }

      return false;
    } catch (error) {
      console.error(`Failed to monitor workflow dispatch for ${apiCallId}:`, error);
      return false;
    }
  }

  /**
   * Get API call statistics for analysis
   * @param {string} runId - Optional pipeline run ID to filter by
   * @returns {Promise<Object>} API call statistics
   */
  async getApiCallStatistics(runId = null) {
    try {
      const apiCalls = runId 
        ? await this.dataStore.getWebhookRecords(runId)
        : await this._getAllGitHubApiCalls();

      const stats = {
        total: apiCalls.length,
        successful: 0,
        failed: 0,
        rateLimited: 0,
        retried: 0,
        averageResponseTime: 0,
        totalRetries: 0
      };

      let totalResponseTime = 0;

      apiCalls.forEach(apiCall => {
        if (apiCall.response && apiCall.response.status >= 200 && apiCall.response.status < 300) {
          stats.successful++;
        } else {
          stats.failed++;
        }

        if (apiCall.response && apiCall.response.status === 429) {
          stats.rateLimited++;
        }

        if (apiCall.retries.length > 0) {
          stats.retried++;
          stats.totalRetries += apiCall.retries.length;
        }

        if (apiCall.timing.received && apiCall.timing.sent) {
          const responseTime = this._calculateResponseTime(apiCall);
          totalResponseTime += responseTime;
        }
      });

      if (stats.successful > 0) {
        stats.averageResponseTime = totalResponseTime / stats.successful;
      }

      return stats;
    } catch (error) {
      console.error('Failed to get API call statistics:', error);
      throw error;
    }
  }

  // Private helper methods

  /**
   * Validate GitHub authentication token
   * @param {string} token - GitHub token
   * @returns {Object} Validation result
   */
  _validateGitHubToken(token) {
    const errors = [];
    
    if (!token) {
      errors.push('No GitHub token provided');
    } else if (typeof token !== 'string') {
      errors.push('GitHub token must be a string');
    } else if (token.length < 10) {
      errors.push('GitHub token appears to be too short');
    } else if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
      errors.push('GitHub token format not recognized');
    }

    return {
      success: errors.length === 0,
      errors: errors
    };
  }

  /**
   * Extract rate limiting information from GitHub API response headers
   * @param {Object} headers - Response headers
   * @returns {Object} Rate limit information
   */
  _extractRateLimitInfo(headers) {
    return {
      limit: headers['x-ratelimit-limit'] ? parseInt(headers['x-ratelimit-limit']) : null,
      remaining: headers['x-ratelimit-remaining'] !== undefined ? parseInt(headers['x-ratelimit-remaining']) : null,
      resetTime: headers['x-ratelimit-reset'] 
        ? parseInt(headers['x-ratelimit-reset']) * 1000 
        : null,
      used: headers['x-ratelimit-used'] ? parseInt(headers['x-ratelimit-used']) : null,
      resource: headers['x-ratelimit-resource'] || 'core'
    };
  }

  /**
   * Calculate response time for API call
   * @param {Object} apiCallRecord - API call record
   * @returns {number} Response time in milliseconds
   */
  _calculateResponseTime(apiCallRecord) {
    if (!apiCallRecord.timing.sent || !apiCallRecord.timing.received) {
      return 0;
    }

    const sent = new Date(apiCallRecord.timing.sent);
    const received = new Date(apiCallRecord.timing.received);
    return received - sent;
  }

  /**
   * Calculate comprehensive API call metrics
   * @param {Object} apiCallRecord - API call record
   * @returns {Object} API call metrics
   */
  _calculateApiCallMetrics(apiCallRecord) {
    const responseTime = this._calculateResponseTime(apiCallRecord);
    const totalTime = apiCallRecord.timing.processed && apiCallRecord.timing.sent
      ? new Date(apiCallRecord.timing.processed) - new Date(apiCallRecord.timing.sent)
      : 0;

    return {
      apiCallId: apiCallRecord.id,
      endpoint: apiCallRecord.apiDetails.endpoint,
      method: apiCallRecord.apiDetails.method,
      responseTime: responseTime,
      totalTime: totalTime,
      success: apiCallRecord.response && apiCallRecord.response.status >= 200 && apiCallRecord.response.status < 300,
      statusCode: apiCallRecord.response ? apiCallRecord.response.status : null,
      retryCount: apiCallRecord.retries.length,
      rateLimitInfo: apiCallRecord.apiDetails.rateLimitInfo,
      payloadSize: JSON.stringify(apiCallRecord.payload).length
    };
  }

  /**
   * Calculate backoff delay based on remaining rate limit
   * @param {number} remaining - Remaining API calls
   * @returns {number} Recommended delay in milliseconds
   */
  _calculateBackoffDelay(remaining) {
    if (remaining <= 0) {
      return 60000; // 1 minute if no calls remaining
    } else if (remaining <= 5) {
      return 30000; // 30 seconds if very low
    } else if (remaining <= 10) {
      return 10000; // 10 seconds if low
    }
    
    return 0; // No delay needed
  }

  /**
   * Verify that a workflow actually started after dispatch
   * @param {string} workflowId - GitHub workflow ID
   * @returns {Promise<boolean>} Whether workflow started
   */
  async _verifyWorkflowStarted(workflowId) {
    // This would require GitHub API access to check workflow runs
    // For now, we'll return true as a placeholder
    // In a real implementation, this would make an API call to check recent workflow runs
    console.log(`Verifying workflow started: ${workflowId} (placeholder implementation)`);
    return true;
  }

  /**
   * Get all GitHub API calls from storage
   * @returns {Promise<Array>} Array of GitHub API call records
   */
  async _getAllGitHubApiCalls() {
    // This would need to be implemented in DataStore to filter by destination
    // For now, we'll implement a basic version
    const allWebhooks = await this.dataStore.getWebhookRecords();
    return allWebhooks.filter(webhook => webhook.destination === 'github');
  }
}