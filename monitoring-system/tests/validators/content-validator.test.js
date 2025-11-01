import { describe, it, expect, beforeEach, vi } from 'vitest';
import ContentValidator from '../../src/validators/content-validator.js';
import { JSDOM } from 'jsdom';

// Mock JSDOM
vi.mock('jsdom', () => ({
  JSDOM: vi.fn()
}));

// Mock Node.js modules
vi.mock('https', () => ({
  default: {
    request: vi.fn()
  }
}));

vi.mock('http', () => ({
  default: {
    request: vi.fn()
  }
}));

describe('ContentValidator', () => {
  let contentValidator;
  let mockConfig;
  let mockRequest;
  let mockResponse;

  beforeEach(() => {
    mockConfig = {
      timeout: 5000,
      baseUrl: 'https://test-site.com',
      userAgent: 'TestAgent/1.0'
    };
    
    contentValidator = new ContentValidator(mockConfig);

    // Mock HTTP request/response
    mockResponse = {
      statusCode: 200,
      headers: { 'content-type': 'text/html' },
      on: vi.fn(),
      data: '<html><head><title>Test Site</title></head><body><h1>Welcome</h1></body></html>'
    };

    mockRequest = {
      on: vi.fn(),
      end: vi.fn(),
      destroy: vi.fn(),
      setTimeout: vi.fn()
    };

    // Reset mocks
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default config when no config provided', () => {
      const defaultValidator = new ContentValidator();
      
      expect(defaultValidator.config.timeout).toBe(15000);
      expect(defaultValidator.config.baseUrl).toBe('https://mgrnz.com');
      expect(defaultValidator.config.userAgent).toBe('MonitoringSystem/1.0');
    });

    it('should initialize with provided config', () => {
      expect(contentValidator.config.timeout).toBe(5000);
      expect(contentValidator.config.baseUrl).toBe('https://test-site.com');
      expect(contentValidator.config.userAgent).toBe('TestAgent/1.0');
    });
  });

  describe('validateDeployedContent', () => {
    it('should validate deployed content successfully', async () => {
      // Mock successful homepage validation
      vi.spyOn(contentValidator, '_validateHomepage').mockResolvedValue({
        accessible: true,
        title: 'Test Site',
        postsFound: 3,
        navigationPresent: true,
        subscriptionFormPresent: true,
        responseTime: 500
      });

      // Mock admin functionality validation
      vi.spyOn(contentValidator, '_validateAdminFunctionality').mockResolvedValue({
        adminPagesAccessible: ['/admin/'],
        adminPagesInaccessible: [],
        overallAccessible: true
      });

      // Mock subscription form validation
      vi.spyOn(contentValidator, '_validateSubscriptionForm').mockResolvedValue({
        formFound: true,
        formAction: 'https://mailerlite.com/subscribe',
        requiredFieldsPresent: true
      });

      // Mock RSS feed validation
      vi.spyOn(contentValidator, '_validateRSSFeed').mockResolvedValue({
        accessible: true,
        validXML: true,
        itemCount: 5
      });

      const result = await contentValidator.validateDeployedContent('test-run-123');

      expect(result.runId).toBe('test-run-123');
      expect(result.validations.homepage.accessible).toBe(true);
      expect(result.validations.adminAccess.overallAccessible).toBe(true);
      expect(result.validations.subscriptionForm.formFound).toBe(true);
      expect(result.validations.rssFeed.accessible).toBe(true);
      expect(result.overall.valid).toBe(true);
      expect(result.overall.errors).toHaveLength(0);
    });

    it('should validate new posts when expected changes provided', async () => {
      const expectedChanges = {
        newPosts: [
          {
            title: 'New Blog Post',
            url: '/posts/new-blog-post/',
            expectedContent: 'This is a new post'
          }
        ]
      };

      // Mock all validation methods
      vi.spyOn(contentValidator, '_validateHomepage').mockResolvedValue({ accessible: true });
      vi.spyOn(contentValidator, '_validateNewPosts').mockResolvedValue({
        expectedCount: 1,
        foundPosts: [{ title: 'New Blog Post', validation: { found: true, accessible: true } }],
        missingPosts: [],
        validationErrors: []
      });
      vi.spyOn(contentValidator, '_validateAdminFunctionality').mockResolvedValue({ overallAccessible: true });
      vi.spyOn(contentValidator, '_validateSubscriptionForm').mockResolvedValue({ formFound: true });
      vi.spyOn(contentValidator, '_validateRSSFeed').mockResolvedValue({ accessible: true });

      const result = await contentValidator.validateDeployedContent('test-run-123', expectedChanges);

      expect(result.validations.newPosts).toBeDefined();
      expect(result.validations.newPosts.expectedCount).toBe(1);
      expect(result.validations.newPosts.foundPosts).toHaveLength(1);
      expect(result.validations.newPosts.missingPosts).toHaveLength(0);
    });

    it('should handle validation failures', async () => {
      // Mock homepage validation failure
      vi.spyOn(contentValidator, '_validateHomepage').mockResolvedValue({
        accessible: false,
        error: 'Homepage returned status 500'
      });

      vi.spyOn(contentValidator, '_validateAdminFunctionality').mockResolvedValue({ overallAccessible: false });
      vi.spyOn(contentValidator, '_validateSubscriptionForm').mockResolvedValue({ formFound: false });
      vi.spyOn(contentValidator, '_validateRSSFeed').mockResolvedValue({ accessible: false });

      const result = await contentValidator.validateDeployedContent('test-run-123');

      expect(result.overall.valid).toBe(false);
      expect(result.overall.errors).toContain('Homepage is not accessible');
      expect(result.overall.warnings.length).toBeGreaterThan(0);
    });

    it('should handle validation exceptions', async () => {
      // Mock validation method throwing error
      vi.spyOn(contentValidator, '_validateHomepage').mockRejectedValue(new Error('Network error'));

      const result = await contentValidator.validateDeployedContent('test-run-123');

      expect(result.overall.errors).toContain('Content validation failed: Network error');
    });
  });

  describe('_validateHomepage', () => {
    it('should validate homepage successfully', async () => {
      const mockHtml = `
        <html>
          <head><title>Test Blog</title></head>
          <body>
            <nav class="navigation">Navigation</nav>
            <article class="post">Post 1</article>
            <article class="post">Post 2</article>
            <form action="https://mailerlite.com/subscribe">
              <input type="email" name="email" />
            </form>
          </body>
        </html>
      `;

      // Mock DOM
      const mockDocument = {
        title: 'Test Blog',
        querySelectorAll: vi.fn()
      };

      mockDocument.querySelectorAll
        .mockReturnValueOnce([{ length: 2 }]) // posts
        .mockReturnValueOnce([{ length: 1 }]) // navigation
        .mockReturnValueOnce([{ length: 1 }]); // subscription form

      JSDOM.mockImplementation(() => ({
        window: { document: mockDocument }
      }));

      // Mock _fetchPage
      vi.spyOn(contentValidator, '_fetchPage').mockResolvedValue({
        statusCode: 200,
        data: mockHtml
      });

      const result = await contentValidator._validateHomepage();

      expect(result.accessible).toBe(true);
      expect(result.title).toBe('Test Blog');
      expect(result.postsFound).toBe(2);
      expect(result.navigationPresent).toBe(true);
      expect(result.subscriptionFormPresent).toBe(true);
      expect(result.responseTime).toBeGreaterThan(0);
    });

    it('should handle homepage accessibility failure', async () => {
      vi.spyOn(contentValidator, '_fetchPage').mockResolvedValue({
        statusCode: 500,
        data: 'Server Error'
      });

      const result = await contentValidator._validateHomepage();

      expect(result.accessible).toBe(false);
      expect(result.error).toBe('Homepage returned status 500');
    });

    it('should handle network errors', async () => {
      vi.spyOn(contentValidator, '_fetchPage').mockRejectedValue(new Error('Network timeout'));

      const result = await contentValidator._validateHomepage();

      expect(result.error).toBe('Network timeout');
      expect(result.responseTime).toBeGreaterThan(0);
    });
  });

  describe('_validateNewPosts', () => {
    it('should validate new posts successfully', async () => {
      const expectedPosts = [
        { title: 'Post 1', url: '/posts/post-1/' },
        { title: 'Post 2', url: '/posts/post-2/' }
      ];

      vi.spyOn(contentValidator, '_validateSinglePost')
        .mockResolvedValueOnce({ found: true, accessible: true, errors: [] })
        .mockResolvedValueOnce({ found: true, accessible: true, errors: [] });

      const result = await contentValidator._validateNewPosts(expectedPosts);

      expect(result.expectedCount).toBe(2);
      expect(result.foundPosts).toHaveLength(2);
      expect(result.missingPosts).toHaveLength(0);
      expect(result.validationErrors).toHaveLength(0);
    });

    it('should detect missing posts', async () => {
      const expectedPosts = [
        { title: 'Post 1', url: '/posts/post-1/' },
        { title: 'Missing Post', url: '/posts/missing/' }
      ];

      vi.spyOn(contentValidator, '_validateSinglePost')
        .mockResolvedValueOnce({ found: true, accessible: true, errors: [] })
        .mockResolvedValueOnce({ found: false, accessible: false, errors: ['Post not found'] });

      const result = await contentValidator._validateNewPosts(expectedPosts);

      expect(result.foundPosts).toHaveLength(1);
      expect(result.missingPosts).toHaveLength(1);
      expect(result.missingPosts[0].title).toBe('Missing Post');
    });

    it('should handle validation errors', async () => {
      const expectedPosts = [{ title: 'Post 1', url: '/posts/post-1/' }];

      vi.spyOn(contentValidator, '_validateSinglePost')
        .mockRejectedValue(new Error('Validation failed'));

      const result = await contentValidator._validateNewPosts(expectedPosts);

      expect(result.validationErrors).toContain('Failed to validate post Post 1: Validation failed');
    });
  });

  describe('_validateSinglePost', () => {
    it('should validate single post successfully', async () => {
      const expectedPost = {
        title: 'Test Post',
        url: '/posts/test-post/',
        expectedContent: 'test content'
      };

      const mockHtml = `
        <html>
          <head><title>Test Post - Blog</title></head>
          <body>
            <article>
              <h1>Test Post</h1>
              <p>This is test content for the post.</p>
              <time datetime="2025-10-28">October 28, 2025</time>
            </article>
          </body>
        </html>
      `;

      // Mock DOM
      const mockDocument = {
        title: 'Test Post - Blog',
        querySelector: vi.fn()
      };

      const mockContentElement = {
        textContent: 'Test Post This is test content for the post.'
      };

      const mockDateElement = {
        textContent: 'October 28, 2025',
        getAttribute: vi.fn().mockReturnValue('2025-10-28')
      };

      mockDocument.querySelector
        .mockReturnValueOnce(mockContentElement) // content element
        .mockReturnValueOnce(mockDateElement); // date element

      JSDOM.mockImplementation(() => ({
        window: { document: mockDocument }
      }));

      vi.spyOn(contentValidator, '_fetchPage').mockResolvedValue({
        statusCode: 200,
        data: mockHtml
      });

      const result = await contentValidator._validateSinglePost(expectedPost);

      expect(result.found).toBe(true);
      expect(result.accessible).toBe(true);
      expect(result.title).toBe('Test Post - Blog');
      expect(result.publishDate).toBe('October 28, 2025');
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing expected content', async () => {
      const expectedPost = {
        title: 'Test Post',
        url: '/posts/test-post/',
        expectedContent: 'missing content'
      };

      const mockDocument = {
        title: 'Test Post',
        querySelector: vi.fn().mockReturnValue({
          textContent: 'This post does not contain the expected content'
        })
      };

      JSDOM.mockImplementation(() => ({
        window: { document: mockDocument }
      }));

      vi.spyOn(contentValidator, '_fetchPage').mockResolvedValue({
        statusCode: 200,
        data: '<html><body>Content</body></html>'
      });

      const result = await contentValidator._validateSinglePost(expectedPost);

      expect(result.found).toBe(true);
      expect(result.errors).toContain('Expected content "missing content" not found in post');
    });

    it('should search for post on site when direct URL fails', async () => {
      const expectedPost = {
        title: 'Test Post',
        url: '/posts/test-post/'
      };

      vi.spyOn(contentValidator, '_fetchPage').mockResolvedValue({
        statusCode: 404,
        data: 'Not Found'
      });

      vi.spyOn(contentValidator, '_searchForPostOnSite').mockResolvedValue({
        found: true,
        accessible: true
      });

      const result = await contentValidator._validateSinglePost(expectedPost);

      expect(result.found).toBe(true);
      expect(result.accessible).toBe(true);
    });
  });

  describe('_validateAdminFunctionality', () => {
    it('should validate admin pages accessibility', async () => {
      vi.spyOn(contentValidator, '_fetchPage')
        .mockResolvedValueOnce({ statusCode: 200 }) // /admin/
        .mockResolvedValueOnce({ statusCode: 200 }) // /admin-dashboard.html
        .mockResolvedValueOnce({ statusCode: 404 }); // /admin-production.html

      const result = await contentValidator._validateAdminFunctionality();

      expect(result.adminPagesAccessible).toContain('/admin/');
      expect(result.adminPagesAccessible).toContain('/admin-dashboard.html');
      expect(result.adminPagesInaccessible).toHaveLength(1);
      expect(result.adminPagesInaccessible[0].page).toBe('/admin-production.html');
      expect(result.overallAccessible).toBe(true);
    });

    it('should handle all admin pages inaccessible', async () => {
      vi.spyOn(contentValidator, '_fetchPage')
        .mockResolvedValue({ statusCode: 404 });

      const result = await contentValidator._validateAdminFunctionality();

      expect(result.adminPagesAccessible).toHaveLength(0);
      expect(result.adminPagesInaccessible).toHaveLength(3);
      expect(result.overallAccessible).toBe(false);
    });

    it('should handle network errors', async () => {
      vi.spyOn(contentValidator, '_fetchPage')
        .mockRejectedValue(new Error('Network error'));

      const result = await contentValidator._validateAdminFunctionality();

      expect(result.adminPagesInaccessible).toHaveLength(3);
      expect(result.adminPagesInaccessible[0].error).toBe('Network error');
    });
  });

  describe('_validateSubscriptionForm', () => {
    it('should find subscription form successfully', async () => {
      const mockHtml = `
        <html>
          <body>
            <form action="https://mailerlite.com/subscribe">
              <input type="email" name="email" required />
              <button type="submit">Subscribe</button>
            </form>
          </body>
        </html>
      `;

      const mockDocument = {
        querySelectorAll: vi.fn().mockReturnValue([
          {
            getAttribute: vi.fn().mockReturnValue('https://mailerlite.com/subscribe'),
            querySelector: vi.fn().mockReturnValue({ type: 'email' })
          }
        ])
      };

      JSDOM.mockImplementation(() => ({
        window: { document: mockDocument }
      }));

      vi.spyOn(contentValidator, '_fetchPage').mockResolvedValue({
        statusCode: 200,
        data: mockHtml
      });

      const result = await contentValidator._validateSubscriptionForm();

      expect(result.formFound).toBe(true);
      expect(result.formAction).toBe('https://mailerlite.com/subscribe');
      expect(result.requiredFieldsPresent).toBe(true);
    });

    it('should handle missing subscription form', async () => {
      const mockDocument = {
        querySelectorAll: vi.fn().mockReturnValue([])
      };

      JSDOM.mockImplementation(() => ({
        window: { document: mockDocument }
      }));

      vi.spyOn(contentValidator, '_fetchPage').mockResolvedValue({
        statusCode: 200,
        data: '<html><body>No forms</body></html>'
      });

      const result = await contentValidator._validateSubscriptionForm();

      expect(result.formFound).toBe(false);
      expect(result.formAction).toBeNull();
      expect(result.requiredFieldsPresent).toBe(false);
    });

    it('should handle network errors', async () => {
      vi.spyOn(contentValidator, '_fetchPage').mockRejectedValue(new Error('Network timeout'));

      const result = await contentValidator._validateSubscriptionForm();

      expect(result.error).toBe('Network timeout');
    });
  });

  describe('_validateRSSFeed', () => {
    it('should validate RSS feed successfully', async () => {
      const mockXml = `
        <?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <title>Test Blog</title>
            <item><title>Post 1</title></item>
            <item><title>Post 2</title></item>
          </channel>
        </rss>
      `;

      const mockDocument = {
        querySelectorAll: vi.fn().mockReturnValue([{}, {}]) // 2 items
      };

      JSDOM.mockImplementation(() => ({
        window: { document: mockDocument }
      }));

      vi.spyOn(contentValidator, '_fetchPage').mockResolvedValue({
        statusCode: 200,
        data: mockXml
      });

      const result = await contentValidator._validateRSSFeed();

      expect(result.accessible).toBe(true);
      expect(result.validXML).toBe(true);
      expect(result.itemCount).toBe(2);
    });

    it('should handle RSS feed not accessible', async () => {
      vi.spyOn(contentValidator, '_fetchPage').mockResolvedValue({
        statusCode: 404,
        data: 'Not Found'
      });

      const result = await contentValidator._validateRSSFeed();

      expect(result.accessible).toBe(false);
      expect(result.error).toBe('RSS feed returned status 404');
    });

    it('should handle invalid XML', async () => {
      JSDOM.mockImplementation(() => {
        throw new Error('Invalid XML structure');
      });

      vi.spyOn(contentValidator, '_fetchPage').mockResolvedValue({
        statusCode: 200,
        data: 'Invalid XML content'
      });

      const result = await contentValidator._validateRSSFeed();

      expect(result.accessible).toBe(true);
      expect(result.validXML).toBe(false);
      expect(result.error).toContain('Invalid XML');
    });
  });

  describe('_searchForPostOnSite', () => {
    it('should find post on homepage', async () => {
      const expectedPost = { title: 'Test Post' };

      const mockDocument = {
        querySelectorAll: vi.fn()
      };

      const mockLink = {
        textContent: 'Test Post - Read More',
        tagName: 'A',
        href: '/posts/test-post/'
      };

      mockDocument.querySelectorAll
        .mockReturnValueOnce([mockLink]) // links
        .mockReturnValueOnce([]); // headings

      JSDOM.mockImplementation(() => ({
        window: { document: mockDocument }
      }));

      vi.spyOn(contentValidator, '_fetchPage')
        .mockResolvedValueOnce({ statusCode: 200, data: '<html></html>' }) // homepage
        .mockResolvedValueOnce({ statusCode: 200, data: '<html></html>' }); // post page

      const result = await contentValidator._searchForPostOnSite(expectedPost);

      expect(result.found).toBe(true);
      expect(result.accessible).toBe(true);
    });

    it('should find post on posts page', async () => {
      const expectedPost = { title: 'Test Post' };

      const mockDocument = {
        querySelectorAll: vi.fn().mockReturnValue([]),
        body: { textContent: 'Welcome to our blog. Test Post is available here.' }
      };

      JSDOM.mockImplementation(() => ({
        window: { document: mockDocument }
      }));

      vi.spyOn(contentValidator, '_fetchPage')
        .mockResolvedValueOnce({ statusCode: 200, data: '<html></html>' }) // homepage
        .mockResolvedValueOnce({ statusCode: 200, data: '<html></html>' }); // posts page

      const result = await contentValidator._searchForPostOnSite(expectedPost);

      expect(result.found).toBe(true);
    });

    it('should return not found when post not located', async () => {
      const expectedPost = { title: 'Missing Post' };

      const mockDocument = {
        querySelectorAll: vi.fn().mockReturnValue([]),
        body: { textContent: 'No matching content' }
      };

      JSDOM.mockImplementation(() => ({
        window: { document: mockDocument }
      }));

      vi.spyOn(contentValidator, '_fetchPage')
        .mockResolvedValue({ statusCode: 200, data: '<html></html>' });

      const result = await contentValidator._searchForPostOnSite(expectedPost);

      expect(result.found).toBe(false);
      expect(result.accessible).toBe(false);
    });
  });

  describe('_determineOverallValidation', () => {
    it('should return valid when all validations pass', () => {
      const validations = {
        homepage: { accessible: true },
        newPosts: { missingPosts: [], validationErrors: [] },
        adminAccess: { overallAccessible: true },
        subscriptionForm: { formFound: true },
        rssFeed: { accessible: true }
      };

      const result = contentValidator._determineOverallValidation(validations);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should return invalid when homepage not accessible', () => {
      const validations = {
        homepage: { accessible: false },
        adminAccess: { overallAccessible: true },
        subscriptionForm: { formFound: true },
        rssFeed: { accessible: true }
      };

      const result = contentValidator._determineOverallValidation(validations);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Homepage is not accessible');
    });

    it('should return invalid when posts are missing', () => {
      const validations = {
        homepage: { accessible: true },
        newPosts: { 
          missingPosts: [{ title: 'Missing Post' }], 
          validationErrors: ['Content mismatch'] 
        },
        adminAccess: { overallAccessible: true },
        subscriptionForm: { formFound: true },
        rssFeed: { accessible: true }
      };

      const result = contentValidator._determineOverallValidation(validations);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('1 expected posts not found');
      expect(result.warnings).toContain('Content mismatch');
    });

    it('should include warnings for non-critical issues', () => {
      const validations = {
        homepage: { accessible: true },
        adminAccess: { overallAccessible: false },
        subscriptionForm: { formFound: false },
        rssFeed: { accessible: false }
      };

      const result = contentValidator._determineOverallValidation(validations);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Admin functionality may not be accessible');
      expect(result.warnings).toContain('Subscription form not found on homepage');
      expect(result.warnings).toContain('RSS feed is not accessible');
    });
  });

  describe('error handling', () => {
    it('should handle network timeouts gracefully', async () => {
      vi.spyOn(contentValidator, '_fetchPage').mockRejectedValue(new Error('Request timeout'));

      const result = await contentValidator._validateHomepage();

      expect(result.error).toBe('Request timeout');
      expect(result.responseTime).toBeGreaterThan(0);
    });

    it('should handle invalid URLs', async () => {
      vi.spyOn(contentValidator, '_fetchPage').mockRejectedValue(new Error('Invalid URL'));

      const result = await contentValidator._validateHomepage();

      expect(result.error).toBe('Invalid URL');
    });

    it('should handle DOM parsing errors', async () => {
      JSDOM.mockImplementation(() => {
        throw new Error('DOM parsing failed');
      });

      vi.spyOn(contentValidator, '_fetchPage').mockResolvedValue({
        statusCode: 200,
        data: '<html></html>'
      });

      const result = await contentValidator._validateHomepage();

      expect(result.error).toBe('DOM parsing failed');
    });
  });
});