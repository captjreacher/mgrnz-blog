import https from 'https';
import http from 'http';
import { URL } from 'url';
import { JSDOM } from 'jsdom';

/**
 * Content Validator
 * Validates deployed content matches expectations and verifies new posts appear correctly
 */
class ContentValidator {
  constructor(config = {}) {
    this.config = {
      timeout: config.timeout || 15000,
      userAgent: config.userAgent || 'MonitoringSystem/1.0',
      baseUrl: config.baseUrl || 'https://mgrnz.com',
      ...config
    };
  }

  /**
   * Validate deployed content against expected changes
   * @param {string} runId - Pipeline run ID for tracking
   * @param {Object} expectedChanges - Expected content changes
   * @returns {Promise<Object>} Content validation results
   */
  async validateDeployedContent(runId, expectedChanges = {}) {
    const results = {
      runId,
      timestamp: new Date().toISOString(),
      validations: {},
      overall: {
        valid: false,
        errors: [],
        warnings: []
      }
    };

    try {
      // Validate homepage accessibility
      results.validations.homepage = await this._validateHomepage();
      
      // Validate new posts if specified
      if (expectedChanges.newPosts && expectedChanges.newPosts.length > 0) {
        results.validations.newPosts = await this._validateNewPosts(expectedChanges.newPosts);
      }
      
      // Validate admin functionality
      results.validations.adminAccess = await this._validateAdminFunctionality();
      
      // Validate subscription form
      results.validations.subscriptionForm = await this._validateSubscriptionForm();
      
      // Validate RSS feed
      results.validations.rssFeed = await this._validateRSSFeed();
      
      // Determine overall validation status
      results.overall = this._determineOverallValidation(results.validations);
      
    } catch (error) {
      results.overall.errors.push(`Content validation failed: ${error.message}`);
    }

    return results;
  }

  /**
   * Validate homepage content and structure
   * @private
   */
  async _validateHomepage() {
    const result = {
      accessible: false,
      title: null,
      postsFound: 0,
      navigationPresent: false,
      subscriptionFormPresent: false,
      responseTime: null,
      error: null
    };

    const startTime = Date.now();
    
    try {
      const response = await this._fetchPage(this.config.baseUrl);
      result.responseTime = Date.now() - startTime;
      
      if (response.statusCode !== 200) {
        result.error = `Homepage returned status ${response.statusCode}`;
        return result;
      }

      const dom = new JSDOM(response.data);
      const document = dom.window.document;
      
      // Check basic page structure
      result.accessible = true;
      result.title = document.title;
      
      // Count blog posts on homepage
      const postElements = document.querySelectorAll('article, .post, [class*="post"]');
      result.postsFound = postElements.length;
      
      // Check for navigation
      const navElements = document.querySelectorAll('nav, .navigation, .menu');
      result.navigationPresent = navElements.length > 0;
      
      // Check for subscription form
      const subscriptionElements = document.querySelectorAll('form[action*="mailerlite"], .subscription-form, #subscription');
      result.subscriptionFormPresent = subscriptionElements.length > 0;
      
    } catch (error) {
      result.error = error.message;
      result.responseTime = Date.now() - startTime;
    }

    return result;
  }

  /**
   * Validate new posts appear correctly
   * @private
   */
  async _validateNewPosts(expectedPosts) {
    const result = {
      expectedCount: expectedPosts.length,
      foundPosts: [],
      missingPosts: [],
      validationErrors: []
    };

    for (const expectedPost of expectedPosts) {
      try {
        const postValidation = await this._validateSinglePost(expectedPost);
        
        if (postValidation.found) {
          result.foundPosts.push({
            ...expectedPost,
            validation: postValidation
          });
        } else {
          result.missingPosts.push(expectedPost);
        }
        
        if (postValidation.errors.length > 0) {
          result.validationErrors.push(...postValidation.errors);
        }
        
      } catch (error) {
        result.validationErrors.push(`Failed to validate post ${expectedPost.title}: ${error.message}`);
      }
    }

    return result;
  }

