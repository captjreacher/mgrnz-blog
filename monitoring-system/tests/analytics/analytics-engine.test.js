import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowPerformanceAnalyzer } from '../../src/monitors/workflow-performance-analyzer.js';
import { generateTrendDataset, generateBottleneckDataset } from '../fixtures/analytics-fixtures.js';

describe('WorkflowPerformanceAnalyzer analytics calculations', () => {
  let analyzer;

  beforeEach(() => {
    analyzer = new WorkflowPerformanceAnalyzer({ updatePipelineStage: async () => {} });
    analyzer.historicalData.clear();
  });

  it('should calculate performance trends from historical data', () => {
    const dataset = generateTrendDataset();

    for (const { id, result, timestamp } of dataset) {
      analyzer.historicalData.set(id, { ...result, timestamp });
    }

    const trends = analyzer.getPerformanceTrends(30);

    expect(trends.totalRuns).toBe(dataset.length);
    expect(trends.averageDuration).toBeCloseTo(155, 5);
    expect(trends.successRate).toBeCloseTo(0.6, 5);
    expect(trends.buildTimeAverage).toBeCloseTo(260, 5);
    expect(trends.deploymentTimeAverage).toBeCloseTo(445, 5);
    expect(trends.trends.duration).toBe('improving');
    expect(trends.trends.successRate).toBe('improving');
    expect(trends.trends.buildTime).toBe('degrading');
  });

  it('should return default metrics when no recent data is available', () => {
    const trends = analyzer.getPerformanceTrends(30);

    expect(trends).toEqual({
      totalRuns: 0,
      averageDuration: 0,
      successRate: 0,
      trends: {}
    });
  });

  it('should identify the most common bottlenecks', () => {
    const dataset = generateBottleneckDataset();

    for (const { id, result, timestamp } of dataset) {
      analyzer.historicalData.set(id, { ...result, timestamp });
    }

    const bottlenecks = analyzer.identifyCommonBottlenecks();

    expect(bottlenecks).toHaveLength(3);
    expect(bottlenecks[0].bottleneck).toBe('phase_build');
    expect(bottlenecks[0].frequency).toBe(3);
    expect(bottlenecks[0].percentage).toBeCloseTo(100, 5);

    const deployEntry = bottlenecks.find(item => item.bottleneck === 'phase_deploy');
    expect(deployEntry.frequency).toBe(1);
    expect(deployEntry.percentage).toBeCloseTo(33.3333, 4);

    const testEntry = bottlenecks.find(item => item.bottleneck === 'phase_test');
    expect(testEntry.frequency).toBe(1);
    expect(testEntry.percentage).toBeCloseTo(33.3333, 4);
  });
});
