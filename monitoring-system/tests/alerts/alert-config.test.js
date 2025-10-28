const { describe, it, expect, beforeEach, afterEach, vi } = require('vitest');
const fs = require('fs').promises;
const path = require('path');
const AlertConfig = require('../../src/alerts/alert-config');

// Mock fs module
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn()
  }
}));

describe('AlertConfig', () => {
  let alertConfig;
  let mockConfigPath;

  beforeEach(() => {
    mockConfigPath = '/test/config/alert-config.json';
    alertConfig = new AlertConfig(mockConfigPath);
    
    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default config path when none provided', () => {
      const config = new AlertConfig();
      expect(config.configPath).toContain('alert-config.json');
    });

    it('should use provided config path', () => {
      expect(alertConfig.configPath).toBe(mockConfigPath);
    });

    it('should initialize with default configuration', () => {
      expect(alertConfig.config).toBeDefined();
      expect(alertConfig.config.thresholds).toBeDefined();
      expect(alertConfig.config.notifications).toBeDefined();
      expect(alertConfig.config.alertRules).toBeDefined();
      expect(alertConfig.config.alertTypes).toBeDefined();
    });
  });

  describe('getDefaultConfig', () => {
    it('should return complete default configuration', () => {
      const defaultConfig = alertConfig.getDefaultConfig();
      
      expect(defaultConfig.thresholds.errorRate).toBe(0.1);
      expect(defaultConfig.thresholds.responseTime).toBe(5000);
      expect(defaultConfig.notifications.console.enabled).toBe(true);
      expect(defaultConfig.alertTypes.pipeline_failure.enabled).toBe(true);
    });

    it('should include all required threshold values', () => {
      const defaultConfig = alertConfig.getDefaultConfig();
      const requiredThresholds = [
        'errorRate', 'responseTime', 'failureCount', 'webhookTimeout',
        'buildTime', 'deploymentTime', 'siteResponseTime'
      ];
      
      requiredThresholds.forEach(threshold => {
        expect(defaultConfig.thresholds[threshold]).toBeDefined();
        expect(typeof defaultConfig.thresholds[threshold]).toBe('number');
      });
    });

    it('should include all notification channels', () => {
      const defaultConfig = alertConfig.getDefaultConfig();
      const channels = ['console', 'dashboard', 'email', 'webhook'];
      
      channels.forEach(channel => {
        expect(defaultConfig.notifications[channel]).toBeDefined();
        expect(typeof defaultConfig.notifications[channel].enabled).toBe('boolean');
      });
    });
  });

  describe('loadConfig', () => {
    it('should load and merge configuration from file', async () => {
      const mockFileContent = JSON.stringify({
        thresholds: { errorRate: 0.2 },
        notifications: { console: { enabled: false } }
      });
      
      fs.readFile.mockResolvedValue(mockFileContent);
      
      const config = await alertConfig.loadConfig();
      
      expect(fs.readFile).toHaveBeenCalledWith(mockConfigPath, 'utf8');
      expect(config.thresholds.errorRate).toBe(0.2);
      expect(config.thresholds.responseTime).toBe(5000); // Default value preserved
      expect(config.notifications.console.enabled).toBe(false);
    });

    it('should create default config file when file does not exist', async () => {
      const error = new Error('File not found');
      error.code = 'ENOENT';
      fs.readFile.mockRejectedValue(error);
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
      
      const config = await alertConfig.loadConfig();
      
      expect(fs.writeFile).toHaveBeenCalled();
      expect(config).toEqual(alertConfig.getDefaultConfig());
    });

    it('should throw error for other file system errors', async () => {
      const error = new Error('Permission denied');
      error.code = 'EACCES';
      fs.readFile.mockRejectedValue(error);
      
      await expect(alertConfig.loadConfig()).rejects.toThrow('Failed to load alert configuration');
    });

    it('should handle invalid JSON gracefully', async () => {
      fs.readFile.mockResolvedValue('invalid json');
      
      await expect(alertConfig.loadConfig()).rejects.toThrow();
    });
  });

  describe('saveConfig', () => {
    it('should save configuration to file', async () => {
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
      
      await alertConfig.saveConfig();
      
      expect(fs.mkdir).toHaveBeenCalledWith(path.dirname(mockConfigPath), { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledWith(
        mockConfigPath,
        JSON.stringify(alertConfig.config, null, 2)
      );
    });

    it('should throw error when save fails', async () => {
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockRejectedValue(new Error('Write failed'));
      
      await expect(alertConfig.saveConfig()).rejects.toThrow('Failed to save alert configuration');
    });
  });

  describe('updateThresholds', () => {
    it('should update thresholds and save config', async () => {
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
      
      const newThresholds = { errorRate: 0.15, responseTime: 8000 };
      await alertConfig.updateThresholds(newThresholds);
      
      expect(alertConfig.config.thresholds.errorRate).toBe(0.15);
      expect(alertConfig.config.thresholds.responseTime).toBe(8000);
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should preserve existing thresholds not being updated', async () => {
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
      
      const originalBuildTime = alertConfig.config.thresholds.buildTime;
      await alertConfig.updateThresholds({ errorRate: 0.15 });
      
      expect(alertConfig.config.thresholds.buildTime).toBe(originalBuildTime);
    });
  });

  describe('updateNotificationSettings', () => {
    it('should update notification settings for valid channel', async () => {
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
      
      await alertConfig.updateNotificationSettings('email', {
        enabled: true,
        recipients: ['test@example.com']
      });
      
      expect(alertConfig.config.notifications.email.enabled).toBe(true);
      expect(alertConfig.config.notifications.email.recipients).toEqual(['test@example.com']);
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should not update settings for invalid channel', async () => {
      await alertConfig.updateNotificationSettings('invalid', { enabled: true });
      
      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('setAlertTypeEnabled', () => {
    it('should enable/disable alert type', async () => {
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
      
      await alertConfig.setAlertTypeEnabled('pipeline_failure', false);
      
      expect(alertConfig.config.alertTypes.pipeline_failure.enabled).toBe(false);
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should not update non-existent alert type', async () => {
      await alertConfig.setAlertTypeEnabled('non_existent', false);
      
      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('setAlertTypeSeverity', () => {
    it('should update alert type severity', async () => {
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
      
      await alertConfig.setAlertTypeSeverity('pipeline_failure', 'critical');
      
      expect(alertConfig.config.alertTypes.pipeline_failure.severity).toBe('critical');
      expect(fs.writeFile).toHaveBeenCalled();
    });
  });

  describe('getter methods', () => {
    it('should get threshold value', () => {
      const errorRate = alertConfig.getThreshold('errorRate');
      expect(errorRate).toBe(0.1);
    });

    it('should get notification settings', () => {
      const consoleSettings = alertConfig.getNotificationSettings('console');
      expect(consoleSettings.enabled).toBe(true);
    });

    it('should check if alert type is enabled', () => {
      expect(alertConfig.isAlertTypeEnabled('pipeline_failure')).toBe(true);
      expect(alertConfig.isAlertTypeEnabled('non_existent')).toBe(false);
    });

    it('should get alert type configuration', () => {
      const config = alertConfig.getAlertTypeConfig('pipeline_failure');
      expect(config.enabled).toBe(true);
      expect(config.severity).toBe('high');
    });
  });

  describe('validateConfig', () => {
    it('should return no errors for valid configuration', () => {
      const errors = alertConfig.validateConfig();
      expect(errors).toEqual([]);
    });

    it('should detect invalid threshold values', () => {
      alertConfig.config.thresholds.errorRate = -1;
      alertConfig.config.thresholds.responseTime = 'invalid';
      
      const errors = alertConfig.validateConfig();
      expect(errors).toHaveLength(2);
      expect(errors[0]).toContain('Invalid threshold value for errorRate');
      expect(errors[1]).toContain('Invalid threshold value for responseTime');
    });

    it('should detect invalid notification settings', () => {
      alertConfig.config.notifications.console.enabled = 'not_boolean';
      alertConfig.config.notifications.dashboard.severityFilter = 'not_array';
      
      const errors = alertConfig.validateConfig();
      expect(errors).toHaveLength(2);
      expect(errors[0]).toContain('Invalid enabled setting for console');
      expect(errors[1]).toContain('Invalid severityFilter for dashboard');
    });

    it('should detect invalid alert type severity', () => {
      alertConfig.config.alertTypes.pipeline_failure.severity = 'invalid';
      
      const errors = alertConfig.validateConfig();
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Invalid severity for pipeline_failure');
    });
  });

  describe('resetToDefaults', () => {
    it('should reset configuration to defaults', async () => {
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
      
      // Modify config
      alertConfig.config.thresholds.errorRate = 0.5;
      
      await alertConfig.resetToDefaults();
      
      expect(alertConfig.config.thresholds.errorRate).toBe(0.1);
      expect(fs.writeFile).toHaveBeenCalled();
    });
  });

  describe('exportConfig', () => {
    it('should export configuration as JSON string', () => {
      const exported = alertConfig.exportConfig();
      const parsed = JSON.parse(exported);
      
      expect(parsed).toEqual(alertConfig.config);
    });
  });

  describe('importConfig', () => {
    it('should import valid configuration', async () => {
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
      
      const importConfig = {
        thresholds: { errorRate: 0.3 },
        notifications: { console: { enabled: false } }
      };
      
      await alertConfig.importConfig(JSON.stringify(importConfig));
      
      expect(alertConfig.config.thresholds.errorRate).toBe(0.3);
      expect(alertConfig.config.notifications.console.enabled).toBe(false);
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should reject invalid JSON', async () => {
      await expect(alertConfig.importConfig('invalid json')).rejects.toThrow('Failed to import configuration');
    });

    it('should reject configuration that fails validation', async () => {
      const invalidConfig = {
        thresholds: { errorRate: -1 }
      };
      
      await expect(alertConfig.importConfig(JSON.stringify(invalidConfig))).rejects.toThrow('Configuration validation failed');
    });
  });

  describe('mergeWithDefaults', () => {
    it('should merge loaded config with defaults', () => {
      const loadedConfig = {
        thresholds: { errorRate: 0.2 },
        notifications: { console: { enabled: false } }
      };
      
      const merged = alertConfig.mergeWithDefaults(loadedConfig);
      
      expect(merged.thresholds.errorRate).toBe(0.2);
      expect(merged.thresholds.responseTime).toBe(5000); // Default preserved
      expect(merged.notifications.console.enabled).toBe(false);
      expect(merged.notifications.dashboard.enabled).toBe(true); // Default preserved
    });

    it('should handle missing sections gracefully', () => {
      const loadedConfig = {
        thresholds: { errorRate: 0.2 }
        // Missing notifications section
      };
      
      const merged = alertConfig.mergeWithDefaults(loadedConfig);
      
      expect(merged.notifications.console.enabled).toBe(true); // Default preserved
    });
  });
});