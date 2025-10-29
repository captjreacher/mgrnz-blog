#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';

import { TestCycleEngine } from '../src/core/test-cycle-engine.js';
import { ReportGenerator } from '../src/analytics/report-generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadConfig() {
  try {
    const configPath = path.join(__dirname, '..', 'config', 'reporting-config.json');
    const raw = await fs.readFile(configPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    console.error('Failed to load reporting config:', error.message);
    throw error;
  }
}

function parseArguments(argv) {
  const args = {};
  argv.forEach((arg, index) => {
    if (!arg.startsWith('--')) return;
    const key = arg.slice(2);
    const value = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : true;
    args[key] = value;
  });
  return args;
}

async function main() {
  const cliOptions = parseArguments(process.argv.slice(2));
  const config = await loadConfig();
  const reportOptions = { ...config.reports, ...cliOptions };

  const format = (cliOptions.format || reportOptions.defaultFormat || 'json').toLowerCase();
  const runId = cliOptions.run || cliOptions.runId;
  const aggregate = cliOptions.aggregate === true || cliOptions.aggregate === 'true';
  const limit = parseInt(cliOptions.limit || reportOptions.aggregate?.limit || '10', 10);

  if (!runId && !aggregate) {
    console.error('Either --run <id> or --aggregate must be specified.');
    process.exit(1);
  }

  const engine = new TestCycleEngine(config.engine || {});
  await engine.initialize();

  const generator = new ReportGenerator(reportOptions);
  let reportData;

  if (aggregate) {
    const runs = await engine.getRecentPipelineRuns(limit);
    const reports = await Promise.all(runs.map(run => engine.generateReport(run.id)));
    reportData = {
      metadata: { type: 'aggregate' },
      reports,
      summary: {
        totalRuns: reports.length,
        successfulRuns: reports.filter(report => report.summary?.success).length
      }
    };
  } else {
    let targetRunId = runId;
    if (runId === 'latest') {
      const [latestRun] = await engine.getRecentPipelineRuns(1);
      if (!latestRun) {
        console.error('No pipeline runs available to export.');
        process.exit(1);
      }
      targetRunId = latestRun.id;
    }

    reportData = await engine.generateReport(targetRunId);
    reportData.metadata = { ...(reportData.metadata || {}), runId: targetRunId };
  }

  const { content } = await generator.generate(reportData, format, {
    outputDir: cliOptions.output || reportOptions.outputDir,
    fileNamePrefix: cliOptions.prefix || reportOptions.fileNamePrefix
  });

  if (!reportOptions.outputDir && !cliOptions.output) {
    if (format === 'json') {
      console.log(content);
    } else {
      console.log(content);
    }
  }

  await engine.stopMonitoring?.();
}

main().catch(error => {
  console.error('Report export failed:', error);
  process.exit(1);
});
