const nodemailer = require('nodemailer');
const https = require('https');

let fetchModulePromise = null;

const getFetch = async () => {
  if (!fetchModulePromise) {
    fetchModulePromise = import('node-fetch').then(module => module.default);
  }
  return fetchModulePromise;
};

/**
 * Notification channels for alert delivery
 * Supports console, dashboard, email, and webhook notifications
 */

class NotificationChannel {
  constructor(config = {}) {
    this.config = config;
    this.enabled = config.enabled !== false;
  }

  async send(alert) {
    throw new Error('send method must be implemented by subclass');
  }

  isEnabled() {
    return this.enabled;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  updateConfig(config = {}) {
    this.config = { ...this.config, ...config };
    if (typeof config.enabled === 'boolean') {
      this.enabled = config.enabled;
    }
  }
}

/**
 * Console notification channel
 */
class ConsoleNotificationChannel extends NotificationChannel {
  constructor(config = {}) {
    super(config);
    this.colors = {
      low: '\x1b[36m',     // Cyan
      medium: '\x1b[33m',  // Yellow
      high: '\x1b[31m',    // Red
      critical: '\x1b[35m' // Magenta
    };
    this.reset = '\x1b[0m';
  }

  async send(alert) {
    if (!this.isEnabled()) return;

    const color = this.colors[alert.severity] || this.reset;
    const timestamp = new Date(alert.timestamp).toLocaleString();
    
    console.log(`${color}[${timestamp}] ALERT [${alert.severity.toUpperCase()}]${this.reset} ${alert.type}`);
    console.log(`  Message: ${alert.message || 'No message'}`);
    
    if (alert.data && Object.keys(alert.data).length > 0) {
      console.log(`  Data: ${JSON.stringify(alert.data, null, 2)}`);
    }
    
    console.log(''); // Empty line for readability
  }
}

/**
 * Dashboard notification channel (WebSocket)
 */
class DashboardNotificationChannel extends NotificationChannel {
  constructor(config = {}) {
    super(config);
    this.websocketHandler = config.websocketHandler;
  }

  async send(alert, eventType = 'alert_generated') {
    if (!this.isEnabled() || !this.websocketHandler) return;

    const payload = {
      id: alert.id,
      type: alert.type,
      severity: alert.severity,
      message: alert.message || this.formatMessage(alert),
      timestamp: alert.timestamp,
      data: alert.data,
      status: alert.status,
      occurrences: alert.occurrences,
      acknowledged: alert.acknowledged,
      acknowledgedBy: alert.acknowledgedBy,
      acknowledgedAt: alert.acknowledgedAt,
      resolvedAt: alert.resolvedAt,
      resolvedBy: alert.resolvedBy
    };

    this.websocketHandler.broadcast(eventType, payload);
  }

  formatMessage(alert) {
    const messages = {
      pipeline_failure: `Pipeline failed: ${alert.data?.error || 'Unknown error'}`,
      slow_pipeline: `Slow pipeline detected (${alert.data?.duration}ms)`,
      stage_failure: `Stage '${alert.data?.stage}' failed`,
      slow_build: `Build process is slow (${alert.data?.duration}ms)`,
      webhook_timeout: `Webhook timeout from ${alert.data?.source}`,
      webhook_auth_failure: `Webhook authentication failed`,
      webhook_error: `Webhook error (HTTP ${alert.data?.status})`
    };
    
    return messages[alert.type] || `Alert: ${alert.type}`;
  }

  setWebSocketHandler(handler) {
    this.websocketHandler = handler;
  }
}

/**
 * Email notification channel (placeholder implementation)
 */
class EmailNotificationChannel extends NotificationChannel {
  constructor(config = {}) {
    super(config);
    this.smtpConfig = config.smtp || {};
    this.recipients = config.recipients || [];
    this.templates = config.templates || {};
    this.from = config.from || config.smtp?.auth?.user || 'alerts@monitoring.local';
    this.subjectPrefix = config.subjectPrefix || '';
    this._transporter = null;
  }

  async send(alert, eventType = 'alert_generated') {
    if (!this.isEnabled() || this.recipients.length === 0) return;
    if (eventType !== 'alert_generated') {
      // Only lifecycle transitions and new alerts get informational emails
      if (!this.config.notifyOnLifecycle) {
        return;
      }
    }

    try {
      const transporter = await this._getTransporter();
      if (!transporter) {
        console.warn('[EmailNotificationChannel] Transporter not configured, skipping email send');
        return;
      }

      const mailOptions = {
        from: this.from,
        to: Array.isArray(this.recipients) ? this.recipients.join(',') : this.recipients,
        subject: this.generateSubject(alert, eventType),
        text: this.generateBody(alert, eventType),
        html: this.generateHtmlBody(alert, eventType)
      };

      await transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Failed to send email notification:', error.message);
    }
  }

