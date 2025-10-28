#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import { TestCycleEngine } from '../src/core/test-cycle-engine.js';
import { TriggerMonitor } from '../src/monitors/trigger-monitor.js';
import { GitHubActionsMonitor } from '../src/monitors/github-actions-monitor.js';
import { BuildProcessTracker } from '../src/monitors/build-process-tracker.js';
import { WorkflowPerformanceAnalyzer } from '../src/monitors/workflow-performance-analyzer.js';
import { DashboardServer } from '../src/dashboard/dashboard-server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const readJson = (filePath, fallback = {}) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.warn(`Falling back to default configuration for ${filePath}:`, error.message);
    return fallback;
  }
};

const mode = (process.argv[2] || 'monitoring').toLowerCase();
const configDir = path.join(projectRoot, 'config', 'production');
const configPath = process.env.MONITORING_CONFIG || path.join(configDir, 'monitoring.config.json');
const dashboardConfigPath = process.env.DASHBOARD_CONFIG || path.join(configDir, 'dashboard.config.json');

const monitoringConfig = readJson(configPath);
const dashboardConfig = readJson(dashboardConfigPath);
const dataDir = process.env.MONITORING_DATA_DIR
  || monitoringConfig.dataDir
  || monitoringConfig.storage?.dataDir
  || path.join(projectRoot, 'data', 'production');

fs.mkdirSync(dataDir, { recursive: true });

const engine = new TestCycleEngine({
  dataDir,
  monitoring: monitoringConfig.monitoring,
  storage: monitoringConfig.storage
});
await engine.initialize();

const activeMonitors = [];

const startMonitoringStack = async () => {
  await engine.startMonitoring();

  const triggerMonitor = new TriggerMonitor(engine, monitoringConfig.triggers || {});
  activeMonitors.push(triggerMonitor);
  try {
    await triggerMonitor.initialize();
    await triggerMonitor.startMonitoring();
  } catch (error) {
    console.warn('Trigger monitor startup warning:', error.message);
  }

  if (monitoringConfig.monitors?.github?.enabled) {
    const githubMonitor = new GitHubActionsMonitor(engine, {
      githubMonitorInterval: monitoringConfig.monitors.github.pollInterval || 30000,
      repository: monitoringConfig.monitors.github.repo,
      owner: monitoringConfig.monitors.github.owner
    });
    activeMonitors.push(githubMonitor);
    try {
      await githubMonitor.initialize();
      await githubMonitor.startMonitoring();
    } catch (error) {
      console.warn('GitHub monitor startup warning:', error.message);
    }
  }

  const buildTracker = new BuildProcessTracker(engine, monitoringConfig.monitors?.build || {});
  const performanceAnalyzer = new WorkflowPerformanceAnalyzer(engine, monitoringConfig.monitors?.performance || {});
  activeMonitors.push(buildTracker, performanceAnalyzer);

  if (typeof buildTracker.initialize === 'function') {
    await buildTracker.initialize().catch(error => {
      console.warn('Build tracker initialization warning:', error.message);
    });
  }

  if (typeof performanceAnalyzer.initialize === 'function') {
    await performanceAnalyzer.initialize().catch(error => {
      console.warn('Performance analyzer initialization warning:', error.message);
    });
  }
};

let dashboardServer;

const startDashboard = async () => {
  dashboardServer = new DashboardServer(engine, dashboardConfig.server || {});
  const { port = 3000, host = '0.0.0.0' } = dashboardConfig.server || {};
  dashboardServer.server.listen(port, host, () => {
    console.log(`Dashboard listening on http://${host}:${port}`);
  });
};

if (mode === 'monitoring' || mode === 'all') {
  await startMonitoringStack();
}

if (mode === 'dashboard' || mode === 'all') {
  await startDashboard();
}

console.log(`Monitoring system started in ${mode} mode using ${configPath}`);

const shutdown = async (signal) => {
  console.log(`Received ${signal}, shutting down services...`);
  try {
    await engine.stopMonitoring();
  } catch (error) {
    console.warn('Error stopping engine:', error.message);
  }

  if (dashboardServer) {
    await new Promise(resolve => dashboardServer.server.close(resolve));
  }

  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
