const EventEmitter = require('events');
const path = require('path');
const fs = require('fs').promises;

/**
 * AlertManager handles error detection, threshold monitoring, and notification delivery
 * Supports multiple notification channels: console, dashboard, email
 */
class AlertManager extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      thresholds: {
        errorRate: 0.1, // 10% error rate threshold
        responseTime: 5000, // 5 second response time threshold
        failureCount: 3, // 3 consecutive failures
        webhookTimeout: 30000, // 30 second webhook timeout
        buildTime: 600000 // 10 minute build time threshold
      },
      notifications: {
        console: true,
        dashboard: true,
        email: false
      },
      cooldown: 300000, // 5 minute cooldown between similar alerts
      ...config
    };
    
    this.activeAlerts = new Map();
    this.alertHistory = [];
    this.lastAlertTimes = new Map();
    this.metrics = {
      totalAlerts: 0,
      alertsByType: {},
      alertsBySeverity: {}
    };
  }

  /**
   * Process pipeline run data and check for alert conditions
   */
  async checkAlerts(pipelineRun) {
    const alerts = [];
    
    // Check error rate threshold
    if (pipelineRun.success === false) {
      alerts.push(await this.createAlert('pipeline_failure', 'high', {
        runId: pipelineRun.id,
        trigger: pipelineRun.trigger,
        error: pipelineRun.errors?.[0] || 'Unknown error',
        duration: pipelineRun.duration
      }));
    }
    
    // Check response time thresholds
    if (pipelineRun.duration > this.config.thresholds.responseTime) {
      alerts.push(await this.createAlert('slow_pipeline', 'medium', {
        runId: pipelineRun.id,
        duration: pipelineRun.duration,
        threshold: this.config.thresholds.responseTime
      }));
    }
    
    // Check individual stage performance
    for (const stage of pipelineRun.stages || []) {
      if (stage.status === 'failed') {
        alerts.push(await this.createAlert('stage_failure', 'high', {
          runId: pipelineRun.id,
          stage: stage.name,
          error: stage.errors?.[0] || 'Stage failed',
          duration: stage.duration
        }));
      }
      
      // Check stage-specific thresholds
      if (stage.name === 'build_process' && stage.duration > this.config.thresholds.buildTime) {
        alerts.push(await this.createAlert('slow_build', 'medium', {
          runId: pipelineRun.id,
          duration: stage.duration,
          threshold: this.config.thresholds.buildTime
        }));
      }
    }
    
    // Process and send alerts
    for (const alert of alerts) {
      await this.processAlert(alert);
    }
    
    return alerts;
  }

  /**
   * Check webhook-specific alert conditions
   */
  async checkWebhookAlerts(webhookRecord) {
    const alerts = [];
    
    // Check webhook timeout
    if (webhookRecord.timing) {
      const duration = new Date(webhookRecord.timing.processed) - new Date(webhookRecord.timing.sent);
      if (duration > this.config.thresholds.webhookTimeout) {
        alerts.push(await this.createAlert('webhook_timeout', 'medium', {
          webhookId: webhookRecord.id,
          runId: webhookRecord.runId,
          duration,
          threshold: this.config.thresholds.webhookTimeout,
          source: webhookRecord.source
        }));
      }
    }
    
    // Check webhook authentication failures
    if (webhookRecord.authentication && !webhookRecord.authentication.success) {
      alerts.push(await this.createAlert('webhook_auth_failure', 'high', {
        webhookId: webhookRecord.id,
        runId: webhookRecord.runId,
        source: webhookRecord.source,
        error: webhookRecord.authentication.errors?.[0] || 'Authentication failed'
      }));
    }
    
    // Check webhook response errors
    if (webhookRecord.response && webhookRecord.response.status >= 400) {
      alerts.push(await this.createAlert('webhook_error', 'high', {
        webhookId: webhookRecord.id,
        runId: webhookRecord.runId,
        source: webhookRecord.source,
        status: webhookRecord.response.status,
        error: webhookRecord.response.body
      }));
    }
    
    // Process and send alerts
    for (const alert of alerts) {
      await this.processAlert(alert);
    }
    
    return alerts;
  }

  /**
   * Create an alert object
   */
  async createAlert(type, severity, data) {
    const alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      severity, // 'low', 'medium', 'high', 'critical'
      timestamp: new Date().toISOString(),
      data,
      status: 'active',
      acknowledged: false,
      resolvedAt: null
    };
    
    return alert;
  }

  /**
   * Process an alert (check cooldown, send notifications)
   */
  async processAlert(alert) {
    // Check cooldown period
    const cooldownKey = `${alert.type}_${JSON.stringify(alert.data)}`;
    const lastAlertTime = this.lastAlertTimes.get(cooldownKey);
    const now = Date.now();
    
    if (lastAlertTime && (now - lastAlertTime) < this.config.cooldown) {
      // Skip alert due to cooldown
      return;
    }
    
    // Update metrics
    this.metrics.totalAlerts++;
    this.metrics.alertsByType[alert.type] = (this.metrics.alertsByType[alert.type] || 0) + 1;
    this.metrics.alertsBySeverity[alert.severity] = (this.metrics.alertsBySeverity[alert.severity] || 0) + 1;
    
    // Store alert
    this.activeAlerts.set(alert.id, alert);
    this.alertHistory.push(alert);
    this.lastAlertTimes.set(cooldownKey, now);
    
    // Send notifications
    await this.sendNotifications(alert);
    
    // Emit alert event for dashboard
    this.emit('alert', alert);
    
    return alert;
  }

  /**
   * Send notifications through configured channels
   */
  async sendNotifications(alert) {
    const notifications = [];
    
    // Console notification
    if (this.config.notifications.console) {
      notifications.push(this.sendConsoleNotification(alert));
    }
    
    // Dashboard notification (handled by WebSocket)
    if (this.config.notifications.dashboard) {
      notifications.push(this.sendDashboardNotification(alert));
    }
    
    // Email notification (placeholder for future implementation)
    if (this.config.notifications.email) {
      notifications.push(this.sendEmailNotification(alert));
    }
    
    await Promise.all(notifications);
  }

  /**
   * Send console notification
   */
  async sendConsoleNotification(alert) {
    const severityColors = {
      low: '\x1b[36m',     // Cyan
      medium: '\x1b[33m',  // Yellow
      high: '\x1b[31m',    // Red
      critical: '\x1b[35m' // Magenta
    };
    
    const color = severityColors[alert.severity] || '\x1b[0m';
    const reset = '\x1b[0m';
    
    console.log(`${color}[ALERT ${alert.severity.toUpperCase()}]${reset} ${alert.type}: ${this.formatAlertMessage(alert)}`);
    
    if (alert.data) {
      console.log(`  Data: ${JSON.stringify(alert.data, null, 2)}`);
    }
  }

  /**
   * Send dashboard notification (emit event for WebSocket handler)
   */
  async sendDashboardNotification(alert) {
    // This will be picked up by the WebSocket handler
    this.emit('dashboard_alert', {
      type: 'alert',
      alert: {
        ...alert,
        message: this.formatAlertMessage(alert)
      }
    });
  }

  /**
   * Send email notification (placeholder)
   */
  async sendEmailNotification(alert) {
    // Placeholder for email notification implementation
    // Could integrate with services like SendGrid, AWS SES, etc.
    console.log(`[EMAIL ALERT] ${alert.type}: ${this.formatAlertMessage(alert)}`);
  }

  /**
   * Format alert message for display
   */
  formatAlertMessage(alert) {
    const messages = {
      pipeline_failure: `Pipeline run ${alert.data.runId} failed: ${alert.data.error}`,
      slow_pipeline: `Pipeline run ${alert.data.runId} took ${alert.data.duration}ms (threshold: ${alert.data.threshold}ms)`,
      stage_failure: `Stage '${alert.data.stage}' failed in run ${alert.data.runId}: ${alert.data.error}`,
      slow_build: `Build process took ${alert.data.duration}ms (threshold: ${alert.data.threshold}ms)`,
      webhook_timeout: `Webhook from ${alert.data.source} timed out after ${alert.data.duration}ms`,
      webhook_auth_failure: `Webhook authentication failed for ${alert.data.source}: ${alert.data.error}`,
      webhook_error: `Webhook error from ${alert.data.source}: HTTP ${alert.data.status}`
    };
    
    return messages[alert.type] || `Alert: ${alert.type}`;
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId, acknowledgedBy = 'system') {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedBy = acknowledgedBy;
      alert.acknowledgedAt = new Date().toISOString();
      
      this.emit('alert_acknowledged', alert);
      return alert;
    }
    return null;
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId, resolvedBy = 'system') {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.status = 'resolved';
      alert.resolvedBy = resolvedBy;
      alert.resolvedAt = new Date().toISOString();
      
      this.activeAlerts.delete(alertId);
      this.emit('alert_resolved', alert);
      return alert;
    }
    return null;
  }

  /**
   * Get active alerts
   */
  getActiveAlerts() {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit = 100) {
    return this.alertHistory.slice(-limit);
  }

  /**
   * Get alert metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeAlertCount: this.activeAlerts.size,
      totalHistoryCount: this.alertHistory.length
    };
  }

  /**
   * Update alert thresholds
   */
  updateThresholds(newThresholds) {
    this.config.thresholds = {
      ...this.config.thresholds,
      ...newThresholds
    };
    
    this.emit('thresholds_updated', this.config.thresholds);
  }

  /**
   * Update notification settings
   */
  updateNotificationSettings(newSettings) {
    this.config.notifications = {
      ...this.config.notifications,
      ...newSettings
    };
    
    this.emit('notifications_updated', this.config.notifications);
  }

  /**
   * Clear old alerts from history
   */
  clearOldAlerts(maxAge = 7 * 24 * 60 * 60 * 1000) { // 7 days default
    const cutoff = new Date(Date.now() - maxAge);
    
    this.alertHistory = this.alertHistory.filter(alert => 
      new Date(alert.timestamp) > cutoff
    );
  }

  /**
   * Export alert configuration
   */
  exportConfig() {
    return {
      thresholds: this.config.thresholds,
      notifications: this.config.notifications,
      cooldown: this.config.cooldown
    };
  }

  /**
   * Import alert configuration
   */
  importConfig(config) {
    this.config = {
      ...this.config,
      ...config
    };
    
    this.emit('config_updated', this.config);
  }
}

module.exports = AlertManager;