const EventEmitter = require('events');
const path = require('path');
const fs = require('fs').promises;

const {
  NotificationManager,
  ConsoleNotificationChannel,
  DashboardNotificationChannel,
  EmailNotificationChannel,
  WebhookNotificationChannel
} = require('./notification-channels');

/**
 * AlertManager handles error detection, threshold monitoring, and notification delivery
 * Supports multiple notification channels with persistent configuration and lifecycle management
 */
class AlertManager extends EventEmitter {
  constructor(config = {}) {
    super();

    this.defaultConfig = {
      thresholds: {
        errorRate: 0.1,
        responseTime: 5000,
        failureCount: 3,
        webhookTimeout: 30000,
        buildTime: 600000
      },
      cooldown: 300000,
      cooldowns: {
        default: 300000,
        byType: {}
      },
      notifications: {
        console: { enabled: true },
        dashboard: { enabled: true },
        email: {
          enabled: false,
          recipients: [],
          smtp: {},
          notifyOnLifecycle: true
        },
        webhook: {
          enabled: false,
          url: null,
          headers: {},
          timeout: 5000,
          verifySsl: true,
          notifyOnLifecycle: true
        }
      }
    };

    this.metrics = {
      totalAlerts: 0,
      alertsByType: {},
      alertsBySeverity: {},
      suppressedAlerts: 0,
      deduplicatedAlerts: 0
    };

    this.activeAlerts = new Map();
    this.alertHistory = [];
    this.activeAlertSignatures = new Map();
    this.lastAlertTimes = new Map();
    this._persistedState = { acknowledged: {}, resolved: {} };

    this.configDir = config.configDir || path.join(process.cwd(), 'monitoring-system', 'data');
    this.thresholdsFile = config.thresholdsFile || path.join(this.configDir, 'alert-thresholds.json');
    this.stateFile = config.stateFile || path.join(this.configDir, 'alert-state.json');

    this.notificationManager = config.notificationManager || new NotificationManager();
    this.config = this._initializeConfig(config);
    this._configureNotificationChannels();

    this.persistenceReady = this._initializePersistence();
  }

  _initializeConfig(config = {}) {
    const merged = {
      ...this.defaultConfig,
      ...config,
      thresholds: {
        ...this.defaultConfig.thresholds,
        ...(config.thresholds || {})
      }
    };

    merged.notifications = this._normalizeNotificationConfig(merged.notifications || {});

    if (!merged.cooldowns) {
      merged.cooldowns = { ...this.defaultConfig.cooldowns };
    } else {
      merged.cooldowns = {
        default: merged.cooldowns.default || merged.cooldown || this.defaultConfig.cooldowns.default,
        byType: { ...(merged.cooldowns.byType || {}) }
      };
    }

    if (!merged.cooldown) {
      merged.cooldown = merged.cooldowns.default;
    }

    return merged;
  }

  _normalizeNotificationConfig(config = {}) {
    const defaults = this.defaultConfig.notifications;

    const normalizeEntry = (entryName) => {
      const value = config[entryName];
      const defaultValue = defaults[entryName];

      if (typeof value === 'boolean') {
        return { ...defaultValue, enabled: value };
      }

      if (value && typeof value === 'object') {
        return { ...defaultValue, ...value };
      }

      return { ...defaultValue };
    };

    return {
      console: normalizeEntry('console'),
      dashboard: normalizeEntry('dashboard'),
      email: normalizeEntry('email'),
      webhook: normalizeEntry('webhook')
    };
  }

  async _initializePersistence() {
    try {
      await fs.mkdir(this.configDir, { recursive: true });

      const persisted = await this._readJsonFile(this.thresholdsFile, null);
      if (persisted) {
        this._applyPersistentConfig(persisted);
      } else {
        await this._writeJsonFile(this.thresholdsFile, this._extractPersistableConfig());
      }

      const state = await this._readJsonFile(this.stateFile, { acknowledged: {}, resolved: {} });
      this._persistedState = state;
    } catch (error) {
      console.error('Failed to initialize alert persistence:', error.message);
    }
  }

  async _ensureInitialized() {
    try {
      await this.persistenceReady;
    } catch (error) {
      // Initialization errors are logged in _initializePersistence
    }
  }

