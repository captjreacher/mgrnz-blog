/**
 * Dashboard Server - Express.js server for monitoring dashboard interface
 * Provides web-based monitoring interface with real-time updates
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class DashboardServer {
  constructor(testCycleEngine, config = {}) {
    this.engine = testCycleEngine;
    this.config = {
      port: config.port || 3000,
      host: config.host || 'localhost',
      ...config
    };
    
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    this.clients = new Set();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  setupMiddleware() {
    // Serve static files from dashboard directory
    this.app.use('/static', express.static(path.join(__dirname, 'static')));
    
    // Parse JSON bodies
    this.app.use(express.json());
    
    // CORS headers for development
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      next();
    });
  }

  setupRoutes() {
    // Dashboard home page
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'static', 'index.html'));
    });

    // API Routes
    this.app.get('/api/status', this.getSystemStatus.bind(this));
    this.app.get('/api/pipeline-runs', this.getPipelineRuns.bind(this));
    this.app.get('/api/pipeline-runs/:id', this.getPipelineRun.bind(this));
    this.app.get('/api/metrics', this.getMetrics.bind(this));
    this.app.get('/api/alerts', this.getAlerts.bind(this));
    this.app.get('/api/realtime/pipeline-status', this.getRealtimePipelineStatus.bind(this));
    this.app.get('/api/realtime/webhook-flows', this.getWebhookFlows.bind(this));
    this.app.get('/api/realtime/performance', this.getPerformanceSnapshot.bind(this));
    
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });
  }

  setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      console.log(`New WebSocket connection from ${req.socket.remoteAddress}`);
      this.clients.add(ws);

      // Send initial data
      this.sendToClient(ws, {
        type: 'connection',
        data: {
          message: 'Connected to monitoring dashboard',
          timestamp: new Date().toISOString()
        }
      });

      // Handle client messages
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleClientMessage(ws, data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      });

      // Handle client disconnect
      ws.on('close', () => {
        console.log('WebSocket client disconnected');
        this.clients.delete(ws);
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });
    });
  }

  handleClientMessage(ws, data) {
    switch (data.type) {
      case 'subscribe':
        // Subscribe to specific events
        ws.subscriptions = ws.subscriptions || new Set();
        if (data.events) {
          data.events.forEach(event => ws.subscriptions.add(event));
        }
        break;
        
      case 'unsubscribe':
        // Unsubscribe from events
        if (ws.subscriptions && data.events) {
          data.events.forEach(event => ws.subscriptions.delete(event));
        }
        break;
        
      case 'ping':
        // Respond to ping with pong
        this.sendToClient(ws, { type: 'pong', timestamp: new Date().toISOString() });
        break;
        
      default:
        console.log('Unknown message type:', data.type);
    }
  }

  // API Route Handlers
  async getSystemStatus(req, res) {
    try {
      const status = await this.engine.getSystemStatus();
      res.json(status);
    } catch (error) {
      console.error('Error getting system status:', error);
      res.status(500).json({ error: 'Failed to get system status' });
    }
  }

  async getPipelineRuns(req, res) {
    try {
      const { limit = 50, offset = 0, status } = req.query;
      const runs = await this.engine.getPipelineRuns({
        limit: parseInt(limit),
        offset: parseInt(offset),
        status
      });
      res.json(runs);
    } catch (error) {
      console.error('Error getting pipeline runs:', error);
      res.status(500).json({ error: 'Failed to get pipeline runs' });
    }
  }

  async getPipelineRun(req, res) {
    try {
      const { id } = req.params;
      const run = await this.engine.getPipelineRun(id);
      if (!run) {
        return res.status(404).json({ error: 'Pipeline run not found' });
      }
      res.json(run);
    } catch (error) {
      console.error('Error getting pipeline run:', error);
      res.status(500).json({ error: 'Failed to get pipeline run' });
    }
  }

  async getMetrics(req, res) {
    try {
      const { timeRange = '24h' } = req.query;
      const metrics = await this.engine.getMetrics(timeRange);
      res.json(metrics);
    } catch (error) {
      console.error('Error getting metrics:', error);
      res.status(500).json({ error: 'Failed to get metrics' });
    }
  }

  async getAlerts(req, res) {
    try {
      const { status = 'active', limit = 100 } = req.query;
      const alerts = await this.engine.getAlerts({
        status,
        limit: parseInt(limit)
      });
      res.json(alerts);
    } catch (error) {
      console.error('Error getting alerts:', error);
      res.status(500).json({ error: 'Failed to get alerts' });
    }
  }

  async getRealtimePipelineStatus(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 25;
      const summary = await this._buildPipelineSummary(limit);
      res.json(summary);
    } catch (error) {
      console.error('Error building pipeline summary:', error);
      res.status(500).json({ error: 'Failed to build pipeline summary' });
    }
  }

  async getWebhookFlows(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 25;
      const summary = await this._buildWebhookSummary(limit);
      res.json(summary);
    } catch (error) {
      console.error('Error building webhook flow summary:', error);
      res.status(500).json({ error: 'Failed to build webhook flow summary' });
    }
  }

  async getPerformanceSnapshot(req, res) {
    try {
      const range = req.query.range || '3h';
      const limit = parseInt(req.query.limit) || 50;
      const snapshot = await this._buildPerformanceSnapshot(range, limit);
      res.json(snapshot);
    } catch (error) {
      console.error('Error building performance snapshot:', error);
      res.status(500).json({ error: 'Failed to build performance snapshot' });
    }
  }

  async _buildPipelineSummary(limit = 25) {
    try {
      const runs = await this._fetchPipelineRuns({ limit });
      const totals = { running: 0, completed: 0, failed: 0, queued: 0, cancelled: 0 };
      const durations = [];
      const cumulative = { ...totals };
      const trend = [];

      runs.forEach((run, index) => {
        const statusKey = run.status || 'unknown';
        if (totals[statusKey] === undefined) {
          totals[statusKey] = 0;
          cumulative[statusKey] = 0;
        }
        totals[statusKey] += 1;

        const duration = run.metrics?.totalPipelineTime ?? run.duration;
        if (typeof duration === 'number' && !Number.isNaN(duration)) {
          durations.push(duration);
        }
      });

      runs.slice().reverse().forEach((run, index) => {
        const statusKey = run.status || 'unknown';
        if (cumulative[statusKey] === undefined) {
          cumulative[statusKey] = 0;
        }
        cumulative[statusKey] += 1;
        trend.push({
          runId: run.id,
          status: run.status,
          timestamp: run.startTime,
          index,
          totals: { ...cumulative },
          totalRuns: index + 1
        });
      });

      const outcomes = (totals.completed || 0) + (totals.failed || 0);
      const successRate = outcomes > 0 ? (totals.completed / outcomes) * 100 : 0;
      const averageDuration = durations.length
        ? durations.reduce((sum, value) => sum + value, 0) / durations.length
        : 0;

      const activeRuns = typeof this.engine.getActivePipelineRuns === 'function'
        ? await this.engine.getActivePipelineRuns()
        : runs.filter(run => run.status === 'running');

      const recentRuns = runs.slice(0, limit).map(run => ({
        id: run.id,
        status: run.status,
        trigger: run.trigger,
        startTime: run.startTime,
        endTime: run.endTime,
        metrics: run.metrics,
        duration: run.metrics?.totalPipelineTime ?? run.duration
      }));

      return {
        totals: { running: 0, completed: 0, failed: 0, queued: 0, cancelled: 0, ...totals },
        successRate,
        averageDuration,
        activeRuns: activeRuns.map(run => ({
          id: run.id,
          status: run.status,
          startTime: run.startTime,
          trigger: run.trigger
        })),
        recentRuns,
        trend,
        totalRuns: runs.length,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to build pipeline summary:', error);
      return {
        totals: { running: 0, completed: 0, failed: 0, queued: 0, cancelled: 0 },
        successRate: 0,
        averageDuration: 0,
        activeRuns: [],
        recentRuns: [],
        trend: [],
        totalRuns: 0,
        generatedAt: new Date().toISOString()
      };
    }
  }

  async _buildWebhookSummary(limit = 25) {
    const emptySummary = {
      totals: { received: 0, processed: 0, failed: 0 },
      sources: {},
      destinations: {},
      recent: [],
      averages: { latency: null, throughput: 0 },
      lastUpdated: new Date().toISOString()
    };

    try {
      if (!this.engine?.dataStore?.getWebhookRecords) {
        return emptySummary;
      }

      const runs = await this._fetchPipelineRuns({ limit });
      if (!runs.length) {
        return emptySummary;
      }

      const webhookArrays = await Promise.all(
        runs.map(run => this.engine.dataStore.getWebhookRecords(run.id).catch(() => []))
      );
      const allRecords = webhookArrays.flat();
      if (!allRecords.length) {
        return emptySummary;
      }

      const summary = { ...emptySummary, totals: { ...emptySummary.totals }, sources: {}, destinations: {}, recent: [] };
      const latencies = [];

      allRecords.forEach(record => {
        const source = record.source || 'unknown';
        const destination = record.destination || 'unknown';
        const statusCode = record.response?.status;
        const hasResponse = typeof statusCode === 'number';
        const outcome = hasResponse
          ? (statusCode >= 400 ? 'failed' : 'processed')
          : 'received';

        summary.totals.received += 1;
        if (outcome === 'processed') summary.totals.processed += 1;
        if (outcome === 'failed') summary.totals.failed += 1;

        if (!summary.sources[source]) {
          summary.sources[source] = { received: 0, processed: 0, failed: 0 };
        }
        summary.sources[source][outcome] = (summary.sources[source][outcome] || 0) + 1;

        summary.destinations[destination] = (summary.destinations[destination] || 0) + 1;

        const sent = record.timing?.sent || record.timing?.received;
        const processed = record.timing?.processed;
        if (sent && processed) {
          const latency = new Date(processed) - new Date(sent);
          if (!Number.isNaN(latency)) {
            latencies.push(latency);
          }
        }
      });

      summary.recent = allRecords
        .sort((a, b) => new Date(b.timing?.processed || b.timing?.received || b.timing?.sent || 0) -
                        new Date(a.timing?.processed || a.timing?.received || a.timing?.sent || 0))
        .slice(0, limit)
        .map(record => ({
          id: record.id,
          runId: record.runId,
          source: record.source,
          destination: record.destination,
          status: record.response?.status,
          outcome: record.response?.status >= 400 ? 'failed' : (record.response ? 'processed' : 'pending'),
          timestamp: record.timing?.processed || record.timing?.received || record.timing?.sent
        }));

      if (latencies.length) {
        summary.averages.latency = latencies.reduce((sum, value) => sum + value, 0) / latencies.length;
      }

      summary.averages.throughput = allRecords.length / runs.length;
      summary.lastUpdated = new Date().toISOString();

      return summary;
    } catch (error) {
      console.error('Failed to build webhook summary:', error);
      return emptySummary;
    }
  }

  async _buildPerformanceSnapshot(range = '3h', limit = 50) {
    const metricKeys = ['webhookLatency', 'buildTime', 'deploymentTime', 'siteResponseTime'];
    try {
      const metricsMap = await this._fetchMetrics();
      const entries = Object.entries(metricsMap || {}).map(([runId, metrics]) => ({
        runId,
        timestamp: metrics.timestamp || metrics.updatedAt || metrics.recordedAt || new Date().toISOString(),
        metrics
      }));

      entries.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      const rangeMs = this._parseRange(range);
      const now = Date.now();
      let filtered = entries;
      if (rangeMs) {
        filtered = entries.filter(point => now - new Date(point.timestamp).getTime() <= rangeMs);
      }

      if (limit && filtered.length > limit) {
        filtered = filtered.slice(filtered.length - limit);
      }

      const averages = {};
      metricKeys.forEach(key => {
        const values = filtered
          .map(point => Number(point.metrics?.[key]))
          .filter(value => !Number.isNaN(value));
        averages[key] = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
      });

      const latest = filtered[filtered.length - 1] || null;

      return {
        range,
        points: filtered,
        totalPoints: filtered.length,
        averages,
        latest,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to build performance snapshot:', error);
      return {
        range,
        points: [],
        totalPoints: 0,
        averages: {
          webhookLatency: null,
          buildTime: null,
          deploymentTime: null,
          siteResponseTime: null
        },
        latest: null,
        generatedAt: new Date().toISOString()
      };
    }
  }

  async _fetchPipelineRuns(filters = {}) {
    if (typeof this.engine.getPipelineRuns === 'function') {
      return await this.engine.getPipelineRuns(filters);
    }

    if (this.engine?.dataStore?.getPipelineRuns) {
      return await this.engine.dataStore.getPipelineRuns(filters);
    }

    return [];
  }

  async _fetchMetrics() {
    if (typeof this.engine.getMetrics === 'function') {
      const metrics = await this.engine.getMetrics();
      if (metrics) {
        return metrics;
      }
    }

    if (this.engine?.dataStore?.getMetrics) {
      return await this.engine.dataStore.getMetrics();
    }

    return {};
  }

  _parseRange(range) {
    if (typeof range !== 'string') return null;
    const match = range.trim().match(/^(\d+)([smhd])$/i);
    if (!match) return null;

    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return value * (multipliers[unit] || 0);
  }

  // WebSocket Broadcasting
  broadcast(message) {
    const messageStr = JSON.stringify(message);
    this.clients.forEach(client => {
      if (client.readyState === client.OPEN) {
        // Check if client is subscribed to this event type
        if (!client.subscriptions || client.subscriptions.has(message.type) || client.subscriptions.has('all')) {
          client.send(messageStr);
        }
      }
    });
  }

  sendToClient(client, message) {
    if (client.readyState === client.OPEN) {
      client.send(JSON.stringify(message));
    }
  }

  // Event handlers for real-time updates
  onPipelineRunStarted(run) {
    this.broadcast({
      type: 'pipeline_started',
      data: run,
      timestamp: new Date().toISOString()
    });
  }

  onPipelineRunUpdated(run) {
    this.broadcast({
      type: 'pipeline_updated',
      data: run,
      timestamp: new Date().toISOString()
    });
  }

  onPipelineRunCompleted(run) {
    this.broadcast({
      type: 'pipeline_completed',
      data: run,
      timestamp: new Date().toISOString()
    });
  }

  onAlertGenerated(alert) {
    this.broadcast({
      type: 'alert',
      data: alert,
      timestamp: new Date().toISOString()
    });
  }

  onMetricsUpdated(metrics) {
    this.broadcast({
      type: 'metrics_updated',
      data: metrics,
      timestamp: new Date().toISOString()
    });
  }

  // Server lifecycle
  async start() {
    return new Promise((resolve, reject) => {
      this.server.listen(this.config.port, this.config.host, (error) => {
        if (error) {
          reject(error);
        } else {
          console.log(`Dashboard server running on http://${this.config.host}:${this.config.port}`);
          resolve();
        }
      });
    });
  }

  async stop() {
    return new Promise((resolve) => {
      // Close all WebSocket connections
      this.clients.forEach(client => {
        client.close();
      });
      this.clients.clear();

      // Close WebSocket server
      this.wss.close(() => {
        // Close HTTP server
        this.server.close(() => {
          console.log('Dashboard server stopped');
          resolve();
        });
      });
    });
  }

  getConnectionCount() {
    return this.clients.size;
  }

  isRunning() {
    return this.server.listening;
  }
}