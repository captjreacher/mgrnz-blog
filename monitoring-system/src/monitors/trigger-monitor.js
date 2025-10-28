import { execSync } from 'child_process';
import { IdGenerator } from '../utils/id-generator.js';

/**
 * TriggerMonitor class detects and logs deployment triggers from various sources
 * Monitors git commits, manual GitHub Actions dispatch, and webhook events
 */
export class TriggerMonitor {
  constructor(testCycleEngine, config = {}) {
    this.engine = testCycleEngine;
    this.config = config;
    this.lastCheckedCommit = null;
    this.isMonitoring = false;
    this.monitoringInterval = null;
    this.webhookListeners = new Map();
  }

  /**
   * Initialize the trigger monitor
   */
  async initialize() {
    try {
      // Get the latest commit hash to start monitoring from
      this.lastCheckedCommit = await this._getLatestCommitHash();
      console.log('TriggerMonitor initialized, starting from commit:', this.lastCheckedCommit);
      return true;
    } catch (error) {
      console.error('Failed to initialize TriggerMonitor:', error.message);
      throw error;
    }
  }

  /**
   * Start monitoring for deployment triggers
   */
  async startMonitoring() {
    if (this.isMonitoring) {
      console.log('TriggerMonitor is already running');
      return;
    }

    this.isMonitoring = true;
    console.log('Starting trigger monitoring...');

    // Start periodic git monitoring
    const gitInterval = this.config.gitMonitorInterval || 30000; // 30 seconds
    this.monitoringInterval = setInterval(() => {
      this._checkForGitTriggers();
    }, gitInterval);

    // Start GitHub Actions monitoring
    this._startGitHubActionsMonitoring();

    console.log('Trigger monitoring started');
  }

  /**
   * Stop monitoring for deployment triggers
   */
  async stopMonitoring() {
    if (!this.isMonitoring) {
      console.log('TriggerMonitor is not running');
      return;
    }

    this.isMonitoring = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    // Stop webhook listeners
    this.webhookListeners.clear();

    console.log('Trigger monitoring stopped');
  }

  /**
   * Manually detect and log a trigger event
   * @param {'manual'|'git'|'webhook'|'scheduled'} type - Trigger type
   * @param {string} source - Source identifier
   * @param {Object} metadata - Additional trigger metadata
   * @returns {Promise<string>} Pipeline run ID
   */
  async detectTrigger(type, source, metadata = {}) {
    try {
      const trigger = {
        type,
        source,
        timestamp: new Date().toISOString(),
        metadata
      };

      console.log(`Detected ${type} trigger from ${source}`);
      
      // Create pipeline run through the engine
      const runId = await this.engine.createPipelineRun(trigger);
      
      // Log the trigger detection
      await this._logTriggerDetection(runId, trigger);
      
      return runId;
    } catch (error) {
      console.error('Failed to detect trigger:', error.message);
      throw error;
    }
  }

  /**
   * Register a webhook listener for trigger detection
   * @param {string} webhookType - Type of webhook (e.g., 'mailerlite', 'github')
   * @param {Function} callback - Callback function to handle webhook
   */
  registerWebhookListener(webhookType, callback) {
    this.webhookListeners.set(webhookType, callback);
    console.log(`Registered webhook listener for ${webhookType}`);
  }

  /**
   * Process a webhook trigger
   * @param {string} webhookType - Type of webhook
   * @param {Object} payload - Webhook payload
   * @param {Object} headers - Request headers
   * @returns {Promise<string|null>} Pipeline run ID if trigger detected
   */
  async processWebhookTrigger(webhookType, payload, headers = {}) {
    try {
      const listener = this.webhookListeners.get(webhookType);
      if (!listener) {
        console.log(`No listener registered for webhook type: ${webhookType}`);
        return null;
      }

      // Extract trigger metadata from webhook
      const metadata = {
        webhookType,
        payload: this._sanitizePayload(payload),
        headers: this._sanitizeHeaders(headers),
        userAgent: headers['user-agent'] || 'unknown',
        contentType: headers['content-type'] || 'unknown'
      };

      // Detect the trigger
      const runId = await this.detectTrigger('webhook', webhookType, metadata);
      
      // Call the registered listener
      await listener(runId, payload, headers);
      
      return runId;
    } catch (error) {
      console.error('Failed to process webhook trigger:', error.message);
      throw error;
    }
  }

  // Private methods

  /**
   * Check for new git commits that could trigger deployment
   */
  async _checkForGitTriggers() {
    try {
      const currentCommit = await this._getLatestCommitHash();
      
      if (this.lastCheckedCommit && currentCommit !== this.lastCheckedCommit) {
        // New commit detected
        const commitInfo = await this._getCommitInfo(currentCommit);
        
        const metadata = {
          commitHash: currentCommit,
          previousCommit: this.lastCheckedCommit,
          author: commitInfo.author,
          message: commitInfo.message,
          timestamp: commitInfo.timestamp,
          branch: await this._getCurrentBranch()
        };

        await this.detectTrigger('git', 'commit', metadata);
      }

      this.lastCheckedCommit = currentCommit;
    } catch (error) {
      console.error('Error checking for git triggers:', error.message);
    }
  }

