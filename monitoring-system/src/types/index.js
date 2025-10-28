/**
 * Core data models for the automated test cycle monitoring system
 * These interfaces define the structure for pipeline runs, webhooks, and performance metrics
 */

/**
 * @typedef {Object} TriggerEvent
 * @property {'manual'|'git'|'webhook'|'scheduled'} type - Type of trigger
 * @property {string} source - Source that initiated the trigger
 * @property {string} timestamp - ISO timestamp when trigger occurred
 * @property {Object} metadata - Additional trigger-specific data
 */

/**
 * @typedef {Object} PipelineStage
 * @property {string} name - Stage name (e.g., 'webhook_received', 'build_started')
 * @property {'pending'|'running'|'completed'|'failed'} status - Current stage status
 * @property {string} [startTime] - ISO timestamp when stage started
 * @property {string} [endTime] - ISO timestamp when stage completed
 * @property {number} [duration] - Duration in milliseconds
 * @property {Object} data - Stage-specific data and results
 * @property {string[]} errors - Array of error messages for this stage
 */

/**
 * @typedef {Object} ErrorRecord
 * @property {string} id - Unique error identifier
 * @property {string} stage - Pipeline stage where error occurred
 * @property {string} type - Error type/category
 * @property {string} message - Error message
 * @property {string} timestamp - ISO timestamp when error occurred
 * @property {Object} context - Additional error context
 */

/**
 * @typedef {Object} PerformanceMetrics
 * @property {number} webhookLatency - Time for webhook processing (ms)
 * @property {number} buildTime - Time for build process (ms)
 * @property {number} deploymentTime - Time for deployment (ms)
 * @property {number} siteResponseTime - Site response time (ms)
 * @property {number} totalPipelineTime - Total end-to-end time (ms)
 * @property {number} errorRate - Error rate percentage (0-100)
 * @property {number} successRate - Success rate percentage (0-100)
 * @property {number} throughput - Pipelines per hour
 */

/**
 * @typedef {Object} PipelineRun
 * @property {string} id - Unique pipeline run identifier
 * @property {TriggerEvent} trigger - Event that triggered this pipeline run
 * @property {PipelineStage[]} stages - Array of pipeline stages
 * @property {'running'|'completed'|'failed'|'timeout'} status - Overall pipeline status
 * @property {string} startTime - ISO timestamp when pipeline started
 * @property {string} [endTime] - ISO timestamp when pipeline completed
 * @property {number} [duration] - Total duration in milliseconds
 * @property {boolean} success - Whether pipeline completed successfully
 * @property {ErrorRecord[]} errors - Array of errors that occurred
 * @property {PerformanceMetrics} metrics - Performance metrics for this run
 */

/**
 * @typedef {Object} RetryAttempt
 * @property {number} attempt - Retry attempt number
 * @property {string} timestamp - ISO timestamp of retry
 * @property {string} reason - Reason for retry
 * @property {boolean} success - Whether retry was successful
 */

/**
 * @typedef {Object} WebhookAuthentication
 * @property {string} method - Authentication method used
 * @property {boolean} success - Whether authentication succeeded
 * @property {string[]} [errors] - Authentication error messages
 */

/**
 * @typedef {Object} WebhookResponse
 * @property {number} status - HTTP status code
 * @property {*} body - Response body
 * @property {Object} headers - Response headers
 */

/**
 * @typedef {Object} WebhookTiming
 * @property {string} sent - ISO timestamp when webhook was sent
 * @property {string} received - ISO timestamp when webhook was received
 * @property {string} processed - ISO timestamp when webhook was processed
 */

/**
 * @typedef {Object} WebhookRecord
 * @property {string} id - Unique webhook identifier
 * @property {string} runId - Associated pipeline run ID
 * @property {'mailerlite'|'github'|'external'} source - Webhook source
 * @property {'supabase'|'github'|'site'} destination - Webhook destination
 * @property {Object} payload - Webhook payload data
 * @property {WebhookResponse} response - Webhook response details
 * @property {WebhookTiming} timing - Webhook timing information
 * @property {WebhookAuthentication} authentication - Authentication details
 * @property {RetryAttempt[]} retries - Array of retry attempts
 */

export {
  // Export type definitions for JSDoc usage
};