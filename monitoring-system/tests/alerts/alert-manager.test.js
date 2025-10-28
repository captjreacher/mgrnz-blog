import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import AlertManager from '../../src/alerts/alert-manager.js';

describe('AlertManager', () => {
  let alertManager;
  let mockConfig;
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'alert-manager-test-'));

    mockConfig = {
      thresholds: {
        errorRate: 0.1,
        responseTime: 5000,
        failureCount: 3,
        webhookTimeout: 30000,
        buildTime: 600000
      },
      notifications: {
        console: true,
        dashboard: true,
        email: false
      },
      cooldown: 300000,
      configDir: tempDir
    };

    alertManager = new AlertManager(mockConfig);
    await alertManager.persistenceReady;

    // Mock console.log to avoid test output noise
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  describe('constructor', () => {
    it('should initialize with default config when no config provided', () => {
      const manager = new AlertManager();
      expect(manager.config).toBeDefined();
      expect(manager.config.thresholds).toBeDefined();
      expect(manager.config.notifications).toBeDefined();
    });

    it('should merge provided config with defaults', () => {
      const customConfig = { thresholds: { errorRate: 0.2 } };
      const manager = new AlertManager(customConfig);

      expect(manager.config.thresholds.errorRate).toBe(0.2);
      expect(manager.config.notifications.dashboard).toBe(true);
    });

    it('should initialize empty collections', () => {
      expect(alertManager.activeAlerts.size).toBe(0);
      expect(alertManager.alertHistory).toEqual([]);
      expect(alertManager.lastAlertTimes.size).toBe(0);
    });
  });

  describe('checkAlerts', () => {
    it('should create pipeline failure alert for failed pipeline run', async () => {
      const pipelineRun = {
        id: 'test-run-1',
        success: false,
        duration: 3000,
        trigger: { type: 'webhook', source: 'mailerlite' },
        errors: ['Build failed'],
        stages: []
      };

      const alerts = await alertManager.checkAlerts(pipelineRun);
      
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('pipeline_failure');
      expect(alerts[0].severity).toBe('high');
      expect(alerts[0].data.runId).toBe('test-run-1');
    });

    it('should create slow pipeline alert for long-running pipeline', async () => {
      const pipelineRun = {
        id: 'test-run-2',
        success: true,
        duration: 10000, // Exceeds 5000ms threshold
        trigger: { type: 'manual' },
        stages: []
      };

      const alerts = await alertManager.checkAlerts(pipelineRun);
      
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('slow_pipeline');
      expect(alerts[0].severity).toBe('medium');
      expect(alerts[0].data.duration).toBe(10000);
    });

    it('should create stage failure alert for failed stage', async () => {
      const pipelineRun = {
        id: 'test-run-3',
        success: true,
        duration: 3000,
        trigger: { type: 'git' },
        stages: [
          {
            name: 'webhook_processing',
            status: 'failed',
            duration: 1000,
            errors: ['Webhook validation failed']
          }
        ]
      };

      const alerts = await alertManager.checkAlerts(pipelineRun);
      
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('stage_failure');
      expect(alerts[0].data.stage).toBe('webhook_processing');
    });

    it('should create slow build alert for long build process', async () => {
      const pipelineRun = {
        id: 'test-run-4',
        success: true,
        duration: 3000,
        trigger: { type: 'git' },
        stages: [
          {
            name: 'build_process',
            status: 'completed',
            duration: 700000, // Exceeds 600000ms threshold
            errors: []
          }
        ]
      };

      const alerts = await alertManager.checkAlerts(pipelineRun);
      
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('slow_build');
      expect(alerts[0].data.duration).toBe(700000);
    });

    it('should create multiple alerts for multiple issues', async () => {
      const pipelineRun = {
        id: 'test-run-5',
        success: false,
        duration: 10000, // Slow
        trigger: { type: 'webhook' },
        errors: ['Multiple failures'],
        stages: [
          {
            name: 'webhook_processing',
            status: 'failed',
            duration: 1000,
            errors: ['Stage failed']
          }
        ]
      };

      const alerts = await alertManager.checkAlerts(pipelineRun);
      
      expect(alerts).toHaveLength(3); // pipeline_failure, slow_pipeline, stage_failure
      expect(alerts.map(a => a.type)).toContain('pipeline_failure');
      expect(alerts.map(a => a.type)).toContain('slow_pipeline');
      expect(alerts.map(a => a.type)).toContain('stage_failure');
    });
  });

  describe('checkWebhookAlerts', () => {
    it('should create webhook timeout alert', async () => {
      const webhookRecord = {
        id: 'webhook-1',
        runId: 'run-1',
        source: 'mailerlite',
        timing: {
          sent: '2025-10-28T12:00:00Z',
          processed: '2025-10-28T12:01:00Z' // 60 seconds, exceeds 30s threshold
        },
        authentication: { success: true },
        response: { status: 200 }
      };

      const alerts = await alertManager.checkWebhookAlerts(webhookRecord);
      
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('webhook_timeout');
      expect(alerts[0].severity).toBe('medium');
    });

    it('should create webhook auth failure alert', async () => {
      const webhookRecord = {
        id: 'webhook-2',
        runId: 'run-2',
        source: 'mailerlite',
        timing: {
          sent: '2025-10-28T12:00:00Z',
          processed: '2025-10-28T12:00:05Z'
        },
        authentication: {
          success: false,
          errors: ['Invalid token']
        },
        response: { status: 401 }
      };

      const alerts = await alertManager.checkWebhookAlerts(webhookRecord);
      
      expect(alerts).toHaveLength(2); // auth failure + error response
      expect(alerts.map(a => a.type)).toContain('webhook_auth_failure');
      expect(alerts.map(a => a.type)).toContain('webhook_error');
    });

    it('should create webhook error alert for HTTP errors', async () => {
      const webhookRecord = {
        id: 'webhook-3',
        runId: 'run-3',
        source: 'supabase',
        timing: {
          sent: '2025-10-28T12:00:00Z',
          processed: '2025-10-28T12:00:02Z'
        },
        authentication: { success: true },
        response: {
          status: 500,
          body: 'Internal server error'
        }
      };

      const alerts = await alertManager.checkWebhookAlerts(webhookRecord);
      
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('webhook_error');
      expect(alerts[0].data.status).toBe(500);
    });
  });

  describe('processAlert', () => {
    it('should respect cooldown period', async () => {
      const alert1 = await alertManager.createAlert('test_alert', 'medium', { test: 'data' });
      const alert2 = await alertManager.createAlert('test_alert', 'medium', { test: 'data' });

      await alertManager.processAlert(alert1);
      await alertManager.processAlert(alert2); // Should be skipped due to cooldown

      expect(alertManager.activeAlerts.size).toBe(1);
      expect(alertManager.metrics.totalAlerts).toBe(1);
    });

    it('should update metrics correctly', async () => {
      const alert = await alertManager.createAlert('test_alert', 'high', {});
      await alertManager.processAlert(alert);

      expect(alertManager.metrics.totalAlerts).toBe(1);
      expect(alertManager.metrics.alertsByType.test_alert).toBe(1);
      expect(alertManager.metrics.alertsBySeverity.high).toBe(1);
    });

    it('should emit alert event', async () => {
      const alertEventSpy = vi.fn();
      alertManager.on('alert', alertEventSpy);

      const alert = await alertManager.createAlert('test_alert', 'medium', {});
      await alertManager.processAlert(alert);

      expect(alertEventSpy).toHaveBeenCalledWith(alert);
    });
  });

  describe('acknowledgeAlert', () => {
    it('should acknowledge active alert', async () => {
      const alert = await alertManager.createAlert('test_alert', 'medium', {});
      await alertManager.processAlert(alert);

      const acknowledged = await alertManager.acknowledgeAlert(alert.id, 'test-user');

      expect(acknowledged).toBeTruthy();
      expect(acknowledged.acknowledged).toBe(true);
      expect(acknowledged.acknowledgedBy).toBe('test-user');
      expect(acknowledged.acknowledgedAt).toBeDefined();
    });

    it('should return null for non-existent alert', async () => {
      const result = await alertManager.acknowledgeAlert('non-existent');
      expect(result).toBeNull();
    });

    it('should emit alert_acknowledged event', async () => {
      const acknowledgedEventSpy = vi.fn();
      alertManager.on('alert_acknowledged', acknowledgedEventSpy);

      const alert = await alertManager.createAlert('test_alert', 'medium', {});
      await alertManager.processAlert(alert);
      await alertManager.acknowledgeAlert(alert.id);

      expect(acknowledgedEventSpy).toHaveBeenCalled();
    });
  });

  describe('resolveAlert', () => {
    it('should resolve active alert', async () => {
      const alert = await alertManager.createAlert('test_alert', 'medium', {});
      await alertManager.processAlert(alert);

      const resolved = await alertManager.resolveAlert(alert.id, 'test-user');

      expect(resolved).toBeTruthy();
      expect(resolved.status).toBe('resolved');
      expect(resolved.resolvedBy).toBe('test-user');
      expect(resolved.resolvedAt).toBeDefined();
      expect(alertManager.activeAlerts.has(alert.id)).toBe(false);
    });

    it('should emit alert_resolved event', async () => {
      const resolvedEventSpy = vi.fn();
      alertManager.on('alert_resolved', resolvedEventSpy);

      const alert = await alertManager.createAlert('test_alert', 'medium', {});
      await alertManager.processAlert(alert);
      await alertManager.resolveAlert(alert.id);

      expect(resolvedEventSpy).toHaveBeenCalled();
    });
  });

  describe('getActiveAlerts', () => {
    it('should return all active alerts', async () => {
      const alert1 = await alertManager.createAlert('test_alert_1', 'medium', {});
      const alert2 = await alertManager.createAlert('test_alert_2', 'high', {});
      
      await alertManager.processAlert(alert1);
      await alertManager.processAlert(alert2);

      const activeAlerts = alertManager.getActiveAlerts();
      expect(activeAlerts).toHaveLength(2);
      expect(activeAlerts.map(a => a.id)).toContain(alert1.id);
      expect(activeAlerts.map(a => a.id)).toContain(alert2.id);
    });

    it('should not include resolved alerts', async () => {
      const alert = await alertManager.createAlert('test_alert', 'medium', {});
      await alertManager.processAlert(alert);
      await alertManager.resolveAlert(alert.id);

      const activeAlerts = alertManager.getActiveAlerts();
      expect(activeAlerts).toHaveLength(0);
    });
  });

  describe('updateThresholds', () => {
    it('should update thresholds and emit event', () => {
      const thresholdsUpdatedSpy = vi.fn();
      alertManager.on('thresholds_updated', thresholdsUpdatedSpy);

      const newThresholds = { errorRate: 0.2, responseTime: 8000 };
      alertManager.updateThresholds(newThresholds);

      expect(alertManager.config.thresholds.errorRate).toBe(0.2);
      expect(alertManager.config.thresholds.responseTime).toBe(8000);
      expect(alertManager.config.thresholds.buildTime).toBe(600000); // Unchanged
      expect(thresholdsUpdatedSpy).toHaveBeenCalledWith(alertManager.config.thresholds);
    });
  });

  describe('clearOldAlerts', () => {
    it('should remove alerts older than specified age', async () => {
      // Create old alert
      const oldAlert = await alertManager.createAlert('old_alert', 'medium', {});
      oldAlert.timestamp = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(); // 8 days ago
      alertManager.alertHistory.push(oldAlert);

      // Create recent alert
      const recentAlert = await alertManager.createAlert('recent_alert', 'medium', {});
      await alertManager.processAlert(recentAlert);

      alertManager.clearOldAlerts(7 * 24 * 60 * 60 * 1000); // 7 days

      expect(alertManager.alertHistory).toHaveLength(1);
      expect(alertManager.alertHistory[0].type).toBe('recent_alert');
    });
  });

  describe('notification routing', () => {
    let alert;

    beforeEach(() => {
      alert = {
        id: 'alert_test',
        type: 'pipeline_failure',
        severity: 'high',
        timestamp: new Date().toISOString(),
        data: { runId: 'run-123', error: 'Failure' },
        status: 'active',
        acknowledged: false,
        resolvedAt: null
      };

      vi.spyOn(alertManager, 'sendConsoleNotification').mockResolvedValue();
      vi.spyOn(alertManager, 'sendDashboardNotification').mockResolvedValue();
      vi.spyOn(alertManager, 'sendEmailNotification').mockResolvedValue();
    });

    it('should route alerts to enabled channels only', async () => {
      await alertManager.sendNotifications(alert);

      expect(alertManager.sendConsoleNotification).toHaveBeenCalledWith(alert);
      expect(alertManager.sendDashboardNotification).toHaveBeenCalledWith(alert);
      expect(alertManager.sendEmailNotification).not.toHaveBeenCalled();
    });

    it('should respect runtime notification configuration updates', async () => {
      alertManager.updateNotificationSettings({ console: false, email: true });

      await alertManager.sendNotifications(alert);

      expect(alertManager.sendConsoleNotification).not.toHaveBeenCalled();
      expect(alertManager.sendDashboardNotification).toHaveBeenCalledWith(alert);
      expect(alertManager.sendEmailNotification).toHaveBeenCalledWith(alert);
    });
  });

  describe('formatAlertMessage', () => {
    it('should format pipeline failure message', () => {
      const alert = {
        type: 'pipeline_failure',
        data: { runId: 'run-123', error: 'Build failed' }
      };

      const message = alertManager.formatAlertMessage(alert);
      expect(message).toBe('Pipeline run run-123 failed: Build failed');
    });

    it('should format slow pipeline message', () => {
      const alert = {
        type: 'slow_pipeline',
        data: { runId: 'run-123', duration: 8000, threshold: 5000 }
      };

      const message = alertManager.formatAlertMessage(alert);
      expect(message).toBe('Pipeline run run-123 took 8000ms (threshold: 5000ms)');
    });

    it('should handle unknown alert types', () => {
      const alert = { type: 'unknown_alert', data: {} };
      const message = alertManager.formatAlertMessage(alert);
      expect(message).toBe('Alert: unknown_alert');
    });
  });

  describe('deduplication and cooldowns', () => {
    it('should deduplicate repeated alerts while tracking occurrences', async () => {
      const pipelineRun = {
        id: 'run-1',
        success: false,
        duration: 1000,
        trigger: { type: 'webhook', source: 'mailerlite' },
        errors: ['Build failed'],
        stages: []
      };

      await alertManager.checkAlerts(pipelineRun);

      const firstActive = alertManager.getActiveAlerts();
      expect(firstActive).toHaveLength(1);
      expect(firstActive[0].occurrences).toBe(1);

      await alertManager.checkAlerts(pipelineRun);

      const metrics = alertManager.getMetrics();
      expect(metrics.deduplicatedAlerts).toBe(1);

      const active = alertManager.getActiveAlerts();
      expect(active).toHaveLength(1);
      expect(active[0].occurrences).toBe(2);
    });
  });

  describe('acknowledgement and resolution', () => {
    it('should persist acknowledgement and resolution metadata', async () => {
      const pipelineRun = {
        id: 'run-ack',
        success: false,
        duration: 1000,
        trigger: { type: 'manual' },
        errors: ['Failed'],
        stages: []
      };

      const [alert] = await alertManager.checkAlerts(pipelineRun);

      const acknowledged = await alertManager.acknowledgeAlert(alert.id, 'tester');
      expect(acknowledged.acknowledged).toBe(true);
      expect(acknowledged.acknowledgedBy).toBe('tester');

      const resolved = await alertManager.resolveAlert(alert.id, 'tester');
      expect(resolved.status).toBe('resolved');
      expect(resolved.resolvedBy).toBe('tester');

      const activeAlerts = alertManager.getActiveAlerts();
      expect(activeAlerts).toHaveLength(0);

      const persistedState = JSON.parse(await fs.readFile(path.join(tempDir, 'alert-state.json'), 'utf8'));
      expect(persistedState.acknowledged[alert.id].acknowledgedBy).toBe('tester');
      expect(persistedState.resolved[alert.id].resolvedBy).toBe('tester');
    });
  });

  describe('persistent thresholds', () => {
    it('should save updated thresholds to disk', async () => {
      await alertManager.updateThresholds({ responseTime: 7500 });

      const persistedConfig = JSON.parse(await fs.readFile(path.join(tempDir, 'alert-thresholds.json'), 'utf8'));
      expect(persistedConfig.thresholds.responseTime).toBe(7500);
    });
  });
});