  _configureNotificationChannels() {
    const notifications = this.config.notifications;

    if (!this.notificationManager.getChannel('console')) {
      this.notificationManager.addChannel('console', new ConsoleNotificationChannel({ enabled: notifications.console.enabled }));
    } else {
      this.notificationManager.updateChannelConfig('console', notifications.console);
    }

    if (!this.notificationManager.getChannel('dashboard')) {
      this.notificationManager.addChannel('dashboard', new DashboardNotificationChannel({
        enabled: notifications.dashboard.enabled,
        websocketHandler: notifications.dashboard.websocketHandler
      }));
    } else {
      this.notificationManager.updateChannelConfig('dashboard', notifications.dashboard);
    }

    if (!this.notificationManager.getChannel('email')) {
      this.notificationManager.addChannel('email', new EmailNotificationChannel({ ...notifications.email }));
    } else {
      this.notificationManager.updateChannelConfig('email', notifications.email);
    }

    if (!this.notificationManager.getChannel('webhook')) {
      this.notificationManager.addChannel('webhook', new WebhookNotificationChannel({ ...notifications.webhook }));
    } else {
      this.notificationManager.updateChannelConfig('webhook', notifications.webhook);
    }
  }

  _applyPersistentConfig(persisted = {}) {
    if (persisted.thresholds) {
      this.config.thresholds = {
        ...this.config.thresholds,
        ...persisted.thresholds
      };
    }

    if (persisted.cooldown) {
      this.config.cooldown = persisted.cooldown;
    }

    if (persisted.cooldowns) {
      this.config.cooldowns = {
        default: persisted.cooldowns.default || this.config.cooldowns.default,
        byType: {
          ...this.config.cooldowns.byType,
          ...(persisted.cooldowns.byType || {})
        }
      };
    }

    if (persisted.notifications) {
      this.config.notifications = this._normalizeNotificationConfig({
        ...this.config.notifications,
        ...persisted.notifications
      });
      this._configureNotificationChannels();
    }
  }

  _extractPersistableConfig() {
    return {
      thresholds: this.config.thresholds,
      cooldown: this.config.cooldown,
      cooldowns: this.config.cooldowns,
      notifications: this.config.notifications
    };
  }

  async _writeJsonFile(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  async _readJsonFile(filePath, defaultValue) {
    try {
      const buffer = await fs.readFile(filePath, 'utf8');
      return JSON.parse(buffer);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return defaultValue;
      }
      throw error;
    }
  }

  _getCooldownForType(type) {
    const perType = this.config.cooldowns?.byType?.[type];
    return perType || this.config.cooldowns?.default || this.config.cooldown;
  }

  _generateAlertSignature(type, severity, data) {
    const normalizedData = data ? JSON.stringify(this._sortObjectKeys(data)) : '';
    return `${type}:${severity}:${normalizedData}`;
  }

  _sortObjectKeys(value) {
    if (Array.isArray(value)) {
      return value.map(item => this._sortObjectKeys(item));
    }

    if (value && typeof value === 'object') {
      return Object.keys(value)
        .sort()
        .reduce((acc, key) => {
          acc[key] = this._sortObjectKeys(value[key]);
          return acc;
        }, {});
    }

    return value;
  }

  /**
   * Process pipeline run data and check for alert conditions
   */
  async checkAlerts(pipelineRun) {
    await this._ensureInitialized();
    const alerts = [];

    if (!pipelineRun) {
      return alerts;
    }

    if (pipelineRun.success === false) {
      alerts.push(await this.createAlert('pipeline_failure', 'high', {
        runId: pipelineRun.id,
        trigger: pipelineRun.trigger,
        error: pipelineRun.errors?.[0] || 'Unknown error',
        duration: pipelineRun.duration
      }));
    }

    if (pipelineRun.duration > this.config.thresholds.responseTime) {
      alerts.push(await this.createAlert('slow_pipeline', 'medium', {
        runId: pipelineRun.id,
        duration: pipelineRun.duration,
        threshold: this.config.thresholds.responseTime
      }));
    }

    for (const stage of pipelineRun.stages || []) {
      if (stage.status === 'failed') {
        alerts.push(await this.createAlert('stage_failure', 'high', {
          runId: pipelineRun.id,
          stage: stage.name,
          error: stage.errors?.[0] || 'Stage failed',
          duration: stage.duration
        }));
      }

      if (stage.name === 'build_process' && stage.duration > this.config.thresholds.buildTime) {
        alerts.push(await this.createAlert('slow_build', 'medium', {
          runId: pipelineRun.id,
          duration: stage.duration,
          threshold: this.config.thresholds.buildTime
        }));
      }
    }

    for (const alert of alerts) {
      await this.processAlert(alert);
    }

    return alerts;
  }

