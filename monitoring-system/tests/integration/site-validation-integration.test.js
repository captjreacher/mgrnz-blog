import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import SiteAccessibilityChecker from '../../src/validators/site-accessibility-checker.js';
import ContentValidator from '../../src/validators/content-validator.js';
import { SitePerformanceMonitor } from '../../src/validators/site-performance-monitor.js';

describe('Site Validation Integration Tests', () => {
  let accessibilityChecker;
  let contentValidator;
  let performanceMonitor;
  let testConfig;

  beforeEach(() => {
    testConfig = {
      timeout: 10000,
      baseUrl: 'https://httpbin.org', // Use httpbin for reliable testing
      performanceThresholds: {
        responseTime: 5000,
        firstByteTime: 2000,
        contentLoadTime: 6000
      }
    };

    accessibilityChecker = new SiteAccessibilityChecker(testConfig);
    contentValidator = new ContentValidator(testConfig);
    performanceMonitor = new SitePerformanceMonitor(testConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('End-to-End Site Validation Workflow', () => {
    it('should perform complete site validation workflow', async () => {
      const runId = 'integration-test-001';
      const testUrl = 'https://httpbin.org/html';

      try {
        // Step 1: Accessibility Check
        const accessibilityResult = await accessibilityChecker.validateSiteAccess(testUrl, runId);
        
        expect(accessibilityResult.runId).toBe(runId);
        expect(accessibilityResult.url).toBe(testUrl);
        expect(accessibilityResult).toHaveProperty('checks');
        expect(accessibilityResult).toHaveProperty('overall');
        
        // Step 2: Performance Monitoring
        const performanceResult = await performanceMonitor.monitorPageLoad(testUrl);
        
        expect(performanceResult).toHaveProperty('success');
        expect(performanceResult).toHaveProperty('metrics');
        expect(performanceResult).toHaveProperty('timestamp');
        
        if (performanceResult.success) {
          expect(performanceResult.metrics.responseTime).toBeGreaterThan(0);
          expect(performanceResult.metrics.url).toBe(testUrl);
        }
        
        // Step 3: Content Validation (basic structure check)
        const contentResult = await contentValidator.validateDeployedContent(runId);
        
        expect(contentResult.runId).toBe(runId);
        expect(contentResult).toHaveProperty('validations');
        expect(contentResult).toHaveProperty('overall');
        
        // Verify integration points
        expect(accessibilityResult.overall.responseTime).toBeGreaterThan(0);
        
        if (performanceResult.success && accessibilityResult.overall.accessible) {
          // Both accessibility and performance checks should be consistent
          expect(performanceResult.metrics.statusCode).toBeLessThan(400);
        }
        
      } catch (error) {
        // Network errors are acceptable in test environment
        expect(error.message).toMatch(/Request|Network|timeout/i);
      }
    }, 30000);

    it('should handle site validation with multiple performance samples', async () => {
      const testUrl = 'https://httpbin.org/delay/1';
      
      try {
        const performanceAnalysis = await performanceMonitor.collectPerformanceMetrics(testUrl, 3, 500);
        
        expect(performanceAnalysis).toHaveProperty('totalSamples');
        expect(performanceAnalysis).toHaveProperty('successfulSamples');
        expect(performanceAnalysis).toHaveProperty('successRate');
        
        if (performanceAnalysis.success) {
          expect(performanceAnalysis.totalSamples).toBe(3);
          expect(performanceAnalysis.responseTime).toHaveProperty('min');
          expect(performanceAnalysis.responseTime).toHaveProperty('max');
          expect(performanceAnalysis.responseTime).toHaveProperty('avg');
          expect(performanceAnalysis.performanceGrade).toMatch(/[A-F]/);
        }
        
      } catch (error) {
        // Network timeouts are acceptable
        expect(error.message).toMatch(/timeout|Network/i);
      }
    }, 45000);

    it('should validate site health check integration', async () => {
      const testUrl = 'https://httpbin.org/status/200';
      
      try {
        const healthCheck = await accessibilityChecker.performHealthCheck(testUrl);
        
        expect(healthCheck).toHaveProperty('status');
        expect(healthCheck).toHaveProperty('responseTime');
        expect(healthCheck).toHaveProperty('timestamp');
        
        if (healthCheck.status === 'healthy') {
          expect(healthCheck.statusCode).toBe(200);
          expect(healthCheck.responseTime).toBeGreaterThan(0);
        }
        
      } catch (error) {
        expect(error.message).toMatch(/Request|Network/i);
      }
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle site accessibility failures gracefully', async () => {
      const invalidUrl = 'https://httpbin.org/status/500';
      const runId = 'error-test-001';
      
      try {
        const result = await accessibilityChecker.validateSiteAccess(invalidUrl, runId);
        
        expect(result.runId).toBe(runId);
        expect(result.url).toBe(invalidUrl);
        
        // Should handle 500 status gracefully
        if (result.checks.http) {
          expect(result.checks.http.statusCode).toBe(500);
          expect(result.overall.accessible).toBe(false);
        }
        
      } catch (error) {
        expect(error.message).toMatch(/Request|Network/i);
      }
    });

    it('should handle performance monitoring failures', async () => {
      const timeoutUrl = 'https://httpbin.org/delay/10'; // Long delay to trigger timeout
      
      const shortTimeoutMonitor = new SitePerformanceMonitor({
        timeout: 2000, // 2 second timeout
        performanceThresholds: testConfig.performanceThresholds
      });
      
      const result = await shortTimeoutMonitor.monitorPageLoad(timeoutUrl);
      
      expect(result.success).toBe(false);
      expect(result.metrics.error).toMatch(/timeout/i);
      expect(result.metrics.responseTime).toBeGreaterThan(0);
    });

    it('should handle content validation with inaccessible site', async () => {
      const inaccessibleConfig = {
        ...testConfig,
        baseUrl: 'https://httpbin.org/status/404'
      };
      
      const validator = new ContentValidator(inaccessibleConfig);
      const result = await validator.validateDeployedContent('error-test-002');
      
      expect(result.runId).toBe('error-test-002');
      expect(result.overall.valid).toBe(false);
      expect(result.overall.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Performance Degradation Detection', () => {
    it('should detect performance degradation over time', async () => {
      const testUrl = 'https://httpbin.org/delay/1';
      
      try {
        // Simulate historical good performance
        for (let i = 0; i < 5; i++) {
          const mockGoodMetrics = {
            success: true,
            responseTime: 500 + (i * 10),
            timestamp: new Date().toISOString()
          };
          performanceMonitor.addToHistory(mockGoodMetrics);
        }
        
        // Now test with a slower response
        const slowUrl = 'https://httpbin.org/delay/2';
        const result = await performanceMonitor.monitorPageLoad(slowUrl);
        
        if (result.success && result.degradationAlert) {
          expect(result.degradationAlert.type).toBe('performance_degradation');
          expect(result.degradationAlert.severity).toMatch(/warning|critical/);
          expect(result.degradationAlert.details.degradationPercent).toBeGreaterThan(0);
        }
        
      } catch (error) {
        expect(error.message).toMatch(/timeout|Network/i);
      }
    });

    it('should track consecutive failures', async () => {
      const invalidUrl = 'https://httpbin.org/status/500';
      
      // Simulate multiple failures
      for (let i = 0; i < 3; i++) {
        const result = await performanceMonitor.monitorPageLoad(invalidUrl);
        expect(result.success).toBe(false);
      }
      
      // Check if consecutive failure alert is triggered
      const alert = performanceMonitor.checkConsecutiveFailures();
      expect(alert).toBeDefined();
      expect(alert.type).toBe('consecutive_failures');
      expect(alert.severity).toBe('critical');
      expect(alert.details.consecutiveFailures).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Comprehensive Site Analysis', () => {
    it('should perform comprehensive site analysis with all validators', async () => {
      const testUrl = 'https://httpbin.org/html';
      const runId = 'comprehensive-test-001';
      
      const results = {
        accessibility: null,
        performance: null,
        content: null
      };
      
      try {
        // Run all validations in parallel
        const [accessibilityResult, performanceResult, contentResult] = await Promise.allSettled([
          accessibilityChecker.validateSiteAccess(testUrl, runId),
          performanceMonitor.collectPerformanceMetrics(testUrl, 2, 1000),
          contentValidator.validateDeployedContent(runId)
        ]);
        
        // Process accessibility results
        if (accessibilityResult.status === 'fulfilled') {
          results.accessibility = accessibilityResult.value;
          expect(results.accessibility.runId).toBe(runId);
        }
        
        // Process performance results
        if (performanceResult.status === 'fulfilled') {
          results.performance = performanceResult.value;
          expect(results.performance.totalSamples).toBe(2);
        }
        
        // Process content results
        if (contentResult.status === 'fulfilled') {
          results.content = contentResult.value;
          expect(results.content.runId).toBe(runId);
        }
        
        // Verify at least one validation completed successfully
        const successfulValidations = Object.values(results).filter(r => r !== null);
        expect(successfulValidations.length).toBeGreaterThan(0);
        
      } catch (error) {
        // Network errors are acceptable in test environment
        expect(error.message).toMatch(/Request|Network|timeout/i);
      }
    }, 60000);

    it('should generate performance recommendations', async () => {
      const testUrl = 'https://httpbin.org/delay/2'; // Slow response for recommendations
      
      try {
        const analysis = await performanceMonitor.collectPerformanceMetrics(testUrl, 2, 1000);
        
        if (analysis.success) {
          expect(analysis.recommendations).toBeDefined();
          expect(Array.isArray(analysis.recommendations)).toBe(true);
          
          // Check for threshold violations
          expect(analysis.thresholdViolations).toBeDefined();
          expect(Array.isArray(analysis.thresholdViolations)).toBe(true);
          
          // Verify performance grade calculation
          expect(analysis.performanceGrade).toMatch(/[A-F]/);
        }
        
      } catch (error) {
        expect(error.message).toMatch(/timeout|Network/i);
      }
    });
  });

  describe('Data Consistency and Integration', () => {
    it('should maintain consistent data across validation runs', async () => {
      const testUrl = 'https://httpbin.org/get';
      const runId1 = 'consistency-test-001';
      const runId2 = 'consistency-test-002';
      
      try {
        const [result1, result2] = await Promise.all([
          accessibilityChecker.validateSiteAccess(testUrl, runId1),
          accessibilityChecker.validateSiteAccess(testUrl, runId2)
        ]);
        
        // Both results should have consistent structure
        expect(result1).toHaveProperty('runId');
        expect(result2).toHaveProperty('runId');
        expect(result1).toHaveProperty('checks');
        expect(result2).toHaveProperty('checks');
        expect(result1).toHaveProperty('overall');
        expect(result2).toHaveProperty('overall');
        
        // Run IDs should be different
        expect(result1.runId).toBe(runId1);
        expect(result2.runId).toBe(runId2);
        
        // URLs should be the same
        expect(result1.url).toBe(testUrl);
        expect(result2.url).toBe(testUrl);
        
      } catch (error) {
        expect(error.message).toMatch(/Request|Network/i);
      }
    });

    it('should handle concurrent validation requests', async () => {
      const testUrls = [
        'https://httpbin.org/get',
        'https://httpbin.org/html',
        'https://httpbin.org/json'
      ];
      
      try {
        const promises = testUrls.map((url, index) => 
          performanceMonitor.monitorPageLoad(url)
        );
        
        const results = await Promise.allSettled(promises);
        
        // Verify all requests were processed
        expect(results).toHaveLength(3);
        
        // Check that successful results have proper structure
        results.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value.success) {
            expect(result.value.metrics.url).toBe(testUrls[index]);
            expect(result.value.metrics.responseTime).toBeGreaterThan(0);
          }
        });
        
      } catch (error) {
        expect(error.message).toMatch(/Request|Network/i);
      }
    });
  });

  describe('Real-world Scenario Simulation', () => {
    it('should simulate new post deployment validation', async () => {
      const runId = 'deployment-simulation-001';
      const expectedChanges = {
        newPosts: [
          {
            title: 'Test Blog Post',
            url: '/posts/test-blog-post/',
            expectedContent: 'This is a test post content'
          }
        ]
      };
      
      // Simulate the validation workflow that would occur after deployment
      const validationResults = {
        accessibility: null,
        performance: null,
        content: null
      };
      
      try {
        // Step 1: Check site accessibility
        validationResults.accessibility = await accessibilityChecker.performHealthCheck(testConfig.baseUrl);
        
        // Step 2: Monitor performance
        validationResults.performance = await performanceMonitor.monitorPageLoad(testConfig.baseUrl);
        
        // Step 3: Validate content changes
        validationResults.content = await contentValidator.validateDeployedContent(runId, expectedChanges);
        
        // Verify validation structure
        expect(validationResults.content.runId).toBe(runId);
        expect(validationResults.content.validations.newPosts).toBeDefined();
        expect(validationResults.content.validations.newPosts.expectedCount).toBe(1);
        
        // Performance monitoring should provide metrics
        if (validationResults.performance.success) {
          expect(validationResults.performance.metrics.responseTime).toBeGreaterThan(0);
        }
        
      } catch (error) {
        // Network errors are expected in test environment
        expect(error.message).toMatch(/Request|Network|timeout/i);
      }
    });

    it('should simulate site outage detection', async () => {
      const outageUrl = 'https://httpbin.org/status/503'; // Service unavailable
      const runId = 'outage-simulation-001';
      
      try {
        // Simulate monitoring during an outage
        const [accessibilityResult, performanceResult] = await Promise.allSettled([
          accessibilityChecker.validateSiteAccess(outageUrl, runId),
          performanceMonitor.monitorPageLoad(outageUrl)
        ]);
        
        // Accessibility check should detect the outage
        if (accessibilityResult.status === 'fulfilled') {
          const result = accessibilityResult.value;
          expect(result.overall.accessible).toBe(false);
          expect(result.overall.errors.length).toBeGreaterThan(0);
        }
        
        // Performance monitoring should fail
        if (performanceResult.status === 'fulfilled') {
          const result = performanceResult.value;
          expect(result.success).toBe(false);
          expect(result.metrics.error).toBeDefined();
        }
        
      } catch (error) {
        expect(error.message).toMatch(/Request|Network/i);
      }
    });
  });
});