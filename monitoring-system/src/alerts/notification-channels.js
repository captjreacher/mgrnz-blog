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

  async send(alert) {
    if (!this.isEnabled() || !this.websocketHandler) return;

    const notification = {
      type: 'alert',
      timestamp: new Date().toISOString(),
      alert: {
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        message: alert.message || this.formatMessage(alert),
        timestamp: alert.timestamp,
        data: alert.data,
        status: alert.status
      }
    };

    this.websocketHandler.broadcast(notification);
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
  }

  async send(alert) {
    if (!this.isEnabled() || this.recipients.length === 0) return;

    // Placeholder implementation - would integrate with actual email service
    const emailData = {
      to: this.recipients,
      subject: this.generateSubject(alert),
      body: this.generateBody(alert),
      html: this.generateHtmlBody(alert)
    };

    console.log(`[EMAIL NOTIFICATION] Would send email:`, emailData);
    
    // In a real implementation, this would use nodemailer, SendGrid, AWS SES, etc.
    // await this.emailService.send(emailData);
  }

  generateSubject(alert) {
    const severityPrefix = alert.severity === 'critical' ? '[CRITICAL] ' : 
                          alert.severity === 'high' ? '[HIGH] ' : '';
    return `${severityPrefix}Alert: ${alert.type} - ${new Date(alert.timestamp).toLocaleString()}`;
  }

  generateBody(alert) {
    return `
Alert Details:
- Type: ${alert.type}
- Severity: ${alert.severity}
- Time: ${new Date(alert.timestamp).toLocaleString()}
- Message: ${alert.message || 'No message'}

Data:
${JSON.stringify(alert.data, null, 2)}

Alert ID: ${alert.id}
    `.trim();
  }

  generateHtmlBody(alert) {
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
      </div>
      
      <div style="border: 1px solid #ddd; border-top: none; padding: 20px; border-radius: 0 0 5px 5px;">
        <p><strong>Time:</strong> ${new Date(alert.timestamp).toLocaleString()}</p>
        <p><strong>Message:</strong> ${alert.message || 'No message'}</p>
        
        ${alert.data && Object.keys(alert.data).length > 0 ? `
        <h3>Details:</h3>
        <pre style="background-color: #f8f9fa; padding: 10px; border-radius: 3px; overflow-x: auto;">${JSON.stringify(alert.data, null, 2)}</pre>
        ` : ''}
        
        <hr style="margin: 20px 0;">
        <p style="color: #6c757d; font-size: 12px;">Alert ID: ${alert.id}</p>
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
  }

  async send(alert) {
    if (!this.isEnabled() || !this.webhookUrl) return;

    const payload = {
      alert: {
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        message: alert.message,
        timestamp: alert.timestamp,
        data: alert.data
      },
      timestamp: new Date().toISOString()
    };

    try {
      // Placeholder for HTTP request - would use fetch or axios in real implementation
      console.log(`[WEBHOOK NOTIFICATION] Would POST to ${this.webhookUrl}:`, payload);
      
      // In a real implementation:
      // const response = await fetch(this.webhookUrl, {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     ...this.headers
      //   },
      //   body: JSON.stringify(payload),
      //   timeout: this.timeout
      // });
      
      // if (!response.ok) {
      //   throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
      // }
      
    } catch (error) {
      console.error(`Failed to send webhook notification: ${error.message}`);
    }
  }

  setUrl(url) {
    this.webhookUrl = url;
  }

  setHeaders(headers) {
    this.headers = headers;
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

  async sendToAll(alert, channelNames = null) {
    const targetChannels = channelNames || Array.from(this.channels.keys());
    const promises = [];

    for (const channelName of targetChannels) {
      const channel = this.channels.get(channelName);
      if (channel && channel.isEnabled()) {
        promises.push(
          channel.send(alert).catch(error => {
            console.error(`Failed to send notification via ${channelName}:`, error);
          })
        );
      }
    }

    await Promise.all(promises);
  }

  async sendToChannel(alert, channelName) {
    const channel = this.channels.get(channelName);
    if (channel && channel.isEnabled()) {
      await channel.send(alert);
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
}

module.exports = {
  NotificationChannel,
  ConsoleNotificationChannel,
  DashboardNotificationChannel,
  EmailNotificationChannel,
  WebhookNotificationChannel,
  NotificationManager
};