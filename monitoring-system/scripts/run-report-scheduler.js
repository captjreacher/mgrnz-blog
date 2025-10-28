#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';

import { TestCycleEngine } from '../src/core/test-cycle-engine.js';
import { ReportGenerator } from '../src/analytics/report-generator.js';
import { Scheduler } from '../src/utils/scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadJsonConfig(fileName) {
  try {
    const filePath = path.join(__dirname, '..', 'config', fileName);
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function main() {
  const reportingConfig = (await loadJsonConfig('reporting-config.json')) || {};
  const schedulerConfig = (await loadJsonConfig('scheduler-config.json')) || {};

  const engine = new TestCycleEngine(reportingConfig.engine || {});
  await engine.initialize();

  const generator = new ReportGenerator(reportingConfig.reports || {});
  const scheduler = new Scheduler({ logger: console });

  const jobs = schedulerConfig.jobs || [];
  if (jobs.length === 0) {
    console.warn('No scheduler jobs configured. Exiting.');
    await engine.stopMonitoring?.();
    return;
  }

  scheduler.loadFromConfig(jobs, jobConfig => {
    return async () => {
      try {
        let data;
        if (jobConfig.aggregate) {
          const runs = await engine.getRecentPipelineRuns(jobConfig.limit || 10);
          const reports = await Promise.all(runs.map(run => engine.generateReport(run.id)));
          data = {
            metadata: { type: 'aggregate' },
            reports,
            summary: {
              totalRuns: reports.length,
              successfulRuns: reports.filter(report => report.summary?.success).length
            }
          };
        } else if (jobConfig.runId) {
          let runId = jobConfig.runId;
          if (runId === 'latest') {
            const [latestRun] = await engine.getRecentPipelineRuns(1);
            if (!latestRun) {
              console.warn(`Skipping job ${jobConfig.name}: no runs available.`);
              return;
            }
            runId = latestRun.id;
          }

          data = await engine.generateReport(runId);
          data.metadata = { ...(data.metadata || {}), runId };
        } else {
          console.warn(`Skipping job ${jobConfig.name}: missing runId or aggregate flag.`);
          return;
        }

        await generator.generate(data, jobConfig.format || reportingConfig.reports?.defaultFormat || 'json', {
          outputDir: jobConfig.output || reportingConfig.reports?.outputDir,
          fileNamePrefix: jobConfig.fileNamePrefix || reportingConfig.reports?.fileNamePrefix || jobConfig.name
        });
        console.log(`Report job '${jobConfig.name}' completed.`);
      } catch (error) {
        console.error(`Scheduler job '${jobConfig.name}' failed:`, error);
      }
    };
  });

  console.log('Report scheduler running. Press Ctrl+C to exit.');

  const shutdown = async () => {
    console.log('\nShutting down scheduler...');
    scheduler.cancelAll();
    await engine.stopMonitoring?.();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(error => {
  console.error('Failed to start report scheduler:', error);
  process.exit(1);
});
