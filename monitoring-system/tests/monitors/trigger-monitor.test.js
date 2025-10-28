import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TriggerMonitor } from '../../src/monitors/trigger-monitor.js';
import { TestCycleEngine } from '../../src/core/test-cycle-engine.js';
import { execSync } from 'child_process';

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

// Mock fs promises
vi.mock('fs', () => ({
  promises: {
    stat: vi.fn()
  }
}));

describe('TriggerMonitor', () => {
  let triggerMonitor;
  let mockEngine;
  let mockConfig;

  beforeEach(() => {
    // Create mock engine
    mockEngine = {
      createPipelineRun: vi.fn().mockResolvedValue('test-run-id'),
      updatePipelineStage: vi.fn().mockResolvedValue(),
      addError: vi.fn().mockResolvedValue()
    };

    mockConfig = {
      gitMonitorInterval: 1000,
      githubMonitorInterval: 2000
    };

    triggerMonitor = new TriggerMonitor(mockEngine, mockConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully with valid git repository', async () => {
      execSync.mockReturnValue('abc123def456\n');

      const result = await triggerMonitor.initialize();

      expect(result).toBe(true);
      expect(triggerMonitor.lastCheckedCommit).toBe('abc123def456');
      expect(execSync).toHaveBeenCalledWith('git rev-parse HEAD', {
        encoding: 'utf8',
        cwd: process.cwd()
      });
    });

    it('should throw error if git repository is not available', async () => {
      execSync.mockImplementation(() => {
        throw new Error('Not a git repository');
      });

      await expect(triggerMonitor.initialize()).rejects.toThrow('Failed to get latest commit hash');
    });
  });

  describe('trigger detection', () => {
    beforeEach(async () => {
      execSync.mockReturnValue('abc123def456\n');
      await triggerMonitor.initialize();
    });

    it('should detect manual trigger correctly', async () => {
      const runId = await triggerMonitor.detectTrigger('manual', 'admin_interface', {
        userId: 'test-user',
        action: 'deploy_now'
      });

      expect(runId).toBe('test-run-id');
      expect(mockEngine.createPipelineRun).toHaveBeenCalledWith({
        type: 'manual',
        source: 'admin_interface',
        timestamp: expect.any(String),
        metadata: {
          userId: 'test-user',
          action: 'deploy_now'
        }
      });
      expect(mockEngine.updatePipelineStage).toHaveBeenCalledWith(
        'test-run-id',
        'trigger_detected',
        'completed',
        expect.objectContaining({
          triggerType: 'manual',
          triggerSource: 'admin_interface'
        })
      );
    });

    it('should detect git trigger correctly', async () => {
      const runId = await triggerMonitor.detectTrigger('git', 'commit', {
        commitHash: 'def456ghi789',
        author: 'Test Author',
        message: 'Test commit'
      });

      expect(runId).toBe('test-run-id');
      expect(mockEngine.createPipelineRun).toHaveBeenCalledWith({
        type: 'git',
        source: 'commit',
        timestamp: expect.any(String),
        metadata: {
          commitHash: 'def456ghi789',
          author: 'Test Author',
          message: 'Test commit'
        }
      });
    });

    it('should detect webhook trigger correctly', async () => {
      const runId = await triggerMonitor.detectTrigger('webhook', 'mailerlite', {
        eventType: 'subscriber.created',
        subscriberEmail: 'test@example.com'
      });

      expect(runId).toBe('test-run-id');
      expect(mockEngine.createPipelineRun).toHaveBeenCalledWith({
        type: 'webhook',
        source: 'mailerlite',
        timestamp: expect.any(String),
        metadata: {
          eventType: 'subscriber.created',
          subscriberEmail: 'test@example.com'
        }
      });
    });

    it('should handle trigger detection errors gracefully', async () => {
      mockEngine.createPipelineRun.mockRejectedValue(new Error('Engine error'));

      await expect(triggerMonitor.detectTrigger('manual', 'test')).rejects.toThrow('Engine error');
    });
  });

  describe('git monitoring', () => {
    beforeEach(async () => {
      execSync.mockReturnValue('abc123def456\n');
      await triggerMonitor.initialize();
    });

    it('should detect new commits', async () => {
      // Mock git commands for commit detection
      execSync
        .mockReturnValueOnce('def456ghi789\n') // New commit hash
        .mockReturnValueOnce('Test Author|test@example.com|Test commit message|2025-10-28 12:00:00 +0000') // Commit info
        .mockReturnValueOnce('main\n'); // Current branch

      await triggerMonitor._checkForGitTriggers();

      expect(mockEngine.createPipelineRun).toHaveBeenCalledWith({
        type: 'git',
        source: 'commit',
        timestamp: expect.any(String),
        metadata: {
          commitHash: 'def456ghi789',
          previousCommit: 'abc123def456',
          author: 'Test Author',
          message: 'Test commit message',
          timestamp: '2025-10-28 12:00:00 +0000',
          branch: 'main'
        }
      });
      expect(triggerMonitor.lastCheckedCommit).toBe('def456ghi789');
    });

    it('should not trigger on same commit', async () => {
      execSync.mockReturnValue('abc123def456\n'); // Same commit

      await triggerMonitor._checkForGitTriggers();

      expect(mockEngine.createPipelineRun).not.toHaveBeenCalled();
    });

    it('should handle git command errors gracefully', async () => {
      execSync.mockImplementation(() => {
        throw new Error('Git command failed');
      });

      // Should not throw, just log error
      await expect(triggerMonitor._checkForGitTriggers()).resolves.toBeUndefined();
      expect(mockEngine.createPipelineRun).not.toHaveBeenCalled();
    });
  });

  describe('webhook processing', () => {
    beforeEach(async () => {
      execSync.mockReturnValue('abc123def456\n');
      await triggerMonitor.initialize();
    });

    it('should register webhook listeners', () => {
      const mockCallback = vi.fn();
      
      triggerMonitor.registerWebhookListener('mailerlite', mockCallback);
      
      expect(triggerMonitor.webhookListeners.has('mailerlite')).toBe(true);
      expect(triggerMonitor.webhookListeners.get('mailerlite')).toBe(mockCallback);
    });

    it('should process webhook triggers with registered listener', async () => {
      const mockCallback = vi.fn().mockResolvedValue();
      const payload = { type: 'subscriber.created', data: { email: 'test@example.com' } };
      const headers = { 'content-type': 'application/json', 'user-agent': 'MailerLite-Webhook' };

      triggerMonitor.registerWebhookListener('mailerlite', mockCallback);

      const runId = await triggerMonitor.processWebhookTrigger('mailerlite', payload, headers);

      expect(runId).toBe('test-run-id');
      expect(mockEngine.createPipelineRun).toHaveBeenCalledWith({
        type: 'webhook',
        source: 'mailerlite',
        timestamp: expect.any(String),
        metadata: {
          webhookType: 'mailerlite',
          payload: payload,
          headers: headers,
          userAgent: 'MailerLite-Webhook',
          contentType: 'application/json'
        }
      });
      expect(mockCallback).toHaveBeenCalledWith('test-run-id', payload, headers);
    });

    it('should return null for unregistered webhook types', async () => {
      const payload = { type: 'test' };
      
      const runId = await triggerMonitor.processWebhookTrigger('unknown', payload);
      
      expect(runId).toBeNull();
      expect(mockEngine.createPipelineRun).not.toHaveBeenCalled();
    });

    it('should sanitize sensitive data in webhook payloads', async () => {
      const mockCallback = vi.fn().mockResolvedValue();
      const payload = {
        type: 'test',
        password: 'secret123',
        token: 'abc123',
        data: { email: 'test@example.com' }
      };

      triggerMonitor.registerWebhookListener('test', mockCallback);

      await triggerMonitor.processWebhookTrigger('test', payload);

      const createCall = mockEngine.createPipelineRun.mock.calls[0][0];
      expect(createCall.metadata.payload.password).toBe('[REDACTED]');
      expect(createCall.metadata.payload.token).toBe('[REDACTED]');
      expect(createCall.metadata.payload.data.email).toBe('test@example.com');
    });

    it('should sanitize sensitive data in headers', async () => {
      const mockCallback = vi.fn().mockResolvedValue();
      const payload = { type: 'test' };
      const headers = {
        'authorization': 'Bearer secret-token',
        'x-api-key': 'api-key-123',
        'content-type': 'application/json'
      };

      triggerMonitor.registerWebhookListener('test', mockCallback);

      await triggerMonitor.processWebhookTrigger('test', payload, headers);

      const createCall = mockEngine.createPipelineRun.mock.calls[0][0];
      expect(createCall.metadata.headers.authorization).toBe('[REDACTED]');
      expect(createCall.metadata.headers['x-api-key']).toBe('[REDACTED]');
      expect(createCall.metadata.headers['content-type']).toBe('application/json');
    });
  });

  describe('monitoring lifecycle', () => {
    beforeEach(async () => {
      execSync.mockReturnValue('abc123def456\n');
      await triggerMonitor.initialize();
    });

    it('should start monitoring successfully', async () => {
      await triggerMonitor.startMonitoring();

      expect(triggerMonitor.isMonitoring).toBe(true);
      expect(triggerMonitor.monitoringInterval).toBeDefined();
    });

    it('should not start monitoring if already running', async () => {
      await triggerMonitor.startMonitoring();
      const firstInterval = triggerMonitor.monitoringInterval;

      await triggerMonitor.startMonitoring();

      expect(triggerMonitor.monitoringInterval).toBe(firstInterval);
    });

    it('should stop monitoring successfully', async () => {
      await triggerMonitor.startMonitoring();
      
      await triggerMonitor.stopMonitoring();

      expect(triggerMonitor.isMonitoring).toBe(false);
      expect(triggerMonitor.monitoringInterval).toBeNull();
      expect(triggerMonitor.webhookListeners.size).toBe(0);
    });

    it('should not stop monitoring if not running', async () => {
      await triggerMonitor.stopMonitoring();

      expect(triggerMonitor.isMonitoring).toBe(false);
    });
  });

  describe('GitHub Actions monitoring', () => {
    beforeEach(async () => {
      execSync.mockReturnValue('abc123def456\n');
      await triggerMonitor.initialize();
      
      // Mock fs.promises.stat
      const fs = await import('fs');
      fs.promises.stat.mockResolvedValue({
        mtime: new Date(Date.now() - 60000) // 1 minute ago
      });
    });

    it('should detect file system changes as manual triggers', async () => {
      const fs = await import('fs');
      fs.promises.stat.mockResolvedValue({
        mtime: new Date(Date.now() - 30000) // 30 seconds ago (recent)
      });

      await triggerMonitor._checkForGitHubActionsTriggers();

      expect(mockEngine.createPipelineRun).toHaveBeenCalledWith({
        type: 'manual',
        source: 'github_actions_dispatch',
        timestamp: expect.any(String),
        metadata: {
          markerFile: 'deployment-timestamp.txt',
          detectionMethod: 'file_system_change',
          timestamp: expect.any(String)
        }
      });
    });

    it('should not trigger on old file changes', async () => {
      const fs = await import('fs');
      fs.promises.stat.mockResolvedValue({
        mtime: new Date(Date.now() - 600000) // 10 minutes ago (old)
      });

      await triggerMonitor._checkForGitHubActionsTriggers();

      expect(mockEngine.createPipelineRun).not.toHaveBeenCalled();
    });

    it('should handle file access errors gracefully', async () => {
      const fs = await import('fs');
      fs.promises.stat.mockRejectedValue(new Error('File not found'));

      await expect(triggerMonitor._checkForGitHubActionsTriggers()).resolves.toBeUndefined();
      expect(mockEngine.createPipelineRun).not.toHaveBeenCalled();
    });
  });
});