  /**
   * Start monitoring GitHub Actions for manual dispatch events
   */
  async _startGitHubActionsMonitoring() {
    // This would typically use GitHub API to monitor for workflow_dispatch events
    // For now, we'll implement a basic check that can be extended
    
    const githubInterval = this.config.githubMonitorInterval || 60000; // 1 minute
    
    setInterval(async () => {
      try {
        await this._checkForGitHubActionsTriggers();
      } catch (error) {
        console.error('Error checking GitHub Actions triggers:', error.message);
      }
    }, githubInterval);
  }

  /**
   * Check for GitHub Actions manual dispatch triggers
   */
  async _checkForGitHubActionsTriggers() {
    // This is a placeholder for GitHub API integration
    // In a real implementation, this would:
    // 1. Call GitHub API to get recent workflow runs
    // 2. Check for workflow_dispatch events
    // 3. Compare with last known runs to detect new manual triggers
    
    console.log('Checking for GitHub Actions triggers...');
    
    // For now, we'll simulate detection based on file system changes
    // that might indicate a manual deployment was triggered
    try {
      const deploymentMarkers = [
        'deployment-timestamp.txt',
        'build-info.txt',
        'CACHE-BUSTER.txt'
      ];

      for (const marker of deploymentMarkers) {
        const changed = await this._checkFileChanged(`static/${marker}`);
        if (changed) {
          const metadata = {
            markerFile: marker,
            detectionMethod: 'file_system_change',
            timestamp: new Date().toISOString()
          };

          await this.detectTrigger('manual', 'github_actions_dispatch', metadata);
          break; // Only trigger once per check cycle
        }
      }
    } catch (error) {
      // File system checks are optional, don't fail the monitoring
      console.log('GitHub Actions trigger check completed (file system method)');
    }
  }

  /**
   * Get the latest commit hash from git
   */
  async _getLatestCommitHash() {
    try {
      const result = execSync('git rev-parse HEAD', { 
        encoding: 'utf8',
        cwd: process.cwd()
      });
      return result.trim();
    } catch (error) {
      throw new Error(`Failed to get latest commit hash: ${error.message}`);
    }
  }

  /**
   * Get detailed information about a commit
   */
  async _getCommitInfo(commitHash) {
    try {
      const result = execSync(
        `git show --format="%an|%ae|%s|%ci" --no-patch ${commitHash}`,
        { 
          encoding: 'utf8',
          cwd: process.cwd()
        }
      );
      
      const [author, email, message, timestamp] = result.trim().split('|');
      
      return {
        hash: commitHash,
        author: author.trim(),
        email: email.trim(),
        message: message.trim(),
        timestamp: timestamp.trim()
      };
    } catch (error) {
      throw new Error(`Failed to get commit info: ${error.message}`);
    }
  }

  /**
   * Get the current git branch
   */
  async _getCurrentBranch() {
    try {
      const result = execSync('git branch --show-current', { 
        encoding: 'utf8',
        cwd: process.cwd()
      });
      return result.trim();
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Check if a file has been modified recently
   */
  async _checkFileChanged(filePath) {
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      const fullPath = path.resolve(filePath);
      const stats = await fs.promises.stat(fullPath);
      
      // Check if file was modified in the last 5 minutes
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
      return stats.mtime.getTime() > fiveMinutesAgo;
    } catch (error) {
      return false; // File doesn't exist or can't be accessed
    }
  }

  /**
   * Log trigger detection event
   */
  async _logTriggerDetection(runId, trigger) {
    try {
      await this.engine.updatePipelineStage(runId, 'trigger_detected', 'completed', {
        triggerType: trigger.type,
        triggerSource: trigger.source,
        detectionTime: trigger.timestamp,
        metadata: trigger.metadata
      });
      
      console.log(`Logged trigger detection for run ${runId}: ${trigger.type} from ${trigger.source}`);
    } catch (error) {
      console.error('Failed to log trigger detection:', error.message);
    }
  }

  /**
   * Sanitize webhook payload for logging (remove sensitive data)
   */
  _sanitizePayload(payload) {
    if (!payload || typeof payload !== 'object') {
      return payload;
    }

    const sanitized = { ...payload };
    
    // Remove common sensitive fields
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth'];
    
    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  /**
   * Sanitize headers for logging (remove sensitive data)
   */
  _sanitizeHeaders(headers) {
    if (!headers || typeof headers !== 'object') {
      return headers;
    }

    const sanitized = { ...headers };
    
    // Remove authorization and other sensitive headers
    const sensitiveHeaders = ['authorization', 'x-api-key', 'x-auth-token'];
    
    for (const header of sensitiveHeaders) {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    }

    return sanitized;
  }
}