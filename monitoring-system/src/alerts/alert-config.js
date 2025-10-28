const fs = require('fs').promises;
const path = require('path');

/**
 * Alert configuration manager
 * Handles loading, saving, and managing alert thresholds and settings
 */
class AlertConfig {
  constructor(configPath = null) {
    this.configPath = configPath || path.join(__dirname, '../../config/alert-config.json');
    this.config = this.getDefaultConfig();
  }

  /**
   * Get default alert configuration
   */
  getDefaultConfig() {
    return {
      thresholds: {
        // Pipeline performance thresholds
        errorRate: 0.1,           // 10% error rate threshold
        responseTime: 5000,       // 5 second response time threshold
        failureCount: 3,          // 3 consecutive failures
        
        // Webhook thresholds
        webhookTimeout: 30000,    // 30 second webhook timeout
        webhookErrorRate: 0.05,   // 5% webhook error rate
        
        // Build process thresholds
        buildTime: 600000,        // 10 minute build time threshold
        deploymentTime: 300000,   // 5 minute deployment time threshold
        
        // Site validation thresholds
        siteResponseTime: 3000,   // 3 second site response time
        siteErrorRate: 0.02,      // 2% site error rate
        
        // GitHub Actions thresholds
        workflowTimeout: 1800000, // 30 minute workflow timeout
        queueTime: 300000,        // 5 minute queue time threshold
        
        // Performance degradation thresholds
        performanceDegradation: 0.5, // 50% performance degradation
        memoryUsage: 0.8,         // 80% memory usage threshold
        cpuUsage: 0.9             // 90% CPU usage threshold
      },
      
      notifications: {
        console: {
          enabled: true,
          severityFilter: ['low', 'medium', 'high', 'critical']
        },
        dashboard: {
          enabled: true,
          severityFilter: ['medium', 'high', 'critical'],
          realTime: true
        },
        email: {
          enabled: false,
          severityFilter: ['high', 'critical'],
          recipients: [],
          smtp: {
            host: '',
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
          severityFilter: ['high', 'critical'],
          url: '',
          headers: {},
          timeout: 5000
        }
      },
      
      alertRules: {
        // Cooldown period between similar alerts (milliseconds)
        cooldownPeriod: 300000, // 5 minutes
        
        // Auto-resolve alerts after this period if no new occurrences
        autoResolveAfter: 3600000, // 1 hour
        
        // Maximum number of alerts to keep in history
        maxHistorySize: 1000,
        
        // Alert escalation rules
        escalation: {
          enabled: false,
          rules: [
            {
              condition: 'consecutive_failures >= 5',
              action: 'escalate_to_critical'
            },
            {
              condition: 'error_rate > 0.2',
              action: 'send_immediate_notification'
            }
          ]
        }
      },
      
      alertTypes: {
        pipeline_failure: {
          enabled: true,
          severity: 'high',
          description: 'Pipeline execution failed'
        },
        slow_pipeline: {
          enabled: true,
          severity: 'medium',
          description: 'Pipeline execution is slower than threshold'
        },
        stage_failure: {
          enabled: true,
          severity: 'high',
          description: 'Individual pipeline stage failed'
        },
        slow_build: {
          enabled: true,
          severity: 'medium',
          description: 'Build process is slower than threshold'
        },
        webhook_timeout: {
          enabled: true,
          severity: 'medium',
          description: 'Webhook request timed out'
        },
        webhook_auth_failure: {
          enabled: true,
          severity: 'high',
          description: 'Webhook authentication failed'
        },
        webhook_error: {
          enabled: true,
          severity: 'high',
          description: 'Webhook request returned error'
        },
        site_down: {
          enabled: true,
          severity: 'critical',
          description: 'Production site is not accessible'
        },
        site_slow: {
          enabled: true,
          severity: 'medium',
          description: 'Production site response time is slow'
        },
        content_validation_failed: {
          enabled: true,
          severity: 'medium',
          description: 'Content validation failed'
        },
        github_api_error: {
          enabled: true,
          severity: 'high',
          description: 'GitHub API request failed'
        },
        workflow_timeout: {
          enabled: true,
          severity: 'high',
          description: 'GitHub Actions workflow timed out'
        }
      }
    };
  }

  /**
   * Load configuration from file
   */
  async loadConfig() {
    try {
      const configData = await fs.readFile(this.configPath, 'utf8');
      const loadedConfig = JSON.parse(configData);
      
      // Merge with defaults to ensure all properties exist
      this.config = this.mergeWithDefaults(loadedConfig);
      
      return this.config;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Config file doesn't exist, create it with defaults
        await this.saveConfig();
        return this.config;
      }
      throw new Error(`Failed to load alert configuration: ${error.message}`);
    }
  }

