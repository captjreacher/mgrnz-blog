import https from 'https';
import http from 'http';
import { URL } from 'url';
import { performance } from 'perf_hooks';

/**
 * Site Performance Monitor
 * Monitors page load times, performance metrics, and detects performance degradation
 */
export class SitePerformanceMonitor {
  constructor(config = {}) {
    this.config = {
      timeout: config.timeout || 30000,
      maxRetries: config.maxRetries || 3,
      performanceThresholds: {
        responseTime: config.performanceThresholds?.responseTime || 3000,
        firstByteTime: config.performanceThresholds?.firstByteTime || 1000,
        contentLoadTime: config.performanceThresholds?.contentLoadTime || 5000,
        ...config.performanceThresholds
      },
      alertThresholds: {
        degradationPercent: config.alertThresholds?.degradationPercent || 50,
        consecutiveFailures: config.alertThresholds?.consecutiveFailures || 3,
        ...config.alertThresholds
      },
      ...config
    };
    
    this.performanceHistory = [];
    this.consecutiveFailures = 0;
    this.lastSuccessfulMetrics = null;
  }

  async monitorPageLoad(url, options = {}) {
    const startTime = performance.now();
    
    try {
      const metrics = await this.measurePerformanceMetrics(url, options);
      this.lastSuccessfulMetrics = metrics;
      this.consecutiveFailures = 0;
      this.addToHistory(metrics);
      const degradationAlert = this.checkPerformanceDegradation(metrics);
      
      return {
        success: true,
        metrics,
        degradationAlert,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.consecutiveFailures++;
      const failureMetrics = {
        url,
        success: false,
        error: error.message,
        responseTime: performance.now() - startTime,
        timestamp: new Date().toISOString()
      };
      
      this.addToHistory(failureMetrics);
      
      return {
        success: false,
        metrics: failureMetrics,
        degradationAlert: this.checkConsecutiveFailures(),
        timestamp: new Date().toISOString()
      };
    }
  }

  async measurePerformanceMetrics(url, options = {}) {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const startTime = performance.now();
    let firstByteTime = null;
    let contentLength = 0;
    let statusCode = null;
    let headers = {};
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Request timeout after ${this.config.timeout}ms`));
      }, this.config.timeout);
      
      const requestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || 'GET',
        headers: {
          'User-Agent': 'SitePerformanceMonitor/1.0',
          ...options.headers
        }
      };
      
      const req = client.request(requestOptions, (res) => {
        clearTimeout(timeout);
        statusCode = res.statusCode;
        headers = res.headers;
        firstByteTime = performance.now() - startTime;
        
        let responseData = '';
        
        res.on('data', (chunk) => {
          if (!firstByteTime) {
            firstByteTime = performance.now() - startTime;
          }
          contentLength += chunk.length;
          responseData += chunk;
        });
        
        res.on('end', () => {
          const endTime = performance.now();
          const totalTime = endTime - startTime;
          
          const metrics = {
            url,
            success: true,
            statusCode,
            responseTime: Math.round(totalTime),
            firstByteTime: Math.round(firstByteTime),
            contentLoadTime: Math.round(totalTime),
            contentLength,
            headers: {
              contentType: headers['content-type'],
              contentEncoding: headers['content-encoding'],
              cacheControl: headers['cache-control'],
              lastModified: headers['last-modified'],
              etag: headers['etag']
            },
            performance: {
              dnsLookup: 0,
              tcpConnect: 0,
              tlsHandshake: 0,
              firstByte: Math.round(firstByteTime),
              contentDownload: Math.round(totalTime - firstByteTime),
              total: Math.round(totalTime)
            },
            timestamp: new Date().toISOString()
          };
          
          resolve(metrics);
        });
        
        res.on('error', (error) => {
          clearTimeout(timeout);
          reject(new Error(`Response error: ${error.message}`));
        });
      });
      
      req.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Request error: ${error.message}`));
      });
      
      req.on('timeout', () => {
        clearTimeout(timeout);
        req.destroy();
        reject(new Error(`Request timeout after ${this.config.timeout}ms`));
      });
      
      req.setTimeout(this.config.timeout);
      req.end();
    });
  }

  async collectPerformanceMetrics(url, samples = 5, interval = 1000) {
    const results = [];
    
    for (let i = 0; i < samples; i++) {
      try {
        const result = await this.monitorPageLoad(url);
        results.push(result.metrics);
        
        if (i < samples - 1) {
          await this.sleep(interval);
        }
      } catch (error) {
        results.push({
          url,
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    return this.analyzePerformanceResults(results);
  }

  analyzePerformanceResults(results) {
    const successfulResults = results.filter(r => r.success);
    const failedResults = results.filter(r => !r.success);
    
    if (successfulResults.length === 0) {
      return {
        success: false,
        totalSamples: results.length,
        successfulSamples: 0,
        failedSamples: failedResults.length,
        successRate: 0,
        errors: failedResults.map(r => r.error),
        analysis: 'All performance monitoring attempts failed'
      };
    }
    
    const responseTimes = successfulResults.map(r => r.responseTime);
    const firstByteTimes = successfulResults.map(r => r.firstByteTime);
    const contentLoadTimes = successfulResults.map(r => r.contentLoadTime);
    
    const analysis = {
      success: true,
      totalSamples: results.length,
      successfulSamples: successfulResults.length,
      failedSamples: failedResults.length,
      successRate: Math.round((successfulResults.length / results.length) * 100 * 100) / 100,
      
      responseTime: {
        min: Math.min(...responseTimes),
        max: Math.max(...responseTimes),
        avg: Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length),
        median: this.calculateMedian(responseTimes)
      },
      
      firstByteTime: {
        min: Math.min(...firstByteTimes),
        max: Math.max(...firstByteTimes),
        avg: Math.round(firstByteTimes.reduce((a, b) => a + b, 0) / firstByteTimes.length),
        median: this.calculateMedian(firstByteTimes)
      },
      
      contentLoadTime: {
        min: Math.min(...contentLoadTimes),
        max: Math.max(...contentLoadTimes),
        avg: Math.round(contentLoadTimes.reduce((a, b) => a + b, 0) / contentLoadTimes.length),
        median: this.calculateMedian(contentLoadTimes)
      },
      
      performanceGrade: this.calculatePerformanceGrade(responseTimes),
      thresholdViolations: this.checkThresholdViolations(successfulResults),
      recommendations: this.generatePerformanceRecommendations(successfulResults),
      
      timestamp: new Date().toISOString()
    };
    
    if (failedResults.length > 0) {
      analysis.errors = failedResults.map(r => r.error);
    }
    
    return analysis;
  }

  checkPerformanceDegradation(currentMetrics) {
    if (!this.lastSuccessfulMetrics || this.performanceHistory.length < 5) {
      return null;
    }
    
    const recentHistory = this.performanceHistory
      .filter(h => h.success)
      .slice(-10);
    
    if (recentHistory.length < 3) {
      return null;
    }
    
    const avgHistoricalResponseTime = recentHistory
      .reduce((sum, h) => sum + h.responseTime, 0) / recentHistory.length;
    
    const degradationPercent = ((currentMetrics.responseTime - avgHistoricalResponseTime) / avgHistoricalResponseTime) * 100;
    
    if (degradationPercent > this.config.alertThresholds.degradationPercent) {
      return {
        type: 'performance_degradation',
        severity: degradationPercent > 100 ? 'critical' : 'warning',
        message: `Performance degraded by ${Math.round(degradationPercent)}%`,
        details: {
          currentResponseTime: currentMetrics.responseTime,
          historicalAverage: Math.round(avgHistoricalResponseTime),
          degradationPercent: Math.round(degradationPercent),
          threshold: this.config.alertThresholds.degradationPercent
        },
        timestamp: new Date().toISOString()
      };
    }
    
    return null;
  }

  checkConsecutiveFailures() {
    if (this.consecutiveFailures >= this.config.alertThresholds.consecutiveFailures) {
      return {
        type: 'consecutive_failures',
        severity: 'critical',
        message: `${this.consecutiveFailures} consecutive monitoring failures`,
        details: {
          consecutiveFailures: this.consecutiveFailures,
          threshold: this.config.alertThresholds.consecutiveFailures
        },
        timestamp: new Date().toISOString()
      };
    }
    
    return null;
  }

  checkThresholdViolations(results) {
    const violations = [];
    
    results.forEach(result => {
      if (result.responseTime > this.config.performanceThresholds.responseTime) {
        violations.push({
          type: 'response_time',
          value: result.responseTime,
          threshold: this.config.performanceThresholds.responseTime,
          message: `Response time ${result.responseTime}ms exceeds threshold ${this.config.performanceThresholds.responseTime}ms`
        });
      }
      
      if (result.firstByteTime > this.config.performanceThresholds.firstByteTime) {
        violations.push({
          type: 'first_byte_time',
          value: result.firstByteTime,
          threshold: this.config.performanceThresholds.firstByteTime,
          message: `First byte time ${result.firstByteTime}ms exceeds threshold ${this.config.performanceThresholds.firstByteTime}ms`
        });
      }
      
      if (result.contentLoadTime > this.config.performanceThresholds.contentLoadTime) {
        violations.push({
          type: 'content_load_time',
          value: result.contentLoadTime,
          threshold: this.config.performanceThresholds.contentLoadTime,
          message: `Content load time ${result.contentLoadTime}ms exceeds threshold ${this.config.performanceThresholds.contentLoadTime}ms`
        });
      }
    });
    
    return violations;
  }

  generatePerformanceRecommendations(results) {
    const recommendations = [];
    const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
    const avgFirstByteTime = results.reduce((sum, r) => sum + r.firstByteTime, 0) / results.length;
    
    if (avgResponseTime > 2000) {
      recommendations.push({
        type: 'response_time',
        priority: 'high',
        message: 'Consider optimizing server response time',
        suggestions: [
          'Enable server-side caching',
          'Optimize database queries',
          'Use a Content Delivery Network (CDN)',
          'Compress response content'
        ]
      });
    }
    
    if (avgFirstByteTime > 800) {
      recommendations.push({
        type: 'first_byte_time',
        priority: 'medium',
        message: 'Server processing time could be improved',
        suggestions: [
          'Optimize server-side processing',
          'Implement server-side caching',
          'Review server resource allocation'
        ]
      });
    }
    
    const hasLargeContent = results.some(r => r.contentLength > 1000000);
    if (hasLargeContent) {
      recommendations.push({
        type: 'content_size',
        priority: 'medium',
        message: 'Large content size detected',
        suggestions: [
          'Enable gzip compression',
          'Optimize images and assets',
          'Implement lazy loading',
          'Minify CSS and JavaScript'
        ]
      });
    }
    
    return recommendations;
  }

  calculatePerformanceGrade(responseTimes) {
    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    
    if (avgResponseTime < 500) return 'A';
    if (avgResponseTime < 1000) return 'B';
    if (avgResponseTime < 2000) return 'C';
    if (avgResponseTime < 3000) return 'D';
    return 'F';
  }

  calculateMedian(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  addToHistory(metrics) {
    this.performanceHistory.push({
      ...metrics,
      timestamp: new Date().toISOString()
    });
    
    if (this.performanceHistory.length > 100) {
      this.performanceHistory = this.performanceHistory.slice(-100);
    }
  }

  getPerformanceHistory(limit = 50) {
    return this.performanceHistory.slice(-limit);
  }

  clearHistory() {
    this.performanceHistory = [];
    this.consecutiveFailures = 0;
    this.lastSuccessfulMetrics = null;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Ensure export is available
export default SitePerformanceMonitor;