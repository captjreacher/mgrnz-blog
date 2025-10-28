import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TestCycleEngine } from './core/test-cycle-engine.js';
import { DashboardServer } from './dashboard/dashboard-server.js';

async function loadJsonConfig(filePath, description) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    throw new Error(`Failed to read ${description} at ${filePath}: ${error.message}`);
  }
}

async function startMonitoringSystem() {
  const args = new Set(process.argv.slice(2));
  const dashboardOnly = args.has('--dashboard-only');
  const engineOnly = args.has('--engine-only');

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(__dirname, '..');
  const defaultMonitoringConfig = path.join(projectRoot, 'config', 'production', 'monitoring.config.json');
  const defaultDashboardConfig = path.join(projectRoot, 'config', 'production', 'dashboard.config.json');

  const monitoringConfigPath = process.env.MONITORING_CONFIG || defaultMonitoringConfig;
  const dashboardConfigPath = process.env.DASHBOARD_CONFIG || defaultDashboardConfig;

  const monitoringConfig = await loadJsonConfig(monitoringConfigPath, 'monitoring config');
  const dashboardConfig = await loadJsonConfig(dashboardConfigPath, 'dashboard config');

  const engineConfig = monitoringConfig.engine || monitoringConfig;
  const engine = new TestCycleEngine(engineConfig);
  await engine.initialize();

  if (!dashboardOnly && engineConfig.autoStart !== false) {
    await engine.startMonitoring();
  }

  let dashboard = null;
  if (!engineOnly) {
    dashboard = new DashboardServer(engine, {
      host: dashboardConfig.host || '0.0.0.0',
      port: dashboardConfig.port || 3000
    });
    await dashboard.start();
  }

  console.log('Monitoring system started. Press Ctrl+C to exit.');

  async function shutdown(signal) {
    console.log(`\nReceived ${signal}, shutting down monitoring system...`);
    try {
      if (dashboard) {
        await dashboard.stop();
      }
      await engine.stopMonitoring();
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

startMonitoringSystem().catch((error) => {
  console.error('Failed to start monitoring system:', error);
  process.exit(1);
});
