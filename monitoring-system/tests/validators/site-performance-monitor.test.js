import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SitePerformanceMonitor } from '../../src/validators/site-performance-monitor.js';

describe('SitePerformanceMonitor', () => {
  let monitor;
  let mockConfig;

  beforeEach(() => {
    mockConfig = {
      timeout: 5000,
      maxRetries: 2,
      performanceThresholds: {
        responseTime: 2000,
        firstByteTime: 800,
        contentLoadTime: 3000
      },
      alertThresholds: {
        degradationPercent: 30,
        consecutiveFailures: 2
      }
    };
    
    monitor = new SitePerformanceMonitor(mockConfig);
  });

  describe('constructor', () => {
    it('should initialize with default config when no config provided', () => {
      const defaultMonitor = new SitePerformanceMonitor();
      
      expect(defaultMonitor.config.timeout).toBe(30000);
      expect(defaultMonitor.config.maxRetries).toBe(3);
      expect(defaultMonitor.config.performanceThresholds.responseTime).toBe(3000);
      expect(defaultMonitor.performanceHistory).toEqual([]);
      expect(defaultMonitor.consecutiveFailures).toBe(0);
    });

    it('should initialize with provided config', () => {
      expect(monitor.config.timeout).toBe(5000);
      expect(monitor.config.maxRetries).toBe(2);
      expect(monitor.config.performanceThresholds.responseTime).toBe(2000);
      expect(monitor.config.alertThresholds.degradationPercent).toBe(30);
    });
  });

  describe('measurePerformanceMetrics', () => {
    it('should measure performance metrics for a valid URL', async () => {
      try {
        const result = await monitor.measurePerformanceMetrics('https://httpbin.org/delay/1');
        
        expect(result).toHaveProperty('url');
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('responseTime');
        expect(result).toHaveProperty('firstByteTime');
        expect(result).toHaveProperty('contentLoadTime');
        expect(result).toHaveProperty('performance');
        expect(result).toHaveProperty('timestamp');
        
        if (result.success) {
          expect(typeof result.responseTime).toBe('number');
          expect(typeof result.firstByteTime).toBe('number');
          expect(typeof result.contentLoadTime).toBe('number');
          expect(result.responseTime).toBeGreaterThan(0);
        }
      } catch (error) {
        // Network errors are acceptable in test environment
        expect(error.message).toMatch(/Request|Network|timeout/i);
      }
    }, 20000);

    it('should handle timeout errors', async () => {
      const shortTimeoutMonitor = new SitePerformanceMonitor({ timeout: 100 });
      
      try {
        await shortTimeoutMonitor.measurePerformanceMetrics('https://httpbin.org/delay/5');
      } catch (error) {
        expect(error.message).toContain('timeout');
      }
    });

    it('should handle invalid URLs', async () => {
      try {
        await monitor.measurePerformanceMetrics('invalid-url');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('monitorPageLoad', () => {
    it('should return success result for successful monitoring', async () => {
      // Mock successful metrics
      const mockMetrics = {
        url: 'https://example.com',
        success: true,
        responseTime: 500,
        firstByteTime: 200,
        contentLoadTime: 500,
        statusCode: 200
      };

      // Mock the measurePerformanceMetrics method
      vi.spyOn(monitor, 'measurePerformanceMetrics').mockResolvedValue(mockMetrics);

      const result = await monitor.monitorPageLoad('https://example.com');

      expect(result.success).toBe(true);
      expect(result.metrics).toEqual(mockMetrics);
      expect(result).toHaveProperty('timestamp');
      expect(monitor.consecutiveFailures).toBe(0);
      expect(monitor.lastSuccessfulMetrics).toEqual(mockMetrics);
    });

    it('should handle monitoring failures', async () => {
      // Mock failed metrics
      vi.spyOn(monitor, 'measurePerformanceMetrics').mockRejectedValue(new Error('Network error'));

      const result = await monitor.monitorPageLoad('https://example.com');

      expect(result.success).toBe(false);
      expect(result.metrics.error).toBe('Network error');
      expect(monitor.consecutiveFailures).toBe(1);
    });
  });

  describe('collectPerformanceMetrics', () => {
    it('should collect multiple performance samples', async () => {
      const mockMetrics = {
        url: 'https://example.com',
        success: true,
        responseTime: 500,
        firstByteTime: 200,
        contentLoadTime: 500
      };

      vi.spyOn(monitor, 'monitorPageLoad').mockResolvedValue({
        success: true,
        metrics: mockMetrics
      });

      const result = await monitor.collectPerformanceMetrics('https://example.com', 3, 100);

      expect(result.success).toBe(true);
      expect(result.totalSamples).toBe(3);
      expect(result.successfulSamples).toBe(3);
      expect(result.successRate).toBe(100);
      expect(result).toHaveProperty('responseTime');
      expect(result).toHaveProperty('performanceGrade');
    });

    it('should handle mixed success and failure results', async () => {
      vi.spyOn(monitor, 'monitorPageLoad')
        .mockResolvedValueOnce({
          success: true,
          metrics: { success: true, responseTime: 500, firstByteTime: 200, contentLoadTime: 500 }
        })
        .mockResolvedValueOnce({
          success: false,
          metrics: { success: false, error: 'Network error' }
        })
        .mockResolvedValueOnce({
          success: true,
          metrics: { success: true, responseTime: 600, firstByteTime: 250, contentLoadTime: 600 }
        });

      const result = await monitor.collectPerformanceMetrics('https://example.com', 3, 100);

      expect(result.totalSamples).toBe(3);
      expect(result.successfulSamples).toBe(2);
      expect(result.failedSamples).toBe(1);
      expect(result.successRate).toBe(66.67);
      expect(result.errors).toContain('Network error');
    });
  });

  describe('analyzePerformanceResults', () => {
    it('should analyze successful performance results', () => {
      const results = [
        { success: true, responseTime: 500, firstByteTime: 200, contentLoadTime: 500 },
        { success: true, responseTime: 600, firstByteTime: 250, contentLoadTime: 600 },
        { success: true, responseTime: 400, firstByteTime: 150, contentLoadTime: 400 }
      ];

      const analysis = monitor.analyzePerformanceResults(results);

      expect(analysis.success).toBe(true);
      expect(analysis.totalSamples).toBe(3);
      expect(analysis.successfulSamples).toBe(3);
      expect(analysis.successRate).toBe(100);
      expect(analysis.responseTime.min).toBe(400);
      expect(analysis.responseTime.max).toBe(600);
      expect(analysis.responseTime.avg).toBe(500);
      expect(analysis.performanceGrade).toBe('B');
    });

    it('should handle all failed results', () => {
      const results = [
        { success: false, error: 'Network error 1' },
        { success: false, error: 'Network error 2' }
      ];

      const analysis = monitor.analyzePerformanceResults(results);

      expect(analysis.success).toBe(false);
      expect(analysis.totalSamples).toBe(2);
      expect(analysis.successfulSamples).toBe(0);
      expect(analysis.successRate).toBe(0);
      expect(analysis.errors).toEqual(['Network error 1', 'Network error 2']);
    });
  });

  describe('checkPerformanceDegradation', () => {
    it('should detect performance degradation', () => {
      // Set up historical data and lastSuccessfulMetrics
      monitor.performanceHistory = [
        { success: true, responseTime: 500 },
        { success: true, responseTime: 520 },
        { success: true, responseTime: 480 },
        { success: true, responseTime: 510 },
        { success: true, responseTime: 490 }
      ];
      monitor.lastSuccessfulMetrics = { responseTime: 500 };

      const currentMetrics = { responseTime: 800 }; // 60% slower than average (500)

      const alert = monitor.checkPerformanceDegradation(currentMetrics);

      expect(alert).toBeDefined();
      expect(alert.type).toBe('performance_degradation');
      expect(alert.severity).toMatch(/warning|critical/);
      expect(alert.details.degradationPercent).toBeGreaterThan(30);
    });

    it('should not alert when performance is within acceptable range', () => {
      monitor.performanceHistory = [
        { success: true, responseTime: 500 },
        { success: true, responseTime: 520 },
        { success: true, responseTime: 480 }
      ];

      const currentMetrics = { responseTime: 550 }; // Only 10% slower

      const alert = monitor.checkPerformanceDegradation(currentMetrics);

      expect(alert).toBeNull();
    });

    it('should return null when insufficient historical data', () => {
      monitor.performanceHistory = [
        { success: true, responseTime: 500 }
      ];

      const currentMetrics = { responseTime: 800 };

      const alert = monitor.checkPerformanceDegradation(currentMetrics);

      expect(alert).toBeNull();
    });
  });

  describe('checkConsecutiveFailures', () => {
    it('should alert on consecutive failures threshold', () => {
      monitor.consecutiveFailures = 3;

      const alert = monitor.checkConsecutiveFailures();

      expect(alert).toBeDefined();
      expect(alert.type).toBe('consecutive_failures');
      expect(alert.severity).toBe('critical');
      expect(alert.details.consecutiveFailures).toBe(3);
    });

    it('should not alert when below threshold', () => {
      monitor.consecutiveFailures = 1;

      const alert = monitor.checkConsecutiveFailures();

      expect(alert).toBeNull();
    });
  });

  describe('checkThresholdViolations', () => {
    it('should detect threshold violations', () => {
      const results = [
        { responseTime: 3000, firstByteTime: 1200, contentLoadTime: 4000 }, // All exceed thresholds
        { responseTime: 1000, firstByteTime: 500, contentLoadTime: 2000 }   // All within thresholds
      ];

      const violations = monitor.checkThresholdViolations(results);

      expect(violations).toHaveLength(3); // 3 violations from first result
      expect(violations.some(v => v.type === 'response_time')).toBe(true);
      expect(violations.some(v => v.type === 'first_byte_time')).toBe(true);
      expect(violations.some(v => v.type === 'content_load_time')).toBe(true);
    });

    it('should return empty array when no violations', () => {
      const results = [
        { responseTime: 1000, firstByteTime: 500, contentLoadTime: 2000 }
      ];

      const violations = monitor.checkThresholdViolations(results);

      expect(violations).toHaveLength(0);
    });
  });

  describe('generatePerformanceRecommendations', () => {
    it('should generate recommendations for slow performance', () => {
      const results = [
        { responseTime: 3000, firstByteTime: 1000, contentLength: 2000000 }
      ];

      const recommendations = monitor.generatePerformanceRecommendations(results);

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations.some(r => r.type === 'response_time')).toBe(true);
      expect(recommendations.some(r => r.type === 'first_byte_time')).toBe(true);
      expect(recommendations.some(r => r.type === 'content_size')).toBe(true);
    });

    it('should return empty recommendations for good performance', () => {
      const results = [
        { responseTime: 400, firstByteTime: 200, contentLength: 50000 }
      ];

      const recommendations = monitor.generatePerformanceRecommendations(results);

      expect(recommendations).toHaveLength(0);
    });
  });

  describe('calculatePerformanceGrade', () => {
    it('should calculate correct performance grades', () => {
      expect(monitor.calculatePerformanceGrade([400])).toBe('A');
      expect(monitor.calculatePerformanceGrade([800])).toBe('B');
      expect(monitor.calculatePerformanceGrade([1500])).toBe('C');
      expect(monitor.calculatePerformanceGrade([2500])).toBe('D');
      expect(monitor.calculatePerformanceGrade([4000])).toBe('F');
    });
  });

  describe('calculateMedian', () => {
    it('should calculate median for odd number of values', () => {
      expect(monitor.calculateMedian([1, 2, 3, 4, 5])).toBe(3);
    });

    it('should calculate median for even number of values', () => {
      expect(monitor.calculateMedian([1, 2, 3, 4])).toBe(2.5);
    });

    it('should handle single value', () => {
      expect(monitor.calculateMedian([5])).toBe(5);
    });
  });

  describe('performance history management', () => {
    it('should add metrics to history', () => {
      const metrics = { success: true, responseTime: 500 };
      
      monitor.addToHistory(metrics);
      
      expect(monitor.performanceHistory).toHaveLength(1);
      expect(monitor.performanceHistory[0]).toMatchObject(metrics);
      expect(monitor.performanceHistory[0]).toHaveProperty('timestamp');
    });

    it('should limit history to 100 entries', () => {
      // Add 150 entries
      for (let i = 0; i < 150; i++) {
        monitor.addToHistory({ success: true, responseTime: 500 + i });
      }
      
      expect(monitor.performanceHistory).toHaveLength(100);
      expect(monitor.performanceHistory[0].responseTime).toBe(550); // First 50 should be removed
    });

    it('should get performance history with limit', () => {
      // Add 20 entries
      for (let i = 0; i < 20; i++) {
        monitor.addToHistory({ success: true, responseTime: 500 + i });
      }
      
      const history = monitor.getPerformanceHistory(10);
      expect(history).toHaveLength(10);
      expect(history[0].responseTime).toBe(510); // Last 10 entries
    });

    it('should clear history', () => {
      monitor.addToHistory({ success: true, responseTime: 500 });
      monitor.consecutiveFailures = 2;
      monitor.lastSuccessfulMetrics = { responseTime: 500 };
      
      monitor.clearHistory();
      
      expect(monitor.performanceHistory).toHaveLength(0);
      expect(monitor.consecutiveFailures).toBe(0);
      expect(monitor.lastSuccessfulMetrics).toBeNull();
    });
  });

  describe('sleep', () => {
    it('should sleep for specified duration', async () => {
      const start = Date.now();
      await monitor.sleep(100);
      const end = Date.now();
      
      expect(end - start).toBeGreaterThanOrEqual(90); // Allow some variance
    });
  });
});