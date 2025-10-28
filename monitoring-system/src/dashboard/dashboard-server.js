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