  /**
   * Validate a single post
   * @private
   */
  async _validateSinglePost(expectedPost) {
    const result = {
      found: false,
      accessible: false,
      title: null,
      content: null,
      publishDate: null,
      errors: []
    };

    try {
      // Try to access the post URL directly if provided
      if (expectedPost.url) {
        const postUrl = expectedPost.url.startsWith('http') 
          ? expectedPost.url 
          : `${this.config.baseUrl}${expectedPost.url}`;
          
        const response = await this._fetchPage(postUrl);
        
        if (response.statusCode === 200) {
          result.found = true;
          result.accessible = true;
          
          const dom = new JSDOM(response.data);
          const document = dom.window.document;
          
          result.title = document.title;
          
          // Extract post content
          const contentElement = document.querySelector('article, .post-content, .content, main');
          result.content = contentElement ? contentElement.textContent.trim().substring(0, 500) : null;
          
          // Extract publish date
          const dateElement = document.querySelector('time, .date, .publish-date');
          result.publishDate = dateElement ? dateElement.textContent || dateElement.getAttribute('datetime') : null;
          
          // Validate expected content if provided
          if (expectedPost.expectedContent) {
            const contentMatch = result.content && result.content.toLowerCase().includes(expectedPost.expectedContent.toLowerCase());
            if (!contentMatch) {
              result.errors.push(`Expected content "${expectedPost.expectedContent}" not found in post`);
            }
          }
        }
      }
      
      // If direct URL access failed, search for post on homepage/posts page
      if (!result.found) {
        const searchResult = await this._searchForPostOnSite(expectedPost);
        if (searchResult.found) {
          result.found = true;
          result.accessible = searchResult.accessible;
        }
      }
      
    } catch (error) {
      result.errors.push(error.message);
    }

    return result;
  }

  /**
   * Search for a post on the site
   * @private
   */
  async _searchForPostOnSite(expectedPost) {
    const result = {
      found: false,
      accessible: false
    };

    try {
      // Check homepage for post
      const homepageResponse = await this._fetchPage(this.config.baseUrl);
      if (homepageResponse.statusCode === 200) {
        const dom = new JSDOM(homepageResponse.data);
        const document = dom.window.document;
        
        // Look for post title in links or headings
        const links = document.querySelectorAll('a');
        const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        
        for (const element of [...links, ...headings]) {
          if (element.textContent.toLowerCase().includes(expectedPost.title.toLowerCase())) {
            result.found = true;
            
            // If it's a link, try to access it
            if (element.tagName === 'A' && element.href) {
              const postUrl = new URL(element.href, this.config.baseUrl).href;
              const postResponse = await this._fetchPage(postUrl);
              result.accessible = postResponse.statusCode === 200;
            }
            break;
          }
        }
      }
      
      // Also check posts page if it exists
      try {
        const postsPageResponse = await this._fetchPage(`${this.config.baseUrl}/posts/`);
        if (postsPageResponse.statusCode === 200) {
          const dom = new JSDOM(postsPageResponse.data);
          const document = dom.window.document;
          
          const pageText = document.body.textContent.toLowerCase();
          if (pageText.includes(expectedPost.title.toLowerCase())) {
            result.found = true;
          }
        }
      } catch {
        // Posts page might not exist, continue
      }
      
    } catch (error) {
      // Search failed, but don't throw - just return not found
    }

    return result;
  }