  async _getTransporter() {
    if (this._transporter) {
      return this._transporter;
    }

    if (!this.smtpConfig || Object.keys(this.smtpConfig).length === 0) {
      return null;
    }

    this._transporter = nodemailer.createTransport(this.smtpConfig);
    return this._transporter;
  }

  generateSubject(alert, eventType = 'alert_generated') {
    const severityPrefix = alert.severity === 'critical' ? '[CRITICAL] ' :
                          alert.severity === 'high' ? '[HIGH] ' : '';
    const lifecyclePrefix = eventType === 'alert_resolved' ? '[RESOLVED] ' :
                            eventType === 'alert_acknowledged' ? '[ACK] ' : '';
    return `${this.subjectPrefix}${lifecyclePrefix}${severityPrefix}Alert: ${alert.type} - ${new Date(alert.timestamp).toLocaleString()}`;
  }

  generateBody(alert, eventType = 'alert_generated') {
    return `
Alert Details:
- Type: ${alert.type}
- Severity: ${alert.severity}
- Status: ${alert.status}
- Event: ${eventType}
- Time: ${new Date(alert.timestamp).toLocaleString()}
- Message: ${alert.message || 'No message'}
- Occurrences: ${alert.occurrences || 1}

Data:
${JSON.stringify(alert.data, null, 2)}

Alert ID: ${alert.id}
Acknowledged: ${alert.acknowledged ? `by ${alert.acknowledgedBy} at ${alert.acknowledgedAt}` : 'No'}
Resolved: ${alert.resolvedAt ? `by ${alert.resolvedBy} at ${alert.resolvedAt}` : 'No'}
    `.trim();
  }

