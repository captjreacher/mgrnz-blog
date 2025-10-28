import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BuildProcessTracker } from '../../src/monitors/build-process-tracker.js';

describe('BuildProcessTracker', () => {
  let buildTracker;
  let mockEngine;
  let mockConfig;

  beforeEach(() => {
    // Create mock engine
    mockEngine = {
      updatePipelineStage: vi.fn().mockResolvedValue(),
      addError: vi.fn().mockResolvedValue()
    };

    mockConfig = {};

    buildTracker = new BuildProcessTracker(mockEngine, mockConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const result = await buildTracker.initialize();

      expect(result).toBe(true);
    });
  });

  describe('build process tracking', () => {
    it('should track build process successfully', async () => {
      const workflowRun = {
        id: 123,
        status: 'completed',
        conclusion: 'success'
      };

      const jobs = [
        {
          id: 1,
          name: 'build-hugo',
          status: 'completed',
          conclusion: 'success',
          started_at: '2025-10-28T12:01:00Z',
          completed_at: '2025-10-28T12:03:00Z',
          steps: [{ name: 'Setup Hugo' }, { name: 'Build Site' }]
        },
        {
          id: 2,
          name: 'deploy-pages',
          status: 'completed',
          conclusion: 'success',
          started_at: '2025-10-28T12:03:00Z',
          completed_at: '2025-10-28T12:05:00Z',
          steps: [{ name: 'Deploy to Pages' }]
        }
      ];

      const result = await buildTracker.trackBuildProcess('test-run-id', workflowRun, jobs);

      expect(result.success).toBe(true);
      expect(result.buildAnalysis.totalJobs).toBe(2);
      expect(result.buildAnalysis.buildJobs).toHaveLength(1);
      expect(result.buildAnalysis.deployJobs).toHaveLength(1);
      expect(result.logAnalysis.buildSteps).toHaveLength(5); // Simulated Hugo steps
      expect(result.artifactAnalysis.artifactsFound).toBeGreaterThan(0);
      expect(result.deploymentAnalysis.deploymentJobs).toHaveLength(1);

      expect(mockEngine.updatePipelineStage).toHaveBeenCalledWith(
        'test-run-id',
        'build_tracking_started',
        'running',
        expect.objectContaining({
          workflowRunId: 123
        })
      );

      expect(mockEngine.updatePipelineStage).toHaveBeenCalledWith(
        'test-run-id',
        'build_tracking_completed',
        'completed',
        expect.objectContaining({
          result: expect.any(Object)
        })
      );
    });

    it('should handle build tracking failures', async () => {
      const workflowRun = null; // Invalid input to cause error

      await expect(buildTracker.trackBuildProcess('test-run-id', workflowRun, [])).rejects.toThrow();

      expect(mockEngine.updatePipelineStage).toHaveBeenCalledWith(
        'test-run-id',
        'build_tracking_failed',
        'failed',
        expect.objectContaining({
          error: expect.any(String)
        })
      );
    });

    it('should track failed builds correctly', async () => {
      const workflowRun = {
        id: 123,
        status: 'completed',
        conclusion: 'failure'
      };

      const jobs = [
        {
          id: 1,
          name: 'build-hugo',
          status: 'completed',
          conclusion: 'failure',
          started_at: '2025-10-28T12:01:00Z',
          completed_at: '2025-10-28T12:03:00Z',
          steps: [{ name: 'Setup Hugo' }, { name: 'Build Site' }]
        }
      ];

      const result = await buildTracker.trackBuildProcess('test-run-id', workflowRun, jobs);

      expect(result.success).toBe(false);
      expect(result.buildAnalysis.success).toBe(false);
      expect(result.buildAnalysis.errors).toHaveLength(1);
      expect(result.buildAnalysis.errors[0].job).toBe('build-hugo');
    });
  });

  describe('build log analysis', () => {
    it('should analyze Hugo build logs correctly', () => {
      const logs = `
        2025-10-28T12:01:00Z Starting Hugo build...
        2025-10-28T12:01:30Z hugo: Building site
        2025-10-28T12:02:00Z hugo: Generating pages
        2025-10-28T12:02:30Z hugo: Build complete in 1.5s
        2025-10-28T12:03:00Z Build finished successfully
      `;

      const analysis = buildTracker.analyzeBuildLogs(logs);

      expect(analysis.success).toBe(true);
      expect(analysis.buildSteps.length).toBeGreaterThan(0);
      expect(analysis.errors).toHaveLength(0);
      expect(analysis.warnings).toHaveLength(0);
      expect(analysis.performance).toBeDefined();
    });

    it('should detect build errors in logs', () => {
      const logs = `
        2025-10-28T12:01:00Z Starting Hugo build...
        2025-10-28T12:01:30Z ERROR: Failed to parse template
        2025-10-28T12:02:00Z Build failed with errors
      `;

      const analysis = buildTracker.analyzeBuildLogs(logs);

      expect(analysis.success).toBe(false);
      expect(analysis.errors.length).toBeGreaterThan(0);
      expect(analysis.errors[0].type).toBe('build_error');
      expect(analysis.errors[0].message).toContain('ERROR: Failed to parse template');
    });

    it('should detect build warnings in logs', () => {
      const logs = `
        2025-10-28T12:01:00Z Starting Hugo build...
        2025-10-28T12:01:30Z WARNING: Deprecated shortcode used
        2025-10-28T12:02:00Z Build completed with warnings
      `;

      const analysis = buildTracker.analyzeBuildLogs(logs);

      expect(analysis.warnings.length).toBeGreaterThan(0);
      expect(analysis.warnings[0].type).toBe('build_warning');
      expect(analysis.warnings[0].message).toContain('WARNING: Deprecated shortcode used');
    });

    it('should handle empty or invalid logs', () => {
      const analysis1 = buildTracker.analyzeBuildLogs('');
      const analysis2 = buildTracker.analyzeBuildLogs(null);
      const analysis3 = buildTracker.analyzeBuildLogs(undefined);

      expect(analysis1.buildSteps).toHaveLength(0);
      expect(analysis2.buildSteps).toHaveLength(0);
      expect(analysis3.buildSteps).toHaveLength(0);
    });
  });

  describe('build timing extraction', () => {
    it('should extract timing information from logs', () => {
      const logs = `
        2025-10-28T12:01:00Z Step 1/5 : Setup Hugo
        2025-10-28T12:01:30Z Step 2/5 : Install dependencies
        2025-10-28T12:02:00Z Step 3/5 : Build site
        2025-10-28T12:04:00Z Step 4/5 : Generate static files
        2025-10-28T12:04:30Z Step 5/5 : Deploy to pages
        2025-10-28T12:05:00Z Build completed in 4m 0s
      `;

      const timing = buildTracker.extractBuildTiming(logs);

      expect(timing.totalTime).toBeGreaterThan(0);
      expect(timing.steps.length).toBeGreaterThan(0);
      expect(timing.buildTime).toBeGreaterThan(0);
    });

    it('should categorize timing correctly', () => {
      const logs = `
        2025-10-28T12:01:00Z Step 1/5 : Setup environment
        2025-10-28T12:01:30Z Step 2/5 : Build hugo site
        2025-10-28T12:03:30Z Step 3/5 : Deploy to pages
        2025-10-28T12:04:30Z Build completed
      `;

      const timing = buildTracker.extractBuildTiming(logs);

      // The timing extraction should find steps and categorize them
      expect(timing.steps.length).toBeGreaterThan(0);
      expect(timing.totalTime).toBeGreaterThan(0);
    });

    it('should handle logs without timing information', () => {
      const logs = `
        Starting build...
        Build completed
      `;

      const timing = buildTracker.extractBuildTiming(logs);

      expect(timing.totalTime).toBe(0);
      expect(timing.steps).toHaveLength(0);
    });
  });

  describe('build job analysis', () => {
    it('should analyze build jobs correctly', async () => {
      const jobs = [
        {
          id: 1,
          name: 'setup-hugo',
          status: 'completed',
          conclusion: 'success',
          started_at: '2025-10-28T12:01:00Z',
          completed_at: '2025-10-28T12:02:00Z',
          steps: [{ name: 'Setup' }]
        },
        {
          id: 2,
          name: 'build-site',
          status: 'completed',
          conclusion: 'success',
          started_at: '2025-10-28T12:02:00Z',
          completed_at: '2025-10-28T12:05:00Z',
          steps: [{ name: 'Build' }, { name: 'Generate' }]
        },
        {
          id: 3,
          name: 'deploy-pages',
          status: 'completed',
          conclusion: 'success',
          started_at: '2025-10-28T12:05:00Z',
          completed_at: '2025-10-28T12:06:00Z',
          steps: [{ name: 'Deploy' }]
        }
      ];

      const analysis = await buildTracker._analyzeBuildJobs(jobs);

      expect(analysis.totalJobs).toBe(3);
      expect(analysis.buildJobs).toHaveLength(2); // setup-hugo and build-site
      expect(analysis.deployJobs).toHaveLength(1); // deploy-pages
      expect(analysis.success).toBe(true);
      expect(analysis.totalDuration).toBeGreaterThan(0);
    });

    it('should detect failed build jobs', async () => {
      const jobs = [
        {
          id: 1,
          name: 'build-hugo',
          status: 'completed',
          conclusion: 'failure',
          started_at: '2025-10-28T12:01:00Z',
          completed_at: '2025-10-28T12:02:00Z'
        }
      ];

      const analysis = await buildTracker._analyzeBuildJobs(jobs);

      expect(analysis.success).toBe(false);
      expect(analysis.errors).toHaveLength(1);
      expect(analysis.errors[0].job).toBe('build-hugo');
      expect(analysis.errors[0].conclusion).toBe('failure');
    });

    it('should handle empty job list', async () => {
      const analysis = await buildTracker._analyzeBuildJobs([]);

      expect(analysis.totalJobs).toBe(0);
      expect(analysis.buildJobs).toHaveLength(0);
      expect(analysis.deployJobs).toHaveLength(0);
      expect(analysis.success).toBe(true);
    });
  });

  describe('artifact monitoring', () => {
    it('should monitor build artifacts', async () => {
      const analysis = await buildTracker._monitorBuildArtifacts(123);

      expect(analysis.artifactsFound).toBeGreaterThan(0);
      expect(analysis.artifacts).toHaveLength(analysis.artifactsFound);
      expect(analysis.totalSize).toBeGreaterThan(0);
      expect(analysis.validation.staticFiles).toBe(true);
      expect(analysis.validation.htmlFiles).toBe(true);
      expect(analysis.validation.cssFiles).toBe(true);
      expect(analysis.validation.jsFiles).toBe(true);
    });

    it('should validate artifact types correctly', async () => {
      const analysis = await buildTracker._monitorBuildArtifacts(123);

      const htmlArtifacts = analysis.artifacts.filter(a => a.type === 'html');
      const cssArtifacts = analysis.artifacts.filter(a => a.type === 'css');
      const jsArtifacts = analysis.artifacts.filter(a => a.type === 'js');

      expect(htmlArtifacts.length).toBeGreaterThan(0);
      expect(cssArtifacts.length).toBeGreaterThan(0);
      expect(jsArtifacts.length).toBeGreaterThan(0);
    });
  });

  describe('deployment step tracking', () => {
    it('should track deployment steps', async () => {
      const jobs = [
        {
          id: 1,
          name: 'deploy-to-pages',
          status: 'completed',
          conclusion: 'success',
          started_at: '2025-10-28T12:05:00Z',
          completed_at: '2025-10-28T12:06:00Z'
        },
        {
          id: 2,
          name: 'publish-site',
          status: 'completed',
          conclusion: 'success',
          started_at: '2025-10-28T12:06:00Z',
          completed_at: '2025-10-28T12:07:00Z'
        }
      ];

      const analysis = await buildTracker._trackDeploymentSteps(jobs);

      expect(analysis.deploymentJobs).toHaveLength(2);
      expect(analysis.success).toBe(true);
      expect(analysis.totalDuration).toBeGreaterThan(0);
      expect(analysis.steps.length).toBeGreaterThan(0);
    });

    it('should detect deployment failures', async () => {
      const jobs = [
        {
          id: 1,
          name: 'deploy-to-pages',
          status: 'completed',
          conclusion: 'failure',
          started_at: '2025-10-28T12:05:00Z',
          completed_at: '2025-10-28T12:06:00Z'
        }
      ];

      const analysis = await buildTracker._trackDeploymentSteps(jobs);

      expect(analysis.success).toBe(false);
      expect(analysis.deploymentJobs[0].conclusion).toBe('failure');
      expect(analysis.steps.some(step => step.status === 'failed')).toBe(true);
    });

    it('should handle no deployment jobs', async () => {
      const jobs = [
        {
          id: 1,
          name: 'build-only',
          status: 'completed',
          conclusion: 'success'
        }
      ];

      const analysis = await buildTracker._trackDeploymentSteps(jobs);

      expect(analysis.deploymentJobs).toHaveLength(0);
      expect(analysis.totalDuration).toBe(0);
      expect(analysis.steps).toHaveLength(0);
    });
  });

  describe('job type identification', () => {
    it('should identify build jobs correctly', () => {
      expect(buildTracker._isBuildJob('build-hugo')).toBe(true);
      expect(buildTracker._isBuildJob('setup-build-env')).toBe(true);
      expect(buildTracker._isBuildJob('compile-assets')).toBe(true);
      expect(buildTracker._isBuildJob('generate-site')).toBe(true);
      expect(buildTracker._isBuildJob('deploy-pages')).toBe(false);
      expect(buildTracker._isBuildJob('test-only')).toBe(false);
    });

    it('should identify deployment jobs correctly', () => {
      expect(buildTracker._isDeployJob('deploy-to-pages')).toBe(true);
      expect(buildTracker._isDeployJob('publish-site')).toBe(true);
      expect(buildTracker._isDeployJob('upload-artifacts')).toBe(true);
      expect(buildTracker._isDeployJob('pages-deploy')).toBe(true);
      expect(buildTracker._isDeployJob('build-hugo')).toBe(false);
      expect(buildTracker._isDeployJob('test-only')).toBe(false);
    });
  });

  describe('performance calculation', () => {
    it('should calculate build performance metrics', () => {
      const analysis = {
        buildSteps: [
          { name: 'Step 1', duration: 1000 },
          { name: 'Step 2', duration: 2000 },
          { name: 'Step 3', duration: 1500 }
        ],
        errors: [{ message: 'Error 1' }],
        warnings: [{ message: 'Warning 1' }, { message: 'Warning 2' }]
      };

      const performance = buildTracker._calculateBuildPerformance(analysis);

      expect(performance.totalSteps).toBe(3);
      expect(performance.errorRate).toBe(1/3);
      expect(performance.warningRate).toBe(2/3);
      expect(performance.averageStepTime).toBe(1500);
      expect(performance.slowestStep).toBe(2000);
      expect(performance.fastestStep).toBe(1000);
    });

    it('should handle empty build steps', () => {
      const analysis = {
        buildSteps: [],
        errors: [],
        warnings: []
      };

      const performance = buildTracker._calculateBuildPerformance(analysis);

      expect(performance.totalSteps).toBe(0);
      expect(performance.errorRate).toBe(0);
      expect(performance.warningRate).toBe(0);
      expect(performance.averageStepTime).toBe(0);
      expect(performance.slowestStep).toBeNull();
      expect(performance.fastestStep).toBeNull();
    });
  });

  describe('build pattern matching', () => {
    it('should have Hugo build patterns defined', () => {
      const patterns = buildTracker._getBuildPatterns();

      expect(patterns.hugo).toBeDefined();
      expect(patterns.hugo.length).toBeGreaterThan(0);
      expect(patterns.deployment).toBeDefined();
      expect(patterns.deployment.length).toBeGreaterThan(0);
    });

    it('should extract Hugo build steps from log lines', () => {
      const step1 = buildTracker._extractHugoBuildStep('Starting hugo build process');
      const step2 = buildTracker._extractHugoBuildStep('Hugo building site with theme');
      const step3 = buildTracker._extractHugoBuildStep('Random log line without hugo');

      expect(step1).toBeDefined();
      expect(step1.type).toBe('hugo_build');
      expect(step2).toBeDefined();
      expect(step2.type).toBe('hugo_build');
      expect(step3).toBeNull();
    });

    it('should extract timing from log lines', () => {
      const timing1 = buildTracker._extractTimingFromLine('Build completed in 1.5s');
      const timing2 = buildTracker._extractTimingFromLine('Setup finished in 30s');
      const timing3 = buildTracker._extractTimingFromLine('Deploy took 2 minutes');
      const timing4 = buildTracker._extractTimingFromLine('No timing info here');

      expect(timing1).toBeDefined();
      expect(timing1.duration).toBe(1500);
      expect(timing2).toBeDefined();
      expect(timing2.duration).toBe(30000);
      expect(timing3).toBeDefined();
      expect(timing3.duration).toBe(120000);
      expect(timing4).toBeNull();
    });
  });
});