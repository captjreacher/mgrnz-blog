import https from 'https';
import http from 'http';
import dns from 'dns';
import tls from 'tls';
import { URL } from 'url';

const dnsPromises = dns.promises;

/**
 * Site Accessibility Checker
 * Validates HTTPS accessibility, DNS resolution, SSL certificates, and response times
 */
class SiteAccessibilityChecker {
  constructor(config = {}) {
    this.config = {
      timeout: config.timeout || 10000,
      userAgent: config.userAgent || 'MonitoringSystem/1.0',
      maxRedirects: config.maxRedirects || 5,
      ...config
    };
  }

  /**
   * Perform comprehensive site accessibility check
   * @param {string} url - The URL to check
   * @param {string} runId - Pipeline run ID for tracking
   * @returns {Promise<Object>} Accessibility check results
   */
  async validateSiteAccess(url, runId) {
    const startTime = Date.now();
    const results = {
      runId,
      url,
      timestamp: new Date().toISOString(),
      checks: {},
      overall: {
        accessible: false,
        responseTime: null,
        errors: []
      }
    };

    try {
      // Parse URL
      const parsedUrl = new URL(url);
      
      // DNS Resolution Check
      results.checks.dns = await this._checkDNSResolution(parsedUrl.hostname);
      
      // SSL Certificate Check (for HTTPS)
      if (parsedUrl.protocol === 'https:') {
        results.checks.ssl = await this._checkSSLCertificate(parsedUrl.hostname, parsedUrl.port || 443);
      }
      
      // HTTP/HTTPS Accessibility Check
      results.checks.http = await this._checkHTTPAccessibility(url);
      
      // Calculate overall results
      const endTime = Date.now();
      results.overall.responseTime = endTime - startTime;
      results.overall.accessible = this._determineOverallAccessibility(results.checks);
      
      if (!results.overall.accessible) {
        results.overall.errors = this._collectErrors(results.checks);
      }

    } catch (error) {
      results.overall.errors.push(`Validation failed: ${error.message}`);
    }

    return results;
  }

