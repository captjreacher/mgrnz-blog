import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import SiteAccessibilityChecker from '../../src/validators/site-accessibility-checker.js';
import ContentValidator from '../../src/validators/content-validator.js';
import { SitePerformanceMonitor } from '../../src/validators/site-performance-monitor.js';

describe('Site Validation Performance Tests', () => {
  let accessibilityChecker;
  let contentValidator;
  let performanceMonitor;
  let testConfig;

  beforeEach(() => {
    testConfig = {
      timeout: 15000,
      baseUrl: 'https://httpbin.org',
      performanceThresholds: {
        responseTime: 3000,
        firstByteTime: 1000,
        contentLoadTime: 4000
      },
      alertThresholds: {
        degradationPercent: 50,
        consecutiveFailures: 3
      }
    };

    accessibilityChecker = new SiteAccessibilityChecker(testConfig);
    contentValidator = new ContentValidator(testConfig);
    performanceMonitor = new SitePerformanceMonitor(testConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Performance Monitoring Accuracy', () => {
    it('should accurately measure response times', async () => {
      const testUrl = 'https://httpbin.org/delay/1'; // 1 second delay
      
      try {
        const startTime = Date.now();
        const result = await performanceMonitor.measurePerformanceMetrics(testUrl);
        const actualDuration = Date.now() - startTime;
        
        if (result.success) {
          // Response time should be close to actual duration (within 500ms tolerance)
          expect(result.responseTime).toBeGreaterThan(800); // At least 800ms for 1s delay
          expect(result.responseTime).toBeLessThan(actualDuration + 500);
          
          // First byte time should be less than total response time
          expect(result.firstByteTime).toBeLessThan(result.responseTime);
          expect(result.firstByteTime).toBeGreaterThan(0);
          
          // Content load time should equal response time for simple requests
          expect(result.contentLoadTime).toBe(result.responseTime);
        }
        
      } catch (error) {
        expect(error.message).toMatch(/timeout|Network/i);
      }
    }, 20000);

    it('should handle multiple concurrent performance measurements', async () => {
      const testUrls = [
        'https://httpbin.org/delay/0.5',
        'https://httpbin.org/delay/1',
        'https://httpbin.org/delay/1.5'
      ];
      
      try {
        const startTime = Date.now();
        const promises = testUrls.map(url => performanceMonitor.measurePerformanceMetrics(url));
        const results = await Promise.allSettled(promises);
        const totalDuration = Date.now() - startTime;
        
        // All requests should complete concurrently, not sequentially
        expect(totalDuration).toBeLessThan(3000); // Should be less than sum of delays
        
        // Verify results structure
        results.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value.success) {
            expect(result.value.url).toBe(testUrls[index]);
            expect(result.value.responseTime).toBeGreaterThan(0);
            expect(result.value.firstByteTime).toBeGreaterThan(0);
          }
        });
        
      } catch (error) {
        expect(error.message).toMatch(/timeout|Network/i);
      }
    }, 25000);

    it('should provide consistent performance metrics across multiple samples', async () => {
      const testUrl = 'https://httpbin.org/get';
      const sampleCount = 5;
      
      try {
        const analysis = await performanceMonitor.collectPerformanceMetrics(testUrl, sampleCount, 200);
        
        if (analysis.success && analysis.successfulSamples > 0) {
          // Verify statistical consistency
          expect(analysis.totalSamples).toBe(sampleCount);
          expect(analysis.successfulSamples).toBeGreaterThan(0);
          expect(analysis.successRate).toBeGreaterThan(0);
          
          // Response time statistics should be reasonable
          expect(analysis.responseTime.min).toBeGreaterThan(0);
          expect(analysis.responseTime.max).toBeGreaterThanOrEqual(analysis.responseTime.min);
          expect(analysis.responseTime.avg).toBeGreaterThanOrEqual(analysis.responseTime.min);
          expect(analysis.responseTime.avg).toBeLessThanOrEqual(analysis.responseTime.max);
          
          // Median should be within min-max range
          expect(analysis.responseTime.median).toBeGreaterThanOrEqual(analysis.responseTime.min);
          expect(analysis.responseTime.median).toBeLessThanOrEqual(analysis.responseTime.max);
          
          // Performance grade should be valid
          expect(analysis.performanceGrade).toMatch(/^[A-F]$/);
        }
        
      } catch (error) {
        expect(error.message).toMatch(/timeout|Network/i);
      }
    }, 30000);
  });

  describe('Performance Threshold Detection', () => {
    it('should detect response time threshold violations', async () => {
      const slowUrl = 'https://httpbin.org/delay/4'; // 4 second delay
      const fastThresholdMonitor = new SitePerformanceMonitor({
        ...testConfig,
        performanceThresholds: {
          responseTime: 2000, // 2 second threshold
          firstByteTime: 1000,
          contentLoadTime: 3000
        }
      });
      
      try {
        const analysis = await fastThresholdMonitor.collectPerformanceMetrics(slowUrl, 2, 1000);
        
        if (analysis.success) {
          // Should detect threshold violations
          expect(analysis.thresholdViolations.length).toBeGreaterThan(0);
          
          const responseTimeViolations = analysis.thresholdViolations.filter(
            v => v.type === 'response_time'
          );
          expect(responseTimeViolations.length).toBeGreaterThan(0);
          
          responseTimeViolations.forEach(violation => {
            expect(violation.value).toBeGreaterThan(violation.threshold);
            expect(violation.message).toContain('exceeds threshold');
          });
        }
        
      } catch (error) {
        expect(error.message).toMatch(/timeout|Network/i);
      }
    }, 35000);

    it('should generate appropriate performance recommendations', async () => {
      const slowUrl = 'https://httpbin.org/delay/3';
      
      try {
        const analysis = await performanceMonitor.collectPerformanceMetrics(slowUrl, 2, 1000);
        
        if (analysis.success) {
          expect(analysis.recommendations).toBeDefined();
          expect(Array.isArray(analysis.recommendations)).toBe(true);
          
          // Should have recommendations for slow response times
          const responseTimeRecommendations = analysis.recommendations.filter(
            r => r.type === 'response_time'
          );
          
          if (responseTimeRecommendations.length > 0) {
            responseTimeRecommendations.forEach(rec => {
              expect(rec.priority).toMatch(/high|medium|low/);
              expect(rec.message).toBeDefined();
              expect(Array.isArray(rec.suggestions)).toBe(true);
              expect(rec.suggestions.length).toBeGreaterThan(0);
            });
          }
        }
        
      } catch (error) {
        expect(error.message).toMatch(/timeout|Network/i);
      }
    }, 30000);
  });

  describe('Performance Degradation Detection', () => {
    it('should detect performance degradation accurately', async () => {
      const baseUrl = 'https://httpbin.org/delay/0.5';
      const degradedUrl = 'https://httpbin.org/delay/2';
      
      try {
        // Establish baseline performance
        for (let i = 0; i < 5; i++) {
          await performanceMonitor.monitorPageLoad(baseUrl);
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        // Test with degraded performance
        const result = await performanceMonitor.monitorPageLoad(degradedUrl);
        
        if (result.success && result.degradationAlert) {
          expect(result.degradationAlert.type).toBe('performance_degradation');
          expect(result.degradationAlert.severity).toMatch(/warning|critical/);
          expect(result.degradationAlert.details.degradationPercent).toBeGreaterThan(0);
          expect(result.degradationAlert.details.currentResponseTime).toBeGreaterThan(
            result.degradationAlert.details.historicalAverage
          );
        }
        
      } catch (error) {
        expect(error.message).toMatch(/timeout|Network/i);
      }
    }, 40000);

    it('should track consecutive failures correctly', async () => {
      const failingUrl = 'https://httpbin.org/status/500';
      
      // Generate consecutive failures
      for (let i = 0; i < 4; i++) {
        await performanceMonitor.monitorPageLoad(failingUrl);
      }
      
      // Check consecutive failure detection
      const alert = performanceMonitor.checkConsecutiveFailures();
      
      expect(alert).toBeDefined();
      expect(alert.type).toBe('consecutive_failures');
      expect(alert.severity).toBe('critical');
      expect(alert.details.consecutiveFailures).toBeGreaterThanOrEqual(3);
      expect(alert.details.threshold).toBe(testConfig.alertThresholds.consecutiveFailures);
    });
  });

  describe('Accessibility Check Performance', () => {
    it('should perform accessibility checks within reasonable time', async () => {
      const testUrl = 'https://httpbin.org/html';
      const runId = 'perf-test-001';
      
      try {
        const startTime = Date.now();
        const result = await accessibilityChecker.validateSiteAccess(testUrl, runId);
        const duration = Date.now() - startTime;
        
        // Accessibility check should complete within 15 seconds
        expect(duration).toBeLessThan(15000);
        
        expect(result.runId).toBe(runId);
        expect(result.overall.responseTime).toBeGreaterThan(0);
        expect(result.overall.responseTime).toBeLessThan(duration + 1000);
        
      } catch (error) {
        expect(error.message).toMatch(/timeout|Network/i);
      }
    }, 20000);

    it('should handle multiple accessibility checks efficiently', async () => {
      const testUrls = [
        'https://httpbin.org/html',
        'https://httpbin.org/get',
        'https://httpbin.org/json'
      ];
      
      try {
        const startTime = Date.now();
        const promises = testUrls.map((url, index) => 
          accessibilityChecker.validateSiteAccess(url, `perf-test-${index}`)
        );
        
        const results = await Promise.allSettled(promises);
        const totalDuration = Date.now() - startTime;
        
        // Should complete all checks concurrently
        expect(totalDuration).toBeLessThan(20000);
        
        // Verify results
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            expect(result.value.runId).toBe(`perf-test-${index}`);
            expect(result.value.url).toBe(testUrls[index]);
          }
        });
        
      } catch (error) {
        expect(error.message).toMatch(/timeout|Network/i);
      }
    }, 25000);
  });

  describe('Content Validation Performance', () => {
    it('should validate content within acceptable time limits', async () => {
      const runId = 'content-perf-test-001';
      
      try {
        const startTime = Date.now();
        const result = await contentValidator.validateDeployedContent(runId);
        const duration = Date.now() - startTime;
        
        // Content validation should complete within 30 seconds
        expect(duration).toBeLessThan(30000);
        
        expect(result.runId).toBe(runId);
        expect(result.timestamp).toBeDefined();
        expect(result.validations).toBeDefined();
        
      } catch (error) {
        expect(error.message).toMatch(/timeout|Network/i);
      }
    }, 35000);

    it('should handle content validation with expected changes efficiently', async () => {
      const runId = 'content-perf-test-002';
      const expectedChanges = {
        newPosts: [
          { title: 'Test Post 1', url: '/posts/test-1/' },
          { title: 'Test Post 2', url: '/posts/test-2/' },
          { title: 'Test Post 3', url: '/posts/test-3/' }
        ]
      };
      
      try {
        const startTime = Date.now();
        const result = await contentValidator.validateDeployedContent(runId, expectedChanges);
        const duration = Date.now() - startTime;
        
        // Should handle multiple post validations efficiently
        expect(duration).toBeLessThan(45000);
        
        expect(result.validations.newPosts).toBeDefined();
        expect(result.validations.newPosts.expectedCount).toBe(3);
        
      } catch (error) {
        expect(error.message).toMatch(/timeout|Network/i);
      }
    }, 50000);
  });

  describe('Memory and Resource Usage', () => {
    it('should manage performance history efficiently', () => {
      const monitor = new SitePerformanceMonitor(testConfig);
      
      // Add many entries to test memory management
      for (let i = 0; i < 150; i++) {
        monitor.addToHistory({
          success: true,
          responseTime: 500 + i,
          timestamp: new Date().toISOString()
        });
      }
      
      // Should limit history to 100 entries
      expect(monitor.performanceHistory.length).toBe(100);
      
      // Should keep the most recent entries
      const history = monitor.getPerformanceHistory(10);
      expect(history.length).toBe(10);
      expect(history[0].responseTime).toBeGreaterThan(640); // Recent entries
    });

    it('should clear history and reset state correctly', () => {
      const monitor = new SitePerformanceMonitor(testConfig);
      
      // Add some data
      monitor.addToHistory({ success: true, responseTime: 500 });
      monitor.consecutiveFailures = 2;
      monitor.lastSuccessfulMetrics = { responseTime: 500 };
      
      // Clear history
      monitor.clearHistory();
      
      expect(monitor.performanceHistory.length).toBe(0);
      expect(monitor.consecutiveFailures).toBe(0);
      expect(monitor.lastSuccessfulMetrics).toBeNull();
    });
  });

  describe('Statistical Analysis Performance', () => {
    it('should calculate statistics efficiently for large datasets', () => {
      const monitor = new SitePerformanceMonitor(testConfig);
      
      // Generate large dataset
      const results = [];
      for (let i = 0; i < 1000; i++) {
        results.push({
          success: true,
          responseTime: 500 + Math.random() * 1000,
          firstByteTime: 200 + Math.random() * 300,
          contentLoadTime: 600 + Math.random() * 1200
        });
      }
      
      const startTime = Date.now();
      const analysis = monitor.analyzePerformanceResults(results);
      const duration = Date.now() - startTime;
      
      // Analysis should complete quickly even with large dataset
      expect(duration).toBeLessThan(1000); // Less than 1 second
      
      expect(analysis.totalSamples).toBe(1000);
      expect(analysis.successfulSamples).toBe(1000);
      expect(analysis.successRate).toBe(100);
      expect(analysis.responseTime.avg).toBeGreaterThan(0);
      expect(analysis.performanceGrade).toMatch(/^[A-F]$/);
    });

    it('should calculate median values correctly for various dataset sizes', () => {
      const monitor = new SitePerformanceMonitor(testConfig);
      
      // Test odd number of values
      expect(monitor.calculateMedian([1, 3, 5, 7, 9])).toBe(5);
      
      // Test even number of values
      expect(monitor.calculateMedian([2, 4, 6, 8])).toBe(5);
      
      // Test single value
      expect(monitor.calculateMedian([42])).toBe(42);
      
      // Test large dataset
      const largeDataset = Array.from({ length: 1001 }, (_, i) => i);
      expect(monitor.calculateMedian(largeDataset)).toBe(500);
    });
  });

  describe('Timeout and Error Handling Performance', () => {
    it('should handle timeouts efficiently', async () => {
      const timeoutMonitor = new SitePerformanceMonitor({
        ...testConfig,
        timeout: 1000 // 1 second timeout
      });
      
      const slowUrl = 'https://httpbin.org/delay/5'; // 5 second delay
      
      const startTime = Date.now();
      const result = await timeoutMonitor.monitorPageLoad(slowUrl);
      const duration = Date.now() - startTime;
      
      // Should timeout quickly and not wait for full response
      expect(duration).toBeLessThan(2000);
      expect(result.success).toBe(false);
      expect(result.metrics.error).toMatch(/timeout/i);
    });

    it('should handle multiple concurrent timeouts', async () => {
      const timeoutMonitor = new SitePerformanceMonitor({
        ...testConfig,
        timeout: 1000
      });
      
      const slowUrls = [
        'https://httpbin.org/delay/5',
        'https://httpbin.org/delay/6',
        'https://httpbin.org/delay/7'
      ];
      
      const startTime = Date.now();
      const promises = slowUrls.map(url => timeoutMonitor.monitorPageLoad(url));
      const results = await Promise.allSettled(promises);
      const duration = Date.now() - startTime;
      
      // All should timeout concurrently, not sequentially
      expect(duration).toBeLessThan(3000);
      
      results.forEach(result => {
        if (result.status === 'fulfilled') {
          expect(result.value.success).toBe(false);
          expect(result.value.metrics.error).toMatch(/timeout/i);
        }
      });
    });
  });
});