  /**
   * Save configuration to file
   */
  async saveConfig() {
    try {
      // Ensure directory exists
      const configDir = path.dirname(this.configPath);
      await fs.mkdir(configDir, { recursive: true });
      
      // Save configuration
      await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      throw new Error(`Failed to save alert configuration: ${error.message}`);
    }
  }

  /**
   * Merge loaded config with defaults
   */
  mergeWithDefaults(loadedConfig) {
    const defaultConfig = this.getDefaultConfig();
    
    return {
      thresholds: { ...defaultConfig.thresholds, ...loadedConfig.thresholds },
      notifications: {
        console: { ...defaultConfig.notifications.console, ...loadedConfig.notifications?.console },
        dashboard: { ...defaultConfig.notifications.dashboard, ...loadedConfig.notifications?.dashboard },
        email: { ...defaultConfig.notifications.email, ...loadedConfig.notifications?.email },
        webhook: { ...defaultConfig.notifications.webhook, ...loadedConfig.notifications?.webhook }
      },
      alertRules: { ...defaultConfig.alertRules, ...loadedConfig.alertRules },
      alertTypes: { ...defaultConfig.alertTypes, ...loadedConfig.alertTypes }
    };
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return this.config;
  }

  /**
   * Update thresholds
   */
  async updateThresholds(newThresholds) {
    this.config.thresholds = {
      ...this.config.thresholds,
      ...newThresholds
    };
    await this.saveConfig();
  }

  /**
   * Update notification settings
   */
  async updateNotificationSettings(channel, settings) {
    if (this.config.notifications[channel]) {
      this.config.notifications[channel] = {
        ...this.config.notifications[channel],
        ...settings
      };
      await this.saveConfig();
    }
  }

  /**
   * Enable/disable alert type
   */
  async setAlertTypeEnabled(alertType, enabled) {
    if (this.config.alertTypes[alertType]) {
      this.config.alertTypes[alertType].enabled = enabled;
      await this.saveConfig();
    }
  }

  /**
   * Update alert type severity
   */
  async setAlertTypeSeverity(alertType, severity) {
    if (this.config.alertTypes[alertType]) {
      this.config.alertTypes[alertType].severity = severity;
      await this.saveConfig();
    }
  }

  /**
   * Get threshold value
   */
  getThreshold(key) {
    return this.config.thresholds[key];
  }

  /**
   * Get notification settings for channel
   */
  getNotificationSettings(channel) {
    return this.config.notifications[channel];
  }

  /**
   * Check if alert type is enabled
   */
  isAlertTypeEnabled(alertType) {
    return this.config.alertTypes[alertType]?.enabled || false;
  }

  /**
   * Get alert type configuration
   */
  getAlertTypeConfig(alertType) {
    return this.config.alertTypes[alertType];
  }

  /**
   * Validate configuration
   */
  validateConfig() {
    const errors = [];
    
    // Validate thresholds
    for (const [key, value] of Object.entries(this.config.thresholds)) {
      if (typeof value !== 'number' || value < 0) {
        errors.push(`Invalid threshold value for ${key}: ${value}`);
      }
    }
    
    // Validate notification channels
    for (const [channel, settings] of Object.entries(this.config.notifications)) {
      if (typeof settings.enabled !== 'boolean') {
        errors.push(`Invalid enabled setting for ${channel}: ${settings.enabled}`);
      }
      
      if (!Array.isArray(settings.severityFilter)) {
        errors.push(`Invalid severityFilter for ${channel}: must be an array`);
      }
    }
    
    // Validate alert types
    for (const [alertType, config] of Object.entries(this.config.alertTypes)) {
      if (!['low', 'medium', 'high', 'critical'].includes(config.severity)) {
        errors.push(`Invalid severity for ${alertType}: ${config.severity}`);
      }
    }
    
    return errors;
  }

  /**
   * Reset to default configuration
   */
  async resetToDefaults() {
    this.config = this.getDefaultConfig();
    await this.saveConfig();
  }

  /**
   * Export configuration for backup
   */
  exportConfig() {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Import configuration from backup
   */
  async importConfig(configJson) {
    try {
      const importedConfig = JSON.parse(configJson);
      this.config = this.mergeWithDefaults(importedConfig);
      
      const errors = this.validateConfig();
      if (errors.length > 0) {
        throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
      }
      
      await this.saveConfig();
    } catch (error) {
      throw new Error(`Failed to import configuration: ${error.message}`);
    }
  }
}

module.exports = AlertConfig;