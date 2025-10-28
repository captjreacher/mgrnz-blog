import { DataStore } from '../storage/data-store.js';

/**
 * Configuration manager for monitoring system settings
 * Handles loading, validation, and updating of configuration
 */
export class ConfigManager {
  constructor(dataStore = null) {
    this.dataStore = dataStore || new DataStore();
    this.config = null;
    this.defaultConfig = this._getDefaultConfig();
  }

  /**
   * Initialize configuration manager
   */
  async initialize() {
    try {
      await this.dataStore.initialize();
      await this.loadConfig();
      console.log('Configuration manager initialized');
    } catch (error) {
      console.error('Failed to initialize configuration manager:', error.message);
      throw error;
    }
  }

  /**
   * Load configuration from storage
   */
  async loadConfig() {
    try {
      const storedConfig = await this.dataStore.getConfig();
      this.config = this._mergeConfigs(this.defaultConfig, storedConfig);
      
      // Validate configuration
      const validation = this.validateConfig(this.config);
      if (!validation.valid) {
        console.warn('Configuration validation warnings:', validation.errors);
        // Use defaults for invalid values
        this.config = this._sanitizeConfig(this.config);
      }

      return this.config;
    } catch (error) {
      console.error('Failed to load configuration:', error.message);
      this.config = this.defaultConfig;
      return this.config;
    }
  }

  /**
   * Save configuration to storage
   * @param {Object} newConfig - Configuration to save
   */
  async saveConfig(newConfig) {
    try {
      // Validate new configuration
      const validation = this.validateConfig(newConfig);
      if (!validation.valid) {
        throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
      }

      this.config = this._mergeConfigs(this.defaultConfig, newConfig);
      await this.dataStore.saveConfig(this.config);
      
      console.log('Configuration saved successfully');
      return this.config;
    } catch (error) {
      console.error('Failed to save configuration:', error.message);
      throw error;
    }
  }

  /**
   * Get current configuration
   * @returns {Object} Current configuration
   */
  getConfig() {
    return this.config || this.defaultConfig;
  }

