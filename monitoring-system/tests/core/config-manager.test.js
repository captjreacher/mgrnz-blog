import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { ConfigManager } from '../../src/core/config-manager.js';
import { DataStore } from '../../src/storage/data-store.js';

describe('ConfigManager', () => {
  let configManager;
  let dataStore;
  const testDataDir = './test-data/config-test';

  beforeEach(async () => {
    dataStore = new DataStore(testDataDir);
    configManager = new ConfigManager(dataStore);
    await configManager.initialize();
  });

  afterEach(async () => {
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('initialization', () => {
    it('should initialize with default configuration', async () => {
      const config = configManager.getConfig();
      
      expect(config).toHaveProperty('monitoring');
      expect(config).toHaveProperty('endpoints');
      expect(config).toHaveProperty('alerts');
      expect(config).toHaveProperty('storage');
      
      expect(config.monitoring.interval).toBe(30000);
      expect(config.monitoring.timeout).toBe(300000);
      expect(config.monitoring.retryAttempts).toBe(3);
    });
  });

  describe('configuration management', () => {
    it('should save and load configuration', async () => {
      const newConfig = {
        monitoring: {
          interval: 60000,
          timeout: 600000,
          retryAttempts: 5
        },
        endpoints: {
          supabase: "https://custom.supabase.co/functions/v1/test",
          github: "https://api.github.com/repos/test/repo",
          site: "https://test.com"
        },
        custom: {
          setting: 'value'
        }
      };

      await configManager.saveConfig(newConfig);
      await configManager.loadConfig();
      
      const config = configManager.getConfig();
      expect(config.monitoring.interval).toBe(60000);
      expect(config.endpoints.supabase).toBe("https://custom.supabase.co/functions/v1/test");
      expect(config.custom.setting).toBe('value');
    });

    it('should get configuration values by path', () => {
      const interval = configManager.get('monitoring.interval');
      expect(interval).toBe(30000);

      const nonExistent = configManager.get('non.existent.path', 'default');
      expect(nonExistent).toBe('default');
    });

    it('should set configuration values by path', async () => {
      await configManager.set('monitoring.interval', 45000);
      
      const interval = configManager.get('monitoring.interval');
      expect(interval).toBe(45000);
    });

    it('should create nested paths when setting values', async () => {
      await configManager.set('new.nested.setting', 'test-value');
      
      const value = configManager.get('new.nested.setting');
      expect(value).toBe('test-value');
    });
  });

  describe('configuration validation', () => {
    it('should validate valid configuration', () => {
      const validConfig = {
        monitoring: {
          interval: 30000,
          timeout: 300000,
          retryAttempts: 3
        },
        endpoints: {
          supabase: "https://test.supabase.co/functions/v1/test",
          github: "https://api.github.com/repos/test/repo",
          site: "https://test.com"
        },
        alerts: {
          enabled: true,
          thresholds: {
            errorRate: 10,
            responseTime: 5000,
            buildTime: 300000
          }
        },
        storage: {
          maxRecords: 1000,
          cleanupInterval: 86400000
        }
      };

      const result = configManager.validateConfig(validConfig);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid monitoring settings', () => {
      const invalidConfig = {
        monitoring: {
          interval: 500,        // Too small
          timeout: 5000,        // Too small
          retryAttempts: -1     // Negative
        }
      };

      const result = configManager.validateConfig(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('monitoring.interval must be a number >= 1000ms');
      expect(result.errors).toContain('monitoring.timeout must be a number >= 10000ms');
      expect(result.errors).toContain('monitoring.retryAttempts must be a non-negative number');
    });

    it('should reject invalid URLs', () => {
      const invalidConfig = {
        endpoints: {
          supabase: "not-a-url",
          github: "also-not-a-url",
          site: "invalid"
        }
      };

      const result = configManager.validateConfig(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('endpoints.supabase must be a valid URL');
      expect(result.errors).toContain('endpoints.github must be a valid URL');
      expect(result.errors).toContain('endpoints.site must be a valid URL');
    });

    it('should reject invalid alert thresholds', () => {
      const invalidConfig = {
        alerts: {
          enabled: 'not-boolean',
          thresholds: {
            errorRate: 150,       // > 100%
            responseTime: -100,   // Negative
            buildTime: 'invalid'  // Not a number
          }
        }
      };

      const result = configManager.validateConfig(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('alerts.enabled must be a boolean');
      expect(result.errors).toContain('alerts.thresholds.errorRate must be a number between 0 and 100');
      expect(result.errors).toContain('alerts.thresholds.responseTime must be a non-negative number');
    });

    it('should reject invalid storage settings', () => {
      const invalidConfig = {
        storage: {
          maxRecords: 0,        // Must be positive
          cleanupInterval: 30000 // Too small (< 1 minute)
        }
      };

      const result = configManager.validateConfig(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('storage.maxRecords must be a positive number');
      expect(result.errors).toContain('storage.cleanupInterval must be a number >= 60000ms (1 minute)');
    });

    it('should reject invalid configuration when saving', async () => {
      const invalidConfig = {
        monitoring: {
          interval: 'invalid'
        }
      };

      await expect(configManager.saveConfig(invalidConfig)).rejects.toThrow('Invalid configuration');
    });
  });

  describe('configuration reset', () => {
    it('should reset configuration to defaults', async () => {
      // Modify configuration
      await configManager.set('monitoring.interval', 99999);
      expect(configManager.get('monitoring.interval')).toBe(99999);

      // Reset to defaults
      await configManager.resetToDefaults();
      
      const config = configManager.getConfig();
      expect(config.monitoring.interval).toBe(30000); // Default value
    });
  });

  describe('configuration merging', () => {
    it('should merge user config with defaults', async () => {
      const partialConfig = {
        monitoring: {
          interval: 45000,
          timeout: 300000,    // Need to provide required values
          retryAttempts: 3
        },
        custom: {
          newSetting: 'value'
        }
      };

      await configManager.saveConfig(partialConfig);
      
      const config = configManager.getConfig();
      expect(config.monitoring.interval).toBe(45000);           // User value
      expect(config.monitoring.timeout).toBe(300000);          // Default value
      expect(config.monitoring.retryAttempts).toBe(3);         // Default value
      expect(config.custom.newSetting).toBe('value');          // User value
      expect(config.endpoints).toBeDefined();                  // Default section
    });
  });
});