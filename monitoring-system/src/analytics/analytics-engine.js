import { AnalyticsStore } from '../storage/analytics-store.js';
import { DataStore } from '../storage/data-store.js';

/**
 * Analytics engine for pipeline monitoring system
 * Computes long-term metrics, identifies bottlenecks, and detects anomalies
 */
export class AnalyticsEngine {
  constructor(options = {}) {
    const {
      dataDir = './data',
      dataStore = null,
      analyticsStore = null,
      config = {}
    } = options;

    this.dataStore = dataStore || new DataStore(dataDir);
    this.analyticsStore = analyticsStore || new AnalyticsStore(dataDir);

    this.config = {
      snapshotRetention: 50,
      anomalyStdDevThreshold: 2,
      metricAnomalyMultiplier: 1.5,
      ...config
    };
  }

  /**
   * Initialize the analytics engine and its persistence layer
   */
  async initialize() {
    if (typeof this.analyticsStore.initialize === 'function') {
      await this.analyticsStore.initialize();
    }
  }

  /**
   * Update analytics following a pipeline run completion
   * @param {import('../types/index.js').PipelineRun} latestRun
   * @returns {Promise<Object>} Analytics snapshot
   */
  async updateAfterRun(latestRun) {
    const snapshot = await this._generateSnapshot(latestRun);

    await this.analyticsStore.saveSnapshot(snapshot, {
      limit: this.config.snapshotRetention
    });

    await this.analyticsStore.saveAggregates({
      lastUpdated: snapshot.generatedAt,
      successMetrics: snapshot.successMetrics,
      bottlenecks: snapshot.bottlenecks,
      anomalies: snapshot.anomalies
    });

    return snapshot;
  }

  /**
   * Generate a current analytics snapshot
   * @param {import('../types/index.js').PipelineRun} latestRun
   * @returns {Promise<Object>}
   */
  async _generateSnapshot(latestRun) {
    const [runs, metricsByRun] = await Promise.all([
      this.dataStore.getPipelineRuns(),
      this.dataStore.getMetrics()
    ]);

    const successMetrics = this._calculateSuccessMetrics(runs);
    const bottlenecks = this._identifyBottlenecks(runs);
    const anomalies = this._detectAnomalies(runs, metricsByRun);

    return {
      generatedAt: new Date().toISOString(),
      totals: {
        totalRuns: runs.length,
        successfulRuns: runs.filter(run => run.success).length,
        failedRuns: runs.filter(run => run.status === 'failed').length
      },
      successMetrics,
      bottlenecks,
      anomalies,
      latestRun: latestRun
        ? {
            id: latestRun.id,
            status: latestRun.status,
            success: latestRun.success,
            duration: latestRun.duration || null,
            completedAt: latestRun.endTime || null
          }
        : null
    };
  }

  _calculateSuccessMetrics(runs) {
    const totals = runs.length;

    if (totals === 0) {
      return {
        overall: {
          successRate: 0,
          successCount: 0,
          failureCount: 0,
          totalRuns: 0
        },
        rolling: {},
        byTrigger: {}
      };
    }

    const successCount = runs.filter(run => run.success).length;
    const failureCount = totals - successCount;

    const overall = {
      successRate: this._toPercentage(successCount, totals),
      successCount,
      failureCount,
      totalRuns: totals
    };

    const rolling = this._calculateRollingSuccessRates(runs);
    const byTrigger = this._calculateTriggerSuccessRates(runs);

    return { overall, rolling, byTrigger };
  }

  _calculateRollingSuccessRates(runs) {
    const now = Date.now();
    const windows = {
      last24Hours: 24 * 60 * 60 * 1000,
      last7Days: 7 * 24 * 60 * 60 * 1000,
      last30Days: 30 * 24 * 60 * 60 * 1000
    };

    const rollingRates = {};

    for (const [key, duration] of Object.entries(windows)) {
      const windowRuns = runs.filter(run => {
        if (!run.startTime) {
          return false;
        }
        const runStart = new Date(run.startTime).getTime();
        return !Number.isNaN(runStart) && now - runStart <= duration;
      });

      if (windowRuns.length === 0) {
        rollingRates[key] = {
          successRate: 0,
          successCount: 0,
          failureCount: 0,
          totalRuns: 0
        };
        continue;
      }

      const successes = windowRuns.filter(run => run.success).length;
      rollingRates[key] = {
        successRate: this._toPercentage(successes, windowRuns.length),
        successCount: successes,
        failureCount: windowRuns.length - successes,
        totalRuns: windowRuns.length
      };
    }

    return rollingRates;
  }

  _calculateTriggerSuccessRates(runs) {
    const byTrigger = {};

    for (const run of runs) {
      const triggerType = run.trigger?.type || 'unknown';
      if (!byTrigger[triggerType]) {
        byTrigger[triggerType] = {
          successCount: 0,
          failureCount: 0,
          totalRuns: 0,
          successRate: 0
        };
      }

      byTrigger[triggerType].totalRuns += 1;
      if (run.success) {
        byTrigger[triggerType].successCount += 1;
      } else {
        byTrigger[triggerType].failureCount += 1;
      }
    }

    for (const stats of Object.values(byTrigger)) {
      stats.successRate = this._toPercentage(stats.successCount, stats.totalRuns);
    }

    return byTrigger;
  }

