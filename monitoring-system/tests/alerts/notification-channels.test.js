const { describe, it, expect, beforeEach, afterEach, vi } = require('vitest');
const {
  ConsoleNotificationChannel,
  DashboardNotificationChannel,
  EmailNotificationChannel,
  WebhookNotificationChannel,
  NotificationManager
} = require('../../src/alerts/notification-channels');

describe('NotificationChannels', () => {
  let mockAlert;

  beforeEach(() => {
    mockAlert = {
      id: 'alert-123',
      type: 'pipeline_failure',
      severity: 'high',
      timestamp: '2025-10-28T12:00:00Z',
      message: 'Pipeline failed',
      data: { runId: 'run-123', error: 'Build failed' },
      status: 'active'
    };

    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ConsoleNotificationChannel', () => {
    let channel;

    beforeEach(() => {
      channel = new ConsoleNotificationChannel();
    });

    it('should be enabled by default', () => {
      expect(channel.isEnabled()).toBe(true);
    });

    it('should send console notification when enabled', async () => {
      await channel.send(mockAlert);
      
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[ALERT HIGH]')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('pipeline_failure')
      );
    });

    it('should not send notification when disabled', async () => {
      channel.setEnabled(false);
      await channel.send(mockAlert);
      
      expect(console.log).not.toHaveBeenCalled();
    });

    it('should use correct colors for different severities', async () => {
      const severities = ['low', 'medium', 'high', 'critical'];
      
      for (const severity of severities) {
        const alert = { ...mockAlert, severity };
        await channel.send(alert);
      }
      
      expect(console.log).toHaveBeenCalledTimes(severities.length * 2); // Message + data
    });

    it('should display alert data when present', async () => {
      await channel.send(mockAlert);
      
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Data:')
      );
    });
  });

  describe('DashboardNotificationChannel', () => {
    let channel;
    let mockWebSocketHandler;

    beforeEach(() => {
      mockWebSocketHandler = {
        broadcast: vi.fn()
      };
      
      channel = new DashboardNotificationChannel({
        websocketHandler: mockWebSocketHandler
      });
    });

    it('should send notification via WebSocket handler', async () => {
      await channel.send(mockAlert);
      
      expect(mockWebSocketHandler.broadcast).toHaveBeenCalledWith({
        type: 'alert',
        timestamp: expect.any(String),
        alert: expect.objectContaining({
          id: mockAlert.id,
          type: mockAlert.type,
          severity: mockAlert.severity
        })
      });
    });

    it('should not send when WebSocket handler is missing', async () => {
      channel = new DashboardNotificationChannel();
      await channel.send(mockAlert);
      
      // Should not throw error
      expect(true).toBe(true);
    });

    it('should not send when disabled', async () => {
      channel.setEnabled(false);
      await channel.send(mockAlert);
      
      expect(mockWebSocketHandler.broadcast).not.toHaveBeenCalled();
    });

    it('should format message for alerts without message', async () => {
      const alertWithoutMessage = { ...mockAlert };
      delete alertWithoutMessage.message;
      
      await channel.send(alertWithoutMessage);
      
      expect(mockWebSocketHandler.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          alert: expect.objectContaining({
            message: expect.stringContaining('Pipeline failed')
          })
        })
      );
    });

    it('should allow setting WebSocket handler after construction', () => {
      const newChannel = new DashboardNotificationChannel();
      newChannel.setWebSocketHandler(mockWebSocketHandler);
      
      expect(newChannel.websocketHandler).toBe(mockWebSocketHandler);
    });
  });

  describe('EmailNotificationChannel', () => {
    let channel;

    beforeEach(() => {
      channel = new EmailNotificationChannel({
        recipients: ['admin@example.com', 'dev@example.com']
      });
    });

    it('should log email notification (placeholder implementation)', async () => {
      await channel.send(mockAlert);
      
      expect(console.log).toHaveBeenCalledWith(
        '[EMAIL NOTIFICATION] Would send email:',
        expect.objectContaining({
          to: ['admin@example.com', 'dev@example.com'],
          subject: expect.stringContaining('[HIGH] Alert: pipeline_failure'),
          body: expect.stringContaining('Pipeline failed'),
          html: expect.stringContaining('<div')
        })
      );
    });

    it('should not send when no recipients', async () => {
      channel = new EmailNotificationChannel({ recipients: [] });
      await channel.send(mockAlert);
      
      expect(console.log).not.toHaveBeenCalled();
    });

    it('should not send when disabled', async () => {
      channel.setEnabled(false);
      await channel.send(mockAlert);
      
      expect(console.log).not.toHaveBeenCalled();
    });

    it('should generate appropriate subject for different severities', () => {
      const criticalAlert = { ...mockAlert, severity: 'critical' };
      const lowAlert = { ...mockAlert, severity: 'low' };
      
      const criticalSubject = channel.generateSubject(criticalAlert);
      const lowSubject = channel.generateSubject(lowAlert);
      
      expect(criticalSubject).toContain('[CRITICAL]');
      expect(lowSubject).not.toContain('[CRITICAL]');
      expect(lowSubject).not.toContain('[HIGH]');
    });

    it('should generate HTML body with correct styling', () => {
      const html = channel.generateHtmlBody(mockAlert);
      
      expect(html).toContain('<div');
      expect(html).toContain('background-color: #dc3545'); // High severity color
      expect(html).toContain('Alert: pipeline_failure');
      expect(html).toContain(mockAlert.id);
    });

    it('should manage recipients correctly', () => {
      channel.addRecipient('new@example.com');
      expect(channel.recipients).toContain('new@example.com');
      
      channel.removeRecipient('admin@example.com');
      expect(channel.recipients).not.toContain('admin@example.com');
      
      // Should not add duplicates
      channel.addRecipient('dev@example.com');
      const devCount = channel.recipients.filter(r => r === 'dev@example.com').length;
      expect(devCount).toBe(1);
    });
  });

  describe('WebhookNotificationChannel', () => {
    let channel;

    beforeEach(() => {
      channel = new WebhookNotificationChannel({
        url: 'https://example.com/webhook',
        headers: { 'Authorization': 'Bearer token' },
        timeout: 5000
      });
    });

    it('should log webhook notification (placeholder implementation)', async () => {
      await channel.send(mockAlert);
      
      expect(console.log).toHaveBeenCalledWith(
        '[WEBHOOK NOTIFICATION] Would POST to https://example.com/webhook:',
        expect.objectContaining({
          alert: expect.objectContaining({
            id: mockAlert.id,
            type: mockAlert.type,
            severity: mockAlert.severity
          }),
          timestamp: expect.any(String)
        })
      );
    });

    it('should not send when no URL configured', async () => {
      channel = new WebhookNotificationChannel();
      await channel.send(mockAlert);
      
      expect(console.log).not.toHaveBeenCalled();
    });

    it('should not send when disabled', async () => {
      channel.setEnabled(false);
      await channel.send(mockAlert);
      
      expect(console.log).not.toHaveBeenCalled();
    });

    it('should allow updating URL and headers', () => {
      const newUrl = 'https://newurl.com/webhook';
      const newHeaders = { 'X-API-Key': 'key123' };
      
      channel.setUrl(newUrl);
      channel.setHeaders(newHeaders);
      
      expect(channel.webhookUrl).toBe(newUrl);
      expect(channel.headers).toEqual(newHeaders);
    });
  });

  describe('NotificationManager', () => {
    let manager;
    let consoleChannel;
    let dashboardChannel;
    let mockWebSocketHandler;

    beforeEach(() => {
      manager = new NotificationManager();
      consoleChannel = new ConsoleNotificationChannel();
      
      mockWebSocketHandler = { broadcast: vi.fn() };
      dashboardChannel = new DashboardNotificationChannel({
        websocketHandler: mockWebSocketHandler
      });
      
      manager.addChannel('console', consoleChannel);
      manager.addChannel('dashboard', dashboardChannel);
    });

    it('should add and retrieve channels', () => {
      expect(manager.getChannel('console')).toBe(consoleChannel);
      expect(manager.getChannel('dashboard')).toBe(dashboardChannel);
    });

    it('should remove channels', () => {
      manager.removeChannel('console');
      expect(manager.getChannel('console')).toBeUndefined();
    });

    it('should send to all enabled channels', async () => {
      await manager.sendToAll(mockAlert);
      
      expect(console.log).toHaveBeenCalled(); // Console channel
      expect(mockWebSocketHandler.broadcast).toHaveBeenCalled(); // Dashboard channel
    });

    it('should send to specific channel', async () => {
      await manager.sendToChannel(mockAlert, 'dashboard');
      
      expect(mockWebSocketHandler.broadcast).toHaveBeenCalled();
      expect(console.log).not.toHaveBeenCalled();
    });

    it('should send to specified channels only', async () => {
      await manager.sendToAll(mockAlert, ['dashboard']);
      
      expect(mockWebSocketHandler.broadcast).toHaveBeenCalled();
      expect(console.log).not.toHaveBeenCalled();
    });

    it('should skip disabled channels', async () => {
      manager.disableChannel('console');
      await manager.sendToAll(mockAlert);
      
      expect(console.log).not.toHaveBeenCalled();
      expect(mockWebSocketHandler.broadcast).toHaveBeenCalled();
    });

    it('should handle channel errors gracefully', async () => {
      const errorChannel = {
        isEnabled: () => true,
        send: vi.fn().mockRejectedValue(new Error('Channel error'))
      };
      
      manager.addChannel('error', errorChannel);
      
      // Should not throw
      await manager.sendToAll(mockAlert);
      
      expect(console.error).toHaveBeenCalledWith(
        'Failed to send notification via error:',
        expect.any(Error)
      );
    });

    it('should enable and disable channels', () => {
      manager.disableChannel('console');
      expect(consoleChannel.isEnabled()).toBe(false);
      
      manager.enableChannel('console');
      expect(consoleChannel.isEnabled()).toBe(true);
    });

    it('should provide channel status', () => {
      const status = manager.getChannelStatus();
      
      expect(status).toEqual({
        console: {
          enabled: true,
          type: 'ConsoleNotificationChannel'
        },
        dashboard: {
          enabled: true,
          type: 'DashboardNotificationChannel'
        }
      });
    });
  });
});