  /**
   * Validate admin functionality accessibility
   * @private
   */
  async _validateAdminFunctionality() {
    const result = {
      adminPagesAccessible: [],
      adminPagesInaccessible: [],
      overallAccessible: false
    };

    const adminPages = [
      '/admin/',
      '/admin-dashboard.html',
      '/admin-production.html'
    ];

    for (const page of adminPages) {
      try {
        const url = `${this.config.baseUrl}${page}`;
        const response = await this._fetchPage(url);
        
        if (response.statusCode === 200) {
          result.adminPagesAccessible.push(page);
        } else {
          result.adminPagesInaccessible.push({
            page,
            statusCode: response.statusCode
          });
        }
      } catch (error) {
        result.adminPagesInaccessible.push({
          page,
          error: error.message
        });
      }
    }

    result.overallAccessible = result.adminPagesAccessible.length > 0;
    return result;
  }

  /**
   * Validate subscription form functionality
   * @private
   */
  async _validateSubscriptionForm() {
    const result = {
      formFound: false,
      formAction: null,
      requiredFieldsPresent: false,
      error: null
    };

    try {
      const response = await this._fetchPage(this.config.baseUrl);
      
      if (response.statusCode === 200) {
        const dom = new JSDOM(response.data);
        const document = dom.window.document;
        
        // Look for subscription forms
        const forms = document.querySelectorAll('form');
        
        for (const form of forms) {
          const action = form.getAttribute('action');
          if (action && (action.includes('mailerlite') || action.includes('subscribe'))) {
            result.formFound = true;
            result.formAction = action;
            
            // Check for email input
            const emailInput = form.querySelector('input[type="email"], input[name*="email"]');
            result.requiredFieldsPresent = !!emailInput;
            break;
          }
        }
      }
    } catch (error) {
      result.error = error.message;
    }

    return result;
  }

  /**
   * Validate RSS feed
   * @private
   */
  async _validateRSSFeed() {
    const result = {
      accessible: false,
      validXML: false,
      itemCount: 0,
      error: null
    };

    try {
      const rssUrl = `${this.config.baseUrl}/index.xml`;
      const response = await this._fetchPage(rssUrl);
      
      if (response.statusCode === 200) {
        result.accessible = true;
        
        // Basic XML validation
        try {
          const dom = new JSDOM(response.data, { contentType: 'text/xml' });
          const document = dom.window.document;
          
          // Check for RSS structure
          const items = document.querySelectorAll('item');
          result.itemCount = items.length;
          result.validXML = items.length > 0;
          
        } catch (xmlError) {
          result.error = `Invalid XML: ${xmlError.message}`;
        }
      } else {
        result.error = `RSS feed returned status ${response.statusCode}`;
      }
    } catch (error) {
      result.error = error.message;
    }

    return result;
  }

  /**
   * Fetch a web page
   * @private
   */
  _fetchPage(url) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;
      
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
          'User-Agent': this.config.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: this.config.timeout
      };

      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data
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
   * Determine overall validation status
   * @private
   */
  _determineOverallValidation(validations) {
    const result = {
      valid: true,
      errors: [],
      warnings: []
    };

    // Homepage must be accessible
    if (!validations.homepage?.accessible) {
      result.valid = false;
      result.errors.push('Homepage is not accessible');
    }

    // Check for new post validation issues
    if (validations.newPosts) {
      if (validations.newPosts.missingPosts.length > 0) {
        result.valid = false;
        result.errors.push(`${validations.newPosts.missingPosts.length} expected posts not found`);
      }
      
      if (validations.newPosts.validationErrors.length > 0) {
        result.warnings.push(...validations.newPosts.validationErrors);
      }
    }

    // Admin functionality warnings
    if (validations.adminAccess && !validations.adminAccess.overallAccessible) {
      result.warnings.push('Admin functionality may not be accessible');
    }

    // Subscription form warnings
    if (validations.subscriptionForm && !validations.subscriptionForm.formFound) {
      result.warnings.push('Subscription form not found on homepage');
    }

    // RSS feed warnings
    if (validations.rssFeed && !validations.rssFeed.accessible) {
      result.warnings.push('RSS feed is not accessible');
    }

    return result;
  }
}

export default ContentValidator;