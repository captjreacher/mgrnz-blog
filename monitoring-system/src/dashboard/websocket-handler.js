/**
 * WebSocket Handler - Manages real-time communication with dashboard clients
 * Handles client subscriptions, message routing, and connection management
 */

export class WebSocketHandler {
  constructor(wss, testCycleEngine, notificationManager = null) {
    this.wss = wss;
    this.engine = testCycleEngine;
    this.clients = new Map(); // Map of client ID to client info
    this.subscriptions = new Map(); // Map of event types to client sets
    this.clientCounter = 0;
    this.notificationManager = null;

    this.setupEventHandlers();

    if (notificationManager) {
      this.setNotificationManager(notificationManager);
    }
  }

  setNotificationManager(notificationManager) {
    this.notificationManager = notificationManager;

    if (this.notificationManager?.getChannel) {
      const dashboardChannel = this.notificationManager.getChannel('dashboard');
      if (dashboardChannel && typeof dashboardChannel.setWebSocketHandler === 'function') {
        dashboardChannel.setWebSocketHandler(this);
      }
    }
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
      const status = await this.engine.getSystemStatus();
      this.sendToClient(clientId, {
        type: 'status_response',
        data: status
      });
    } catch (error) {
      this.sendError(clientId, 'Failed to get system status');
    }
  }

  async handleGetRecentRuns(clientId, limit) {
    try {
      const runs = await this.engine.getPipelineRuns({ limit, offset: 0 });
      this.sendToClient(clientId, {
        type: 'recent_runs_response',
        data: runs
      });
    } catch (error) {
      this.sendError(clientId, 'Failed to get recent runs');
    }
  }

  async handleGetMetrics(clientId, timeRange) {
    try {
      const metrics = await this.engine.getMetrics(timeRange);
      this.sendToClient(clientId, {
        type: 'metrics_response',
        data: metrics
      });
    } catch (error) {
      this.sendError(clientId, 'Failed to get metrics');
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
  broadcast(eventType, data) {
    const message = {
      type: eventType,
      data,
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

  // Event emission methods for integration with monitoring system
  onPipelineStarted(run) {
    this.broadcast('pipeline_started', run);
  }

  onPipelineUpdated(run) {
    this.broadcast('pipeline_updated', run);
  }

  onPipelineCompleted(run) {
    this.broadcast('pipeline_completed', run);
  }

  onAlertGenerated(alert) {
    this.broadcast('alert_generated', alert);
  }

  onAlertAcknowledged(alert) {
    this.broadcast('alert_acknowledged', alert);
  }

  onAlertResolved(alert) {
    this.broadcast('alert_resolved', alert);
  }

  onMetricsUpdated(metrics) {
    this.broadcast('metrics_updated', metrics);
  }

  onSystemStatusChanged(status) {
    this.broadcast('system_status_changed', status);
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