  /**
   * Perform a quick health check
   * @param {string} url - The URL to check
   * @returns {Promise<Object>} Health check results
   */
  async performHealthCheck(url = 'https://mgrnz.com') {
    const startTime = Date.now();
    
    try {
      const response = await this._makeHTTPRequest(url, 'HEAD');
      const endTime = Date.now();
      
      return {
        status: response.statusCode >= 200 && response.statusCode < 400 ? 'healthy' : 'unhealthy',
        responseTime: endTime - startTime,
        statusCode: response.statusCode,
        sslValid: url.startsWith('https') ? await this._isSSLValid(new URL(url).hostname) : null,
        contentLength: response.headers['content-length'] || null,
        lastModified: response.headers['last-modified'] || null,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Check DNS resolution for a hostname
   * @private
   */
  async _checkDNSResolution(hostname) {
    const result = {
      hostname,
      resolved: false,
      addresses: [],
      responseTime: null,
      error: null
    };

    const startTime = Date.now();
    
    try {
      const addresses = await dnsPromises.resolve4(hostname);
      result.resolved = true;
      result.addresses = addresses;
      result.responseTime = Date.now() - startTime;
    } catch (error) {
      result.error = error.message;
      result.responseTime = Date.now() - startTime;
    }

    return result;
  }

  /**
   * Check SSL certificate validity
   * @private
   */
  async _checkSSLCertificate(hostname, port = 443) {
    const result = {
      hostname,
      port,
      valid: false,
      certificate: null,
      expiryDate: null,
      daysUntilExpiry: null,
      issuer: null,
      error: null
    };

    return new Promise((resolve) => {
      const socket = tls.connect(port, hostname, { servername: hostname }, () => {
        try {
          const cert = socket.getPeerCertificate();
          
          if (cert && Object.keys(cert).length > 0) {
            result.valid = true;
            result.certificate = {
              subject: cert.subject,
              issuer: cert.issuer,
              validFrom: cert.valid_from,
              validTo: cert.valid_to,
              fingerprint: cert.fingerprint
            };
            
            const expiryDate = new Date(cert.valid_to);
            result.expiryDate = expiryDate.toISOString();
            result.daysUntilExpiry = Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24));
            result.issuer = cert.issuer.CN || cert.issuer.O;
          }
        } catch (error) {
          result.error = error.message;
        }
        
        socket.end();
        resolve(result);
      });

      socket.on('error', (error) => {
        result.error = error.message;
        resolve(result);
      });

      socket.setTimeout(this.config.timeout, () => {
        result.error = 'SSL check timeout';
        socket.destroy();
        resolve(result);
      });
    });
  }

  /**
   * Check HTTP/HTTPS accessibility
   * @private
   */
  async _checkHTTPAccessibility(url) {
    const result = {
      url,
      accessible: false,
      statusCode: null,
      responseTime: null,
      redirects: [],
      finalUrl: url,
      headers: {},
      error: null
    };

    const startTime = Date.now();
    
    try {
      const response = await this._makeHTTPRequest(url, 'GET', 0, result.redirects);
      
      result.accessible = response.statusCode >= 200 && response.statusCode < 400;
      result.statusCode = response.statusCode;
      result.responseTime = Date.now() - startTime;
      result.headers = response.headers;
      result.finalUrl = response.finalUrl || url;
      
    } catch (error) {
      result.error = error.message;
      result.responseTime = Date.now() - startTime;
    }

    return result;
  }

  /**
   * Make HTTP request with redirect handling
   * @private
   */
  _makeHTTPRequest(url, method = 'GET', redirectCount = 0, redirects = []) {
    return new Promise((resolve, reject) => {
      if (redirectCount >= this.config.maxRedirects) {
        return reject(new Error('Too many redirects'));
      }

      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;
      
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method,
        headers: {
          'User-Agent': this.config.userAgent
        },
        timeout: this.config.timeout
      };

      const req = client.request(options, (res) => {
        // Handle redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          redirects.push({
            from: url,
            to: res.headers.location,
            statusCode: res.statusCode
          });
          
          const redirectUrl = new URL(res.headers.location, url).href;
          return this._makeHTTPRequest(redirectUrl, method, redirectCount + 1, redirects)
            .then(resolve)
            .catch(reject);
        }

        // Collect response data for GET requests
        let data = '';
        if (method === 'GET') {
          res.on('data', chunk => data += chunk);
        }
        
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: method === 'GET' ? data : null,
            finalUrl: url,
            redirects
          });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }

  /**
   * Quick SSL validity check
   * @private
   */
  async _isSSLValid(hostname) {
    try {
      const sslResult = await this._checkSSLCertificate(hostname);
      return sslResult.valid && sslResult.daysUntilExpiry > 0;
    } catch {
      return false;
    }
  }

  /**
   * Determine overall accessibility based on individual checks
   * @private
   */
  _determineOverallAccessibility(checks) {
    // DNS must resolve
    if (!checks.dns?.resolved) {
      return false;
    }

    // HTTP must be accessible
    if (!checks.http?.accessible) {
      return false;
    }

    // SSL must be valid for HTTPS sites
    if (checks.ssl && !checks.ssl.valid) {
      return false;
    }

    return true;
  }

  /**
   * Collect all errors from checks
   * @private
   */
  _collectErrors(checks) {
    const errors = [];
    
    if (checks.dns?.error) {
      errors.push(`DNS: ${checks.dns.error}`);
    }
    
    if (checks.ssl?.error) {
      errors.push(`SSL: ${checks.ssl.error}`);
    }
    
    if (checks.http?.error) {
      errors.push(`HTTP: ${checks.http.error}`);
    }

    return errors;
  }
}

export default SiteAccessibilityChecker;