  /**
   * Get a specific configuration value
   * @param {string} path - Dot-notation path to config value (e.g., 'monitoring.interval')
   * @param {*} defaultValue - Default value if path not found
   * @returns {*} Configuration value
   */
  get(path, defaultValue = null) {
    const config = this.getConfig();
    const keys = path.split('.');
    let value = config;

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return defaultValue;
      }
    }

    return value;
  }  /**
  
 * Set a specific configuration value
   * @param {string} path - Dot-notation path to config value
   * @param {*} value - Value to set
   */
  async set(path, value) {
    try {
      const config = { ...this.getConfig() };
      const keys = path.split('.');
      let current = config;

      // Navigate to the parent object
      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (!current[key] || typeof current[key] !== 'object') {
          current[key] = {};
        }
        current = current[key];
      }

      // Set the value
      current[keys[keys.length - 1]] = value;

      await this.saveConfig(config);
    } catch (error) {
      console.error('Failed to set configuration value:', error.message);
      throw error;
    }
  }

  /**
   * Validate configuration object
   * @param {Object} config - Configuration to validate
   * @returns {{valid: boolean, errors: string[]}}
   */
  validateConfig(config) {
    const errors = [];

    // Validate monitoring settings
    if (config.monitoring) {
      if (typeof config.monitoring.interval !== 'number' || config.monitoring.interval < 1000) {
        errors.push('monitoring.interval must be a number >= 1000ms');
      }
      if (typeof config.monitoring.timeout !== 'number' || config.monitoring.timeout < 10000) {
        errors.push('monitoring.timeout must be a number >= 10000ms');
      }
      if (typeof config.monitoring.retryAttempts !== 'number' || config.monitoring.retryAttempts < 0) {
        errors.push('monitoring.retryAttempts must be a non-negative number');
      }
    }

    // Validate endpoints
    if (config.endpoints) {
      const urlPattern = /^https?:\/\/.+/;
      
      if (config.endpoints.supabase && !urlPattern.test(config.endpoints.supabase)) {
        errors.push('endpoints.supabase must be a valid URL');
      }
      if (config.endpoints.github && !urlPattern.test(config.endpoints.github)) {
        errors.push('endpoints.github must be a valid URL');
      }
      if (config.endpoints.site && !urlPattern.test(config.endpoints.site)) {
        errors.push('endpoints.site must be a valid URL');
      }
    }

    // Validate alerts
    if (config.alerts) {
      if (typeof config.alerts.enabled !== 'boolean') {
        errors.push('alerts.enabled must be a boolean');
      }

      if (config.alerts.thresholds) {
        const thresholds = config.alerts.thresholds;
        if (typeof thresholds.errorRate !== 'number' || thresholds.errorRate < 0 || thresholds.errorRate > 100) {
          errors.push('alerts.thresholds.errorRate must be a number between 0 and 100');
        }
        if (typeof thresholds.responseTime !== 'number' || thresholds.responseTime < 0) {
          errors.push('alerts.thresholds.responseTime must be a non-negative number');
        }
        if (typeof thresholds.buildTime !== 'number' || thresholds.buildTime < 0) {
          errors.push('alerts.thresholds.buildTime must be a non-negative number');
        }
      }

      if (config.alerts.cooldowns) {
        const cooldowns = config.alerts.cooldowns;
        if (typeof cooldowns.default !== 'number' || cooldowns.default < 0) {
          errors.push('alerts.cooldowns.default must be a non-negative number');
        }
        if (cooldowns.byType && typeof cooldowns.byType === 'object') {
          Object.entries(cooldowns.byType).forEach(([type, value]) => {
            if (typeof value !== 'number' || value < 0) {
              errors.push(`alerts.cooldowns.byType.${type} must be a non-negative number`);
            }
          });
        }
      }

      if (config.alerts.notifications) {
        const notifications = config.alerts.notifications;
        if (notifications.email) {
          if (notifications.email.enabled && (!notifications.email.recipients || notifications.email.recipients.length === 0)) {
            errors.push('alerts.notifications.email.recipients must include at least one recipient when email notifications are enabled');
          }
          if (notifications.email.smtp) {
            const smtp = notifications.email.smtp;
            if (smtp.port !== undefined && (typeof smtp.port !== 'number' || smtp.port <= 0)) {
              errors.push('alerts.notifications.email.smtp.port must be a positive number');
            }
          }
        }

        if (notifications.webhook) {
          if (notifications.webhook.enabled) {
            const urlPattern = /^https?:\/\//;
            if (!notifications.webhook.url || !urlPattern.test(notifications.webhook.url)) {
              errors.push('alerts.notifications.webhook.url must be a valid URL when webhook notifications are enabled');
            }
          }
          if (notifications.webhook.timeout !== undefined && (typeof notifications.webhook.timeout !== 'number' || notifications.webhook.timeout <= 0)) {
            errors.push('alerts.notifications.webhook.timeout must be a positive number');
          }
        }
      }
    }

    // Validate storage settings
    if (config.storage) {
      if (typeof config.storage.maxRecords !== 'number' || config.storage.maxRecords < 1) {
        errors.push('storage.maxRecords must be a positive number');
      }
      if (typeof config.storage.cleanupInterval !== 'number' || config.storage.cleanupInterval < 60000) {
        errors.push('storage.cleanupInterval must be a number >= 60000ms (1 minute)');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Reset configuration to defaults
   */
  async resetToDefaults() {
    try {
      await this.saveConfig(this.defaultConfig);
      console.log('Configuration reset to defaults');
    } catch (error) {
      console.error('Failed to reset configuration:', error.message);
      throw error;
    }
  }

  // Private helper methods

  _getDefaultConfig() {
    return {
      monitoring: {
        interval: 30000,        // 30 seconds
        timeout: 300000,        // 5 minutes
        retryAttempts: 3
      },
      endpoints: {
        supabase: "https://your-project.supabase.co/functions/v1/ml-to-hugo-public",
        github: "https://api.github.com/repos/captjreacher/mgrnz-blog",
        site: "https://mgrnz.com"
      },
      alerts: {
        enabled: true,
        thresholds: {
          errorRate: 10,          // 10%
          responseTime: 5000,     // 5 seconds
          buildTime: 300000       // 5 minutes
        },
        cooldowns: {
          default: 300000,
          byType: {}
        },
        notifications: {
          console: { enabled: true },
          dashboard: { enabled: true },
          email: {
            enabled: false,
            from: 'alerts@mgrnz.com',
            subjectPrefix: '[mgrnz] ',
            recipients: [],
            notifyOnLifecycle: true,
            smtp: {
              host: 'smtp.example.com',
              port: 587,
              secure: false,
              auth: {
                user: '',
                pass: ''
              }
            }
          },
          webhook: {
            enabled: false,
            url: '',
            headers: {},
            timeout: 5000,
            verifySsl: true,
            notifyOnLifecycle: true
          }
        }
      },
      storage: {
        maxRecords: 1000,
        cleanupInterval: 86400000 // 24 hours
      },
      dashboard: {
        port: 3000,
        host: 'localhost',
        refreshInterval: 5000     // 5 seconds
      }
    };
  }

  _mergeConfigs(defaultConfig, userConfig) {
    const merged = { ...defaultConfig };
    
    for (const key in userConfig) {
      if (userConfig[key] && typeof userConfig[key] === 'object' && !Array.isArray(userConfig[key])) {
        merged[key] = { ...merged[key], ...userConfig[key] };
      } else {
        merged[key] = userConfig[key];
      }
    }
    
    return merged;
  }

  _sanitizeConfig(config) {
    const sanitized = { ...config };
    const validation = this.validateConfig(sanitized);
    
    if (!validation.valid) {
      // Replace invalid values with defaults
      const defaults = this.defaultConfig;
      
      validation.errors.forEach(error => {
        if (error.includes('monitoring.interval')) {
          sanitized.monitoring.interval = defaults.monitoring.interval;
        }
        if (error.includes('monitoring.timeout')) {
          sanitized.monitoring.timeout = defaults.monitoring.timeout;
        }
        if (error.includes('monitoring.retryAttempts')) {
          sanitized.monitoring.retryAttempts = defaults.monitoring.retryAttempts;
        }
        // Add more sanitization rules as needed
      });
    }
    
    return sanitized;
  }
}