  /**
   * Check webhook-specific alert conditions
   */
  async checkWebhookAlerts(webhookRecord) {
    await this._ensureInitialized();
    const alerts = [];

    if (!webhookRecord) {
      return alerts;
    }

    if (webhookRecord.timing) {
      const processed = new Date(webhookRecord.timing.processed || 0);
      const sent = new Date(webhookRecord.timing.sent || 0);
      if (processed > sent) {
        const duration = processed - sent;
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
    }

    if (webhookRecord.authentication && !webhookRecord.authentication.success) {
      alerts.push(await this.createAlert('webhook_auth_failure', 'high', {
        webhookId: webhookRecord.id,
        runId: webhookRecord.runId,
        source: webhookRecord.source,
        error: webhookRecord.authentication.errors?.[0] || 'Authentication failed'
      }));
    }

    if (webhookRecord.response && webhookRecord.response.status >= 400) {
      alerts.push(await this.createAlert('webhook_error', 'high', {
        webhookId: webhookRecord.id,
        runId: webhookRecord.runId,
        source: webhookRecord.source,
        status: webhookRecord.response.status,
        error: webhookRecord.response.body
      }));
    }

    for (const alert of alerts) {
      await this.processAlert(alert);
    }

    return alerts;
  }

  /**
   * Create an alert object
   */
  async createAlert(type, severity, data) {
    await this._ensureInitialized();

    return {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      severity,
      timestamp: new Date().toISOString(),
      data,
      status: 'active',
      acknowledged: false,
      acknowledgedBy: null,
      acknowledgedAt: null,
      resolvedAt: null,
      resolvedBy: null,
      occurrences: 0
    };
  }

  /**
   * Process an alert (apply deduplication, cooldown, dispatch notifications)
   */
  async processAlert(alert) {
    await this._ensureInitialized();

    const signature = this._generateAlertSignature(alert.type, alert.severity, alert.data);
    const now = Date.now();
    const cooldown = this._getCooldownForType(alert.type);
    const lastAlertTime = this.lastAlertTimes.get(signature);

    if (lastAlertTime && (now - lastAlertTime) < cooldown) {
      this.metrics.suppressedAlerts++;
      return null;
    }

    if (this.activeAlertSignatures.has(signature)) {
      const existingAlertId = this.activeAlertSignatures.get(signature);
      const existingAlert = this.activeAlerts.get(existingAlertId);

      if (existingAlert && existingAlert.status === 'active') {
        existingAlert.occurrences = (existingAlert.occurrences || 1) + 1;
        existingAlert.lastOccurrence = new Date().toISOString();
        this.metrics.deduplicatedAlerts++;
        this.lastAlertTimes.set(signature, now);
        return existingAlert;
      }
    }

    alert.signature = signature;
    alert.occurrences = 1;
    alert.message = this.formatAlertMessage(alert);

    this.metrics.totalAlerts++;
    this.metrics.alertsByType[alert.type] = (this.metrics.alertsByType[alert.type] || 0) + 1;
    this.metrics.alertsBySeverity[alert.severity] = (this.metrics.alertsBySeverity[alert.severity] || 0) + 1;

    this.activeAlerts.set(alert.id, alert);
    this.alertHistory.push(alert);
    this.lastAlertTimes.set(signature, now);
    this.activeAlertSignatures.set(signature, alert.id);

    await this.notificationManager.sendToAll(alert);

    this.emit('alert', alert);
    this.emit('alert_generated', alert);

    return alert;
  }

  async _persistConfiguration() {
    try {
      await this._writeJsonFile(this.thresholdsFile, this._extractPersistableConfig());
    } catch (error) {
      console.error('Failed to persist alert configuration:', error.message);
    }
  }

  async _persistAlertState() {
    try {
      await this._writeJsonFile(this.stateFile, this._persistedState);
    } catch (error) {
      console.error('Failed to persist alert state:', error.message);
    }
  }

  async sendNotifications(alert, eventType = 'alert_generated') {
    await this.notificationManager.sendToAll(alert, null, eventType);
  }

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

  async acknowledgeAlert(alertId, acknowledgedBy = 'system') {
    await this._ensureInitialized();
    const alert = this.activeAlerts.get(alertId) || this.alertHistory.find(a => a.id === alertId);

    if (alert && alert.status === 'active') {
      alert.acknowledged = true;
      alert.acknowledgedBy = acknowledgedBy;
      alert.acknowledgedAt = new Date().toISOString();

      this._persistedState.acknowledged[alertId] = {
        acknowledgedBy,
        acknowledgedAt: alert.acknowledgedAt
      };

      await this._persistAlertState();
      await this.sendNotifications(alert, 'alert_acknowledged');

      this.emit('alert_acknowledged', alert);
      return alert;
    }

    return null;
  }

  async resolveAlert(alertId, resolvedBy = 'system') {
    await this._ensureInitialized();
    const alert = this.activeAlerts.get(alertId) || this.alertHistory.find(a => a.id === alertId);

    if (alert && alert.status !== 'resolved') {
      alert.status = 'resolved';
      alert.resolvedBy = resolvedBy;
      alert.resolvedAt = new Date().toISOString();

      this.activeAlerts.delete(alertId);
      if (alert.signature) {
        this.activeAlertSignatures.delete(alert.signature);
      }

      this._persistedState.resolved[alertId] = {
        resolvedBy,
        resolvedAt: alert.resolvedAt
      };

      await this._persistAlertState();
      await this.sendNotifications(alert, 'alert_resolved');

      this.emit('alert_resolved', alert);
      return alert;
    }

    return null;
  }

  getActiveAlerts() {
    return Array.from(this.activeAlerts.values());
  }

  getAlertHistory(limit = 100) {
    return this.alertHistory.slice(-limit);
  }

  getMetrics() {
    return {
      ...this.metrics,
      activeAlertCount: this.activeAlerts.size,
      totalHistoryCount: this.alertHistory.length
    };
  }

  async updateThresholds(newThresholds) {
    await this._ensureInitialized();
    this.config.thresholds = {
      ...this.config.thresholds,
      ...newThresholds
    };

    await this._persistConfiguration();
    this.emit('thresholds_updated', this.config.thresholds);
  }

  async updateNotificationSettings(newSettings) {
    await this._ensureInitialized();

    const normalized = this._normalizeNotificationConfig({
      ...this.config.notifications,
      ...newSettings
    });

    this.config.notifications = normalized;
    this._configureNotificationChannels();

    await this._persistConfiguration();
    this.emit('notifications_updated', this.config.notifications);
  }

  async updateCooldowns(cooldowns = {}) {
    await this._ensureInitialized();

    this.config.cooldowns = {
      default: cooldowns.default || this.config.cooldowns.default,
      byType: {
        ...this.config.cooldowns.byType,
        ...(cooldowns.byType || {})
      }
    };

    this.config.cooldown = this.config.cooldowns.default;

    await this._persistConfiguration();
    this.emit('cooldowns_updated', this.config.cooldowns);
  }

  clearOldAlerts(maxAge = 7 * 24 * 60 * 60 * 1000) {
    const cutoff = new Date(Date.now() - maxAge);
    this.alertHistory = this.alertHistory.filter(alert => new Date(alert.timestamp) > cutoff);
  }

  exportConfig() {
    return this._extractPersistableConfig();
  }

  async importConfig(config) {
    await this._ensureInitialized();

    if (config.thresholds) {
      this.config.thresholds = {
        ...this.config.thresholds,
        ...config.thresholds
      };
    }

    if (config.cooldowns) {
      await this.updateCooldowns(config.cooldowns);
    }

    if (config.notifications) {
      await this.updateNotificationSettings(config.notifications);
    } else {
      await this._persistConfiguration();
    }

    this.emit('config_updated', this.config);
  }

  setWebSocketHandler(handler) {
    const dashboardChannel = this.notificationManager.getChannel('dashboard');
    if (dashboardChannel && typeof dashboardChannel.setWebSocketHandler === 'function') {
      dashboardChannel.setWebSocketHandler(handler);
    }
  }
}

module.exports = AlertManager;