  _identifyBottlenecks(runs) {
    const stageDurations = new Map();
    const stageFailures = new Map();

    for (const run of runs) {
      for (const stage of run.stages || []) {
        if (typeof stage.duration === 'number' && stage.duration >= 0) {
          if (!stageDurations.has(stage.name)) {
            stageDurations.set(stage.name, []);
          }
          stageDurations.get(stage.name).push(stage.duration);
        }

        if (stage.status === 'failed') {
          stageFailures.set(stage.name, (stageFailures.get(stage.name) || 0) + 1);
        }
      }
    }

    const slowestStages = Array.from(stageDurations.entries())
      .map(([name, durations]) => ({
        name,
        averageDuration: this._average(durations),
        maxDuration: Math.max(...durations),
        runCount: durations.length
      }))
      .sort((a, b) => b.averageDuration - a.averageDuration)
      .slice(0, 5);

    const frequentFailures = Array.from(stageFailures.entries())
      .map(([name, count]) => ({ name, failureCount: count }))
      .sort((a, b) => b.failureCount - a.failureCount)
      .slice(0, 5);

    const pipelineDurations = runs
      .map(run => run.duration)
      .filter(duration => typeof duration === 'number' && duration > 0);

    return {
      slowestStages,
      frequentFailures,
      averagePipelineDuration: pipelineDurations.length
        ? this._average(pipelineDurations)
        : 0
    };
  }

  _detectAnomalies(runs, metricsByRun) {
    const anomalies = {
      pipelineDuration: this._detectDurationAnomalies(runs),
      metricAnomalies: []
    };

    if (metricsByRun && typeof metricsByRun === 'object') {
      const metricAnomalies = this._detectMetricAnomalies(metricsByRun);
      anomalies.metricAnomalies = metricAnomalies;
    }

    return anomalies;
  }

  _detectDurationAnomalies(runs) {
    const durations = runs
      .map(run => ({
        id: run.id,
        duration: typeof run.duration === 'number' ? run.duration : null
      }))
      .filter(entry => entry.duration !== null && entry.duration >= 0);

    if (durations.length === 0) {
      return {
        mean: 0,
        standardDeviation: 0,
        anomalies: []
      };
    }

    const values = durations.map(entry => entry.duration);
    const mean = this._average(values);
    const standardDeviation = this._standardDeviation(values);

    if (standardDeviation === 0) {
      return {
        mean,
        standardDeviation,
        anomalies: []
      };
    }

    const stdThreshold = mean + standardDeviation * this.config.anomalyStdDevThreshold;
    const ratioThreshold = mean === 0 ? stdThreshold : mean * this.config.metricAnomalyMultiplier;
    const threshold = Math.min(stdThreshold, ratioThreshold);

    const anomalies = durations
      .filter(entry => entry.duration >= threshold)
      .map(entry => ({
        runId: entry.id,
        duration: entry.duration,
        deviation: entry.duration - mean
      }));

    return {
      mean,
      standardDeviation,
      anomalies
    };
  }

  _detectMetricAnomalies(metricsByRun) {
    const metricsByKey = new Map();

    for (const [runId, metrics] of Object.entries(metricsByRun)) {
      if (!metrics || typeof metrics !== 'object') {
        continue;
      }

      for (const [metricKey, value] of Object.entries(metrics)) {
        if (metricKey === 'timestamp') {
          continue;
        }

        if (typeof value !== 'number' || Number.isNaN(value)) {
          continue;
        }

        if (!metricsByKey.has(metricKey)) {
          metricsByKey.set(metricKey, []);
        }

        metricsByKey.get(metricKey).push({ runId, value });
      }
    }

    const anomalies = [];

    for (const [metricKey, records] of metricsByKey.entries()) {
      const values = records.map(record => record.value);
      const baseline = this._average(values);
      const standardDeviation = this._standardDeviation(values);

      if (values.length <= 1 || (baseline === 0 && standardDeviation === 0)) {
        continue;
      }

      const threshold = Math.max(
        baseline * this.config.metricAnomalyMultiplier,
        baseline + standardDeviation * this.config.anomalyStdDevThreshold
      );

      for (const record of records) {
        if (record.value > threshold) {
          anomalies.push({
            runId: record.runId,
            metric: metricKey,
            value: record.value,
            baseline,
            threshold
          });
        }
      }
    }

    return anomalies;
  }

  _toPercentage(part, total) {
    if (total === 0) {
      return 0;
    }
    return Number(((part / total) * 100).toFixed(2));
  }

  _average(values) {
    if (!values.length) {
      return 0;
    }
    const sum = values.reduce((acc, value) => acc + value, 0);
    return Number((sum / values.length).toFixed(2));
  }

  _standardDeviation(values) {
    if (values.length <= 1) {
      return 0;
    }

    const mean = values.reduce((acc, value) => acc + value, 0) / values.length;
    const variance =
      values.reduce((acc, value) => acc + Math.pow(value - mean, 2), 0) /
      values.length;

    return Number(Math.sqrt(variance).toFixed(2));
  }
}