  generateHtmlBody(alert, eventType = 'alert_generated') {
    const severityColor = {
      low: '#17a2b8',
      medium: '#ffc107',
      high: '#dc3545',
      critical: '#6f42c1'
    }[alert.severity] || '#6c757d';

    return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: ${severityColor}; color: white; padding: 15px; border-radius: 5px 5px 0 0;">
        <h2 style="margin: 0;">Alert: ${alert.type}</h2>
        <p style="margin: 5px 0 0 0;">Severity: ${alert.severity.toUpperCase()}</p>
        <p style="margin: 5px 0 0 0;">Event: ${eventType.replace(/_/g, ' ')}</p>
      </div>

      <div style="border: 1px solid #ddd; border-top: none; padding: 20px; border-radius: 0 0 5px 5px;">
        <p><strong>Status:</strong> ${alert.status}</p>
        <p><strong>Occurrences:</strong> ${alert.occurrences || 1}</p>
        <p><strong>Time:</strong> ${new Date(alert.timestamp).toLocaleString()}</p>
        <p><strong>Message:</strong> ${alert.message || 'No message'}</p>

        ${alert.data && Object.keys(alert.data).length > 0 ? `
        <h3>Details:</h3>
        <pre style="background-color: #f8f9fa; padding: 10px; border-radius: 3px; overflow-x: auto;">${JSON.stringify(alert.data, null, 2)}</pre>
        ` : ''}

        <hr style="margin: 20px 0;">
        <p style="color: #6c757d; font-size: 12px;">Alert ID: ${alert.id}</p>
        <p style="color: #6c757d; font-size: 12px;">Acknowledged: ${alert.acknowledged ? `by ${alert.acknowledgedBy} at ${alert.acknowledgedAt}` : 'No'}</p>
        <p style="color: #6c757d; font-size: 12px;">Resolved: ${alert.resolvedAt ? `by ${alert.resolvedBy} at ${alert.resolvedAt}` : 'No'}</p>
      </div>
    </div>
    `;
  }

  addRecipient(email) {
    if (!this.recipients.includes(email)) {
      this.recipients.push(email);
    }
  }

  removeRecipient(email) {
    this.recipients = this.recipients.filter(r => r !== email);
  }

  updateConfig(config = {}) {
    super.updateConfig(config);
    if (config.smtp) {
      this.smtpConfig = { ...config.smtp };
      this._transporter = null;
    }
    if (config.recipients) {
      this.recipients = Array.isArray(config.recipients) ? [...config.recipients] : [config.recipients];
    }
    if (config.templates) {
      this.templates = { ...this.templates, ...config.templates };
    }
    if (config.from) {
      this.from = config.from;
    }
    if (config.subjectPrefix !== undefined) {
      this.subjectPrefix = config.subjectPrefix;
    }
  }
}

/**
 * Webhook notification channel
 */
class WebhookNotificationChannel extends NotificationChannel {
  constructor(config = {}) {
    super(config);
    this.webhookUrl = config.url;
    this.headers = config.headers || {};
    this.timeout = config.timeout || 5000;
    this.verifySsl = config.verifySsl !== false;
  }

  async send(alert, eventType = 'alert_generated') {
    if (!this.isEnabled() || !this.webhookUrl) return;
    if (eventType !== 'alert_generated' && this.config.notifyOnLifecycle === false) {
      return;
    }

    const payload = {
      event: eventType,
      alert: {
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        message: alert.message,
        timestamp: alert.timestamp,
        data: alert.data,
        status: alert.status,
        occurrences: alert.occurrences,
        acknowledged: alert.acknowledged,
        acknowledgedBy: alert.acknowledgedBy,
        acknowledgedAt: alert.acknowledgedAt,
        resolvedAt: alert.resolvedAt,
        resolvedBy: alert.resolvedBy
      },
      timestamp: new Date().toISOString()
    };

    let timeoutHandle;
    try {
      const fetch = await getFetch();
      const controller = new AbortController();
      timeoutHandle = setTimeout(() => controller.abort(), this.timeout);

      const requestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.headers
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      };

      if (this.verifySsl === false) {
        requestOptions.agent = new https.Agent({ rejectUnauthorized: false });
      }

      const response = await fetch(this.webhookUrl, requestOptions);

      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Webhook failed: ${response.status} ${response.statusText} - ${text}`);
      }
    } catch (error) {
      console.error(`Failed to send webhook notification: ${error.message}`);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  setUrl(url) {
    this.webhookUrl = url;
  }

  setHeaders(headers) {
    this.headers = headers;
  }

  updateConfig(config = {}) {
    super.updateConfig(config);
    if (config.url) {
      this.webhookUrl = config.url;
    }
    if (config.headers) {
      this.headers = { ...config.headers };
    }
    if (config.timeout) {
      this.timeout = config.timeout;
    }
    if (config.verifySsl !== undefined) {
      this.verifySsl = config.verifySsl;
    }
  }
}

/**
 * Notification manager that coordinates multiple channels
 */
class NotificationManager {
  constructor() {
    this.channels = new Map();
    this.defaultChannels = ['console', 'dashboard'];
  }

  addChannel(name, channel) {
    this.channels.set(name, channel);
  }

  removeChannel(name) {
    this.channels.delete(name);
  }

  getChannel(name) {
    return this.channels.get(name);
  }

  async sendToAll(alert, channelNames = null, eventType = 'alert_generated') {
    const targetChannels = channelNames || Array.from(this.channels.keys());
    const promises = [];

    for (const channelName of targetChannels) {
      const channel = this.channels.get(channelName);
      if (channel && channel.isEnabled()) {
        promises.push(
          channel.send(alert, eventType).catch(error => {
            console.error(`Failed to send notification via ${channelName}:`, error);
          })
        );
      }
    }

    await Promise.all(promises);
  }

  async sendToChannel(alert, channelName, eventType = 'alert_generated') {
    const channel = this.channels.get(channelName);
    if (channel && channel.isEnabled()) {
      await channel.send(alert, eventType);
    }
  }

  enableChannel(name) {
    const channel = this.channels.get(name);
    if (channel) {
      channel.setEnabled(true);
    }
  }

  disableChannel(name) {
    const channel = this.channels.get(name);
    if (channel) {
      channel.setEnabled(false);
    }
  }

  getChannelStatus() {
    const status = {};
    for (const [name, channel] of this.channels) {
      status[name] = {
        enabled: channel.isEnabled(),
        type: channel.constructor.name
      };
    }
    return status;
  }

  updateChannelConfig(name, config = {}) {
    const channel = this.channels.get(name);
    if (channel && typeof channel.updateConfig === 'function') {
      channel.updateConfig(config);
    }
  }
}

module.exports = {
  NotificationChannel,
  ConsoleNotificationChannel,
  DashboardNotificationChannel,
  EmailNotificationChannel,
  WebhookNotificationChannel,
  NotificationManager
};