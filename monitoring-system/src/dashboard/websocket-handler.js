/**
 * WebSocket Handler - Manages real-time communication with dashboard clients
 * Handles client subscriptions, message routing, and connection management
 */

export class WebSocketHandler {
  constructor(wss, testCycleEngine) {
    this.wss = wss;
    this.engine = testCycleEngine;
    this.clients = new Map(); // Map of client ID to client info
    this.subscriptions = new Map(); // Map of event types to client sets
    this.clientCounter = 0;

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.wss.on('connection', (ws, req) => {
      const clientId = ++this.clientCounter;
      const clientInfo = {
        id: clientId,
        ws,
        subscriptions: new Set(),
        connectedAt: new Date(),
        lastPing: new Date(),
        remoteAddress: req.socket.remoteAddress
      };

      this.clients.set(clientId, clientInfo);
      console.log(`WebSocket client ${clientId} connected from ${clientInfo.remoteAddress}`);

      // Send welcome message
      this.sendToClient(clientId, {
        type: 'welcome',
        data: {
          clientId,
          message: 'Connected to monitoring dashboard',
          serverTime: new Date().toISOString()
        }
      });

      // Set up client event handlers
      this.setupClientHandlers(clientId, ws);
    });
  }

  setupClientHandlers(clientId, ws) {
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        this.handleClientMessage(clientId, data);
      } catch (error) {
        console.error(`Error parsing message from client ${clientId}:`, error);
        this.sendError(clientId, 'Invalid JSON message');
      }
    });

    ws.on('close', (code, reason) => {
      console.log(`WebSocket client ${clientId} disconnected: ${code} ${reason}`);
      this.removeClient(clientId);
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for client ${clientId}:`, error);
      this.removeClient(clientId);
    });

    ws.on('pong', () => {
      const client = this.clients.get(clientId);
      if (client) {
        client.lastPing = new Date();
      }
    });
  }

  handleClientMessage(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (data.type) {
      case 'subscribe':
        this.handleSubscribe(clientId, data.events || []);
        break;

      case 'unsubscribe':
        this.handleUnsubscribe(clientId, data.events || []);
        break;

      case 'ping':
        this.sendToClient(clientId, { 
          type: 'pong', 
          timestamp: new Date().toISOString() 
        });
        break;

      case 'get_status':
        this.handleGetStatus(clientId);
        break;

      case 'get_recent_runs':
        this.handleGetRecentRuns(clientId, data.limit || 10);
        break;

      case 'get_metrics':
        this.handleGetMetrics(clientId, data.timeRange || '1h');
        break;

      case 'get_webhook_summary':
        this.handleGetWebhookSummary(clientId, data.limit || 10);
        break;

      default:
        console.log(`Unknown message type from client ${clientId}:`, data.type);
        this.sendError(clientId, `Unknown message type: ${data.type}`);
    }
  }

  handleSubscribe(clientId, events) {
    const client = this.clients.get(clientId);
    if (!client) return;

    events.forEach(eventType => {
      // Add to client's subscriptions
      client.subscriptions.add(eventType);

      // Add to global subscriptions map
      if (!this.subscriptions.has(eventType)) {
        this.subscriptions.set(eventType, new Set());
      }
      this.subscriptions.get(eventType).add(clientId);
    });

    this.sendToClient(clientId, {
      type: 'subscription_confirmed',
      data: {
        events,
        totalSubscriptions: client.subscriptions.size
      }
    });

    console.log(`Client ${clientId} subscribed to:`, events);
  }

  handleUnsubscribe(clientId, events) {
    const client = this.clients.get(clientId);
    if (!client) return;

    events.forEach(eventType => {
      // Remove from client's subscriptions
      client.subscriptions.delete(eventType);

      // Remove from global subscriptions map
      const eventClients = this.subscriptions.get(eventType);
      if (eventClients) {
        eventClients.delete(clientId);
        if (eventClients.size === 0) {
          this.subscriptions.delete(eventType);
        }
      }
    });

    this.sendToClient(clientId, {
      type: 'unsubscription_confirmed',
      data: {
        events,
        totalSubscriptions: client.subscriptions.size
      }
    });

    console.log(`Client ${clientId} unsubscribed from:`, events);
  }

  async handleGetStatus(clientId) {
    try {
      const status = typeof this.engine.getSystemStatus === 'function'
        ? await this.engine.getSystemStatus()
        : null;
      const summary = await this._buildPipelineSummary();
      this.sendToClient(clientId, {
        type: 'status_response',
        data: {
          status,
          summary
        }
      });
    } catch (error) {
      this.sendError(clientId, 'Failed to get system status');
    }
  }

  async handleGetRecentRuns(clientId, limit) {
    try {
      const summary = await this._buildPipelineSummary(limit);
      this.sendToClient(clientId, {
        type: 'recent_runs_response',
        data: {
          runs: summary.recentRuns,
          summary
        }
      });
    } catch (error) {
      this.sendError(clientId, 'Failed to get recent runs');
    }
  }

  async handleGetMetrics(clientId, timeRange) {
    try {
      const snapshot = await this._buildPerformanceSnapshot(timeRange, 50);
      this.sendToClient(clientId, {
        type: 'metrics_response',
        data: snapshot
      });
    } catch (error) {
      this.sendError(clientId, 'Failed to get metrics');
    }
  }

  async handleGetWebhookSummary(clientId, limit) {
    try {
      const summary = await this._buildWebhookSummary(limit);
      this.sendToClient(clientId, {
        type: 'webhook_summary_response',
        data: summary
      });
    } catch (error) {
      this.sendError(clientId, 'Failed to get webhook summary');
    }
  }

  removeClient(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Remove from all subscriptions
    client.subscriptions.forEach(eventType => {
      const eventClients = this.subscriptions.get(eventType);
      if (eventClients) {
        eventClients.delete(clientId);
        if (eventClients.size === 0) {
          this.subscriptions.delete(eventType);
        }
      }
    });

    // Remove client
    this.clients.delete(clientId);
  }

  // Broadcasting methods
  broadcast(eventType, data, meta = {}) {
    const message = {
      type: eventType,
      data,
      meta,
      timestamp: new Date().toISOString()
    };

    const eventClients = this.subscriptions.get(eventType);
    const allClients = this.subscriptions.get('all');

    // Send to clients subscribed to this specific event
    if (eventClients) {
      eventClients.forEach(clientId => {
        this.sendToClient(clientId, message);
      });
    }

    // Send to clients subscribed to all events
    if (allClients) {
      allClients.forEach(clientId => {
        // Avoid duplicate sends
        if (!eventClients || !eventClients.has(clientId)) {
          this.sendToClient(clientId, message);
        }
      });
    }
  }

  sendToClient(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== client.ws.OPEN) {
      return false;
    }

    try {
      client.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error(`Error sending message to client ${clientId}:`, error);
      this.removeClient(clientId);
      return false;
    }
  }

  sendError(clientId, errorMessage) {
    this.sendToClient(clientId, {
      type: 'error',
      data: {
        message: errorMessage,
        timestamp: new Date().toISOString()
      }
    });
  }

  // Health monitoring
  startHealthCheck(intervalMs = 30000) {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, intervalMs);
  }

  stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  performHealthCheck() {
    const now = new Date();
    const staleThreshold = 60000; // 1 minute

    this.clients.forEach((client, clientId) => {
      // Check if client is stale
      if (now - client.lastPing > staleThreshold) {
        console.log(`Client ${clientId} appears stale, sending ping`);
        
        if (client.ws.readyState === client.ws.OPEN) {
          client.ws.ping();
        } else {
          this.removeClient(clientId);
        }
      }
    });
  }

  // Statistics and monitoring
  getStats() {
    const stats = {
      totalClients: this.clients.size,
      totalSubscriptions: this.subscriptions.size,
      clientDetails: [],
      subscriptionDetails: {}
    };

    // Client details
    this.clients.forEach((client, clientId) => {
      stats.clientDetails.push({
        id: clientId,
        connectedAt: client.connectedAt,
        lastPing: client.lastPing,
        subscriptions: Array.from(client.subscriptions),
        remoteAddress: client.remoteAddress
      });
    });

    // Subscription details
    this.subscriptions.forEach((clients, eventType) => {
      stats.subscriptionDetails[eventType] = clients.size;
    });

    return stats;
  }

  async _buildPipelineSummary(limit = 25) {
    try {
      const runs = await this._fetchPipelineRuns({ limit });
      const totals = { running: 0, completed: 0, failed: 0, queued: 0, cancelled: 0 };
      const cumulative = { ...totals };
      const durations = [];
      const trend = [];

      runs.forEach(run => {
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
          totals: { ...cumulative },
          index,
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
        recentRuns: runs.slice(0, limit).map(run => ({
          id: run.id,
          status: run.status,
          trigger: run.trigger,
          startTime: run.startTime,
          endTime: run.endTime,
          metrics: run.metrics,
          duration: run.metrics?.totalPipelineTime ?? run.duration
        })),
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

      const summary = { ...emptySummary, totals: { ...emptySummary.totals }, sources: {}, destinations: {} };
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

  // Event emission methods for integration with monitoring system

  async onPipelineStarted(run) {
    const [summary, webhookSummary] = await Promise.all([
      this._buildPipelineSummary(),
      this._buildWebhookSummary(10)
    ]);
    this.broadcast('pipeline_started', { run }, {
      pipelineSummary: summary,
      webhookFlow: webhookSummary,
      recentRuns: summary.recentRuns
    });
  }

  async onPipelineUpdated(run) {
    const [summary, webhookSummary] = await Promise.all([
      this._buildPipelineSummary(),
      this._buildWebhookSummary(10)
    ]);
    this.broadcast('pipeline_updated', { run }, {
      pipelineSummary: summary,
      webhookFlow: webhookSummary,
      recentRuns: summary.recentRuns
    });
  }

  async onPipelineCompleted(run) {
    const [summary, webhookSummary, performanceSnapshot] = await Promise.all([
      this._buildPipelineSummary(),
      this._buildWebhookSummary(10),
      this._buildPerformanceSnapshot('3h', 50)
    ]);
    this.broadcast('pipeline_completed', { run }, {
      pipelineSummary: summary,
      webhookFlow: webhookSummary,
      performanceSnapshot,
      recentRuns: summary.recentRuns
    });
  }

  async onAlertGenerated(alert) {
    const summary = await this._buildPipelineSummary();
    this.broadcast('alert_generated', alert, {
      pipelineSummary: summary,
      description: alert.message || alert.type
    });
  }

  onAlertAcknowledged(alert) {
    this.broadcast('alert_acknowledged', alert);
  }

  onAlertResolved(alert) {
    this.broadcast('alert_resolved', alert);
  }

  async onMetricsUpdated(metrics) {
    const snapshot = await this._buildPerformanceSnapshot('3h', 50);
    this.broadcast('metrics_updated', metrics, {
      performanceSnapshot: snapshot
    });
  }

  async onSystemStatusChanged(status) {
    const summary = await this._buildPipelineSummary();
    this.broadcast('system_status_changed', status, {
      pipelineSummary: summary
    });
  }

  // Cleanup
  close() {
    this.stopHealthCheck();
    
    // Close all client connections
    this.clients.forEach((client, clientId) => {
      if (client.ws.readyState === client.ws.OPEN) {
        client.ws.close(1000, 'Server shutting down');
      }
    });

    this.clients.clear();
    this.subscriptions.clear();
  }
}