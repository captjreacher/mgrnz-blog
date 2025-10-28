import { describe, it, expect, beforeEach, vi } from 'vitest';
import SiteAccessibilityChecker from '../../src/validators/site-accessibility-checker.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('SiteAccessibilityChecker', () => {
  let accessibilityChecker;
  let mockConfig;

  beforeEach(() => {
    mockConfig = {
      timeout: 5000,
      retryAttempts: 2,
      sslValidation: true,
      dnsValidation: true
    };
    
    accessibilityChecker = new SiteAccessibilityChecker(mockConfig);
    
    // Reset mocks
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default config when no config provided', () => {
      const defaultChecker = new SiteAccessibilityChecker();
      
      expect(defaultChecker.config.timeout).toBe(30000);
      expect(defaultChecker.config.retryAttempts).toBe(3);
      expect(defaultChecker.config.sslValidation).toBe(true);
      expect(defaultChecker.config.dnsValidation).toBe(true);
    });

    it('should initialize with provided config', () => {
      expect(accessibilityChecker.config.timeout).toBe(5000);
      expect(accessibilityChecker.config.retryAttempts).toBe(2);
      expect(accessibilityChecker.config.sslValidation).toBe(true);
      expect(accessibilityChecker.config.dnsValidation).toBe(true);
    });
  });

  describe('validateSiteAccess', () => {
    it('should validate site accessibility successfully', async () => {
      // Mock successful HTTPS response
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([
          ['content-type', 'text/html'],
          ['content-length', '1000']
        ]),
        text: () => Promise.resolve('<html><body>Test</body></html>')
      });

      const result = await accessibilityChecker.validateSiteAccess('https://example.com');

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.responseTime).toBeGreaterThan(0);
      expect(result.sslValid).toBe(true);
      expect(result.accessible).toBe(true);
    });

    it('should handle site accessibility failures', async () => {
      // Mock failed response
      fetch.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await accessibilityChecker.validateSiteAccess('https://example.com');

      expect(result.success).toBe(false);
      expect(result.accessible).toBe(false);
      expect(result.error).toContain('Connection refused');
    });

    it('should validate SSL certificate', async () => {
      // Mock successful HTTPS response with SSL info
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([
          ['content-type', 'text/html']
        ]),
        text: () => Promise.resolve('<html><body>Test</body></html>')
      });

      const result = await accessibilityChecker.validateSiteAccess('https://example.com');

      expect(result.sslValid).toBe(true);
      expect(result.protocol).toBe('https:');
    });

    it('should handle HTTP sites without SSL validation', async () => {
      // Mock successful HTTP response
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([
          ['content-type', 'text/html']
        ]),
        text: () => Promise.resolve('<html><body>Test</body></html>')
      });

      const result = await accessibilityChecker.validateSiteAccess('http://example.com');

      expect(result.success).toBe(true);
      expect(result.sslValid).toBe(false);
      expect(result.protocol).toBe('http:');
    });
  });

  describe('performHealthCheck', () => {
    it('should perform comprehensive health check', async () => {
      // Mock successful response
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([
          ['content-type', 'text/html'],
          ['content-length', '1500'],
          ['last-modified', 'Wed, 28 Oct 2025 12:00:00 GMT']
        ]),
        text: () => Promise.resolve('<html><body>Healthy site</body></html>')
      });

      const result = await accessibilityChecker.performHealthCheck('https://example.com');

      expect(result.status).toBe('healthy');
      expect(result.responseTime).toBeGreaterThan(0);
      expect(result.sslValid).toBe(true);
      expect(result.contentLength).toBe(1500);
      expect(result.lastModified).toBe('Wed, 28 Oct 2025 12:00:00 GMT');
    });

    it('should detect unhealthy site', async () => {
      // Mock error response
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Map(),
        text: () => Promise.resolve('Server Error')
      });

      const result = await accessibilityChecker.performHealthCheck('https://example.com');

      expect(result.status).toBe('unhealthy');
      expect(result.statusCode).toBe(500);
      expect(result.error).toContain('HTTP 500');
    });

    it('should handle network timeouts', async () => {
      // Mock timeout
      fetch.mockRejectedValueOnce(new Error('Request timeout'));

      const result = await accessibilityChecker.performHealthCheck('https://example.com');

      expect(result.status).toBe('unhealthy');
      expect(result.error).toContain('Request timeout');
    });
  });

  describe('validateDNSResolution', () => {
    it('should validate DNS resolution successfully', async () => {
      // Mock successful DNS resolution (simulated through successful fetch)
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        text: () => Promise.resolve('OK')
      });

      const result = await accessibilityChecker.validateDNSResolution('example.com');

      expect(result.resolved).toBe(true);
      expect(result.hostname).toBe('example.com');
      expect(result.responseTime).toBeGreaterThan(0);
    });

    it('should handle DNS resolution failures', async () => {
      // Mock DNS failure
      fetch.mockRejectedValueOnce(new Error('ENOTFOUND'));

      const result = await accessibilityChecker.validateDNSResolution('nonexistent.example');

      expect(result.resolved).toBe(false);
      expect(result.error).toContain('ENOTFOUND');
    });
  });

  describe('checkRedirectChain', () => {
    it('should follow redirect chain successfully', async () => {
      // Mock redirect chain
      fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 301,
          statusText: 'Moved Permanently',
          headers: new Map([['location', 'https://example.com/new-path']]),
          text: () => Promise.resolve('')
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Map([['content-type', 'text/html']]),
          text: () => Promise.resolve('<html><body>Final destination</body></html>')
        });

      const result = await accessibilityChecker.checkRedirectChain('https://example.com/old-path');

      expect(result.success).toBe(true);
      expect(result.redirectCount).toBe(1);
      expect(result.finalUrl).toBe('https://example.com/new-path');
      expect(result.redirectChain).toHaveLength(2);
    });

    it('should detect redirect loops', async () => {
      // Mock redirect loop
      fetch
        .mockResolvedValue({
          ok: false,
          status: 301,
          statusText: 'Moved Permanently',
          headers: new Map([['location', 'https://example.com/loop']]),
          text: () => Promise.resolve('')
        });

      const result = await accessibilityChecker.checkRedirectChain('https://example.com/loop');

      expect(result.success).toBe(false);
      expect(result.error).toContain('redirect loop');
      expect(result.redirectCount).toBeGreaterThan(5);
    });

    it('should handle too many redirects', async () => {
      // Mock excessive redirects
      const mockRedirect = {
        ok: false,
        status: 302,
        statusText: 'Found',
        headers: new Map([['location', 'https://example.com/redirect']]),
        text: () => Promise.resolve('')
      };

      fetch.mockResolvedValue(mockRedirect);

      const result = await accessibilityChecker.checkRedirectChain('https://example.com/start');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Too many redirects');
      expect(result.redirectCount).toBeGreaterThanOrEqual(10);
    });
  });

  describe('validateSSLCertificate', () => {
    it('should validate SSL certificate successfully', async () => {
      // Mock successful HTTPS request
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        text: () => Promise.resolve('OK')
      });

      const result = await accessibilityChecker.validateSSLCertificate('https://example.com');

      expect(result.valid).toBe(true);
      expect(result.protocol).toBe('https:');
      expect(result.secure).toBe(true);
    });

    it('should detect invalid SSL certificate', async () => {
      // Mock SSL error
      fetch.mockRejectedValueOnce(new Error('certificate verify failed'));

      const result = await accessibilityChecker.validateSSLCertificate('https://example.com');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('certificate verify failed');
    });

    it('should handle non-HTTPS URLs', async () => {
      const result = await accessibilityChecker.validateSSLCertificate('http://example.com');

      expect(result.valid).toBe(false);
      expect(result.secure).toBe(false);
      expect(result.protocol).toBe('http:');
      expect(result.error).toContain('not HTTPS');
    });
  });

  describe('monitorAvailability', () => {
    it('should monitor site availability over time', async () => {
      // Mock successful responses
      fetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/html']]),
        text: () => Promise.resolve('<html><body>Available</body></html>')
      });

      const result = await accessibilityChecker.monitorAvailability('https://example.com', 3, 100);

      expect(result.totalChecks).toBe(3);
      expect(result.successfulChecks).toBe(3);
      expect(result.availabilityPercentage).toBe(100);
      expect(result.averageResponseTime).toBeGreaterThan(0);
    });

    it('should handle mixed availability results', async () => {
      // Mock mixed responses
      fetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map(),
          text: () => Promise.resolve('OK')
        })
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map(),
          text: () => Promise.resolve('OK')
        });

      const result = await accessibilityChecker.monitorAvailability('https://example.com', 3, 100);

      expect(result.totalChecks).toBe(3);
      expect(result.successfulChecks).toBe(2);
      expect(result.failedChecks).toBe(1);
      expect(result.availabilityPercentage).toBeCloseTo(66.67, 1);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('error handling', () => {
    it('should handle network errors gracefully', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await accessibilityChecker.validateSiteAccess('https://example.com');

      expect(result.success).toBe(false);
      expect(result.accessible).toBe(false);
      expect(result.error).toContain('Network error');
    });

    it('should handle invalid URLs', async () => {
      const result = await accessibilityChecker.validateSiteAccess('invalid-url');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid URL');
    });

    it('should retry on transient failures', async () => {
      // Mock failure then success
      fetch
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map(),
          text: () => Promise.resolve('OK')
        });

      const result = await accessibilityChecker.validateSiteAccess('https://example.com');

      expect(result.success).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('performance tracking', () => {
    it('should track response times accurately', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        text: () => Promise.resolve('OK')
      });

      const result = await accessibilityChecker.validateSiteAccess('https://example.com');

      expect(result.responseTime).toBeGreaterThan(0);
      expect(typeof result.responseTime).toBe('number');
    });

    it('should provide performance metrics in health check', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([
          ['content-length', '2000']
        ]),
        text: () => Promise.resolve('OK')
      });

      const result = await accessibilityChecker.performHealthCheck('https://example.com');

      expect(result.performance).toBeDefined();
      expect(result.performance.responseTime).toBeGreaterThan(0);
      expect(result.performance.contentSize).toBe(2000);
    });
  });
});