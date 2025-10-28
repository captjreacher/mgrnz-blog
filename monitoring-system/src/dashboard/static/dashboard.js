import { PipelineStatusVisualizer } from './js/pipeline-status-visualizer.js';
import { WebhookFlowVisualizer } from './js/webhook-flow-visualizer.js';
import { PerformanceMetricsChart } from './js/performance-metrics-chart.js';

const selectors = {
  pipelineStatusValue: document.getElementById('pipeline-status'),
  activeRunsValue: document.getElementById('active-runs'),
  successRateValue: document.getElementById('success-rate'),
  avgDurationValue: document.getElementById('avg-duration'),
  pipelineTotalValue: document.getElementById('pipeline-total'),
  runsContainer: document.getElementById('runs-container'),
  alertsContainer: document.getElementById('alerts-container'),
  activityContainer: document.getElementById('activity-container'),
  connectionIndicator: document.getElementById('connection-indicator'),
  connectionText: document.getElementById('connection-text'),
  refreshRunsBtn: document.getElementById('refresh-runs'),
  statusFilter: document.getElementById('status-filter'),
  metricValues: {
    webhookLatency: document.getElementById('webhook-latency'),
    buildTime: document.getElementById('build-time'),
    deploymentTime: document.getElementById('deploy-time'),
    siteResponseTime: document.getElementById('site-response')
  },
  metricTrends: {
    webhookLatency: document.getElementById('webhook-trend'),
    buildTime: document.getElementById('build-trend'),
    deploymentTime: document.getElementById('deploy-trend'),
    siteResponseTime: document.getElementById('site-trend')
  }
};

const charts = {
  pipelineStatus: new PipelineStatusVisualizer(document.getElementById('pipeline-status-chart')),
  webhookFlow: new WebhookFlowVisualizer(document.getElementById('webhook-flow-chart')),
  performance: new PerformanceMetricsChart(document.getElementById('performance-chart'), { maxPoints: 30 })
};

charts.pipelineStatus.attachTotalElement(selectors.pipelineTotalValue);

const state = {
  runs: [],
  alerts: [],
  pipelineSummary: null,
  webhookSummary: null,
  performanceSnapshot: null,
  websocket: null
};

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  return response.json();
}

function formatPercentage(value, fallback = '0%') {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return `${value.toFixed(1)}%`;
}

function formatDuration(valueMs) {
  if (!valueMs && valueMs !== 0) return '0s';
  const value = Number(valueMs);
  if (Number.isNaN(value)) return '0s';
  if (value < 1000) return `${value}ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = seconds / 60;
  return `${minutes.toFixed(1)}m`;
}

function updateStatusOverview(summary) {
  if (!summary) return;
  const { totals = {}, successRate, averageDuration, activeRuns = [] } = summary;

  if (selectors.pipelineStatusValue) {
    const status = totals.running > 0
      ? 'Running'
      : totals.failed > 0
        ? 'Attention Needed'
        : 'Healthy';
    selectors.pipelineStatusValue.textContent = status;
  }

  if (selectors.activeRunsValue) {
    selectors.activeRunsValue.textContent = activeRuns.length;
  }

  if (selectors.successRateValue) {
    selectors.successRateValue.textContent = formatPercentage(successRate ?? 0, '0%');
  }

  if (selectors.avgDurationValue) {
    selectors.avgDurationValue.textContent = formatDuration(averageDuration ?? 0);
  }

  charts.pipelineStatus.update(summary);
}

function renderPipelineRuns(runs = []) {
  state.runs = runs;
  if (!selectors.runsContainer) return;

  if (!runs.length) {
    selectors.runsContainer.innerHTML = '<div class="no-runs">No pipeline runs found</div>';
    return;
  }

  const fragment = document.createDocumentFragment();

  runs.forEach((run) => {
    const item = document.createElement('div');
    item.className = `run-item status-${run.status}`;
    item.innerHTML = `
      <div class="run-info">
        <span class="run-id">${run.id}</span>
        <span class="run-trigger">${run.trigger?.type || 'unknown'} • ${new Date(run.startTime).toLocaleString()}</span>
      </div>
      <div class="run-meta">
        <span class="run-duration">${formatDuration(run.metrics?.totalPipelineTime || run.duration)}</span>
        <span class="run-status ${run.status}">${run.status}</span>
      </div>`;

    item.addEventListener('click', () => openRunModal(run.id));
    fragment.appendChild(item);
  });

  selectors.runsContainer.innerHTML = '';
  selectors.runsContainer.appendChild(fragment);
}

function renderAlerts(alerts = []) {
  state.alerts = alerts;
  if (!selectors.alertsContainer) return;

  if (!alerts.length) {
    selectors.alertsContainer.innerHTML = '<div class="no-alerts">No active alerts</div>';
    return;
  }

  const fragment = document.createDocumentFragment();
  alerts.forEach((alert) => {
    const item = document.createElement('div');
    item.className = `alert-item ${alert.severity || 'info'}`;
    item.innerHTML = `
      <div class="alert-title">${alert.title || alert.type}</div>
      <div class="alert-message">${alert.message || 'No additional details provided.'}</div>
      <div class="alert-time">${new Date(alert.timestamp || Date.now()).toLocaleString()}</div>`;
    fragment.appendChild(item);
  });

  selectors.alertsContainer.innerHTML = '';
  selectors.alertsContainer.appendChild(fragment);
}

function renderActivity(message, type = 'info', timestamp = new Date()) {
  if (!selectors.activityContainer) return;

  const item = document.createElement('div');
  item.className = `activity-item ${type}`;
  item.innerHTML = `
    <span class="activity-time">${new Date(timestamp).toLocaleTimeString()}</span>
    <span class="activity-message">${message}</span>`;

  selectors.activityContainer.prepend(item);
  const maxItems = 50;
  while (selectors.activityContainer.children.length > maxItems) {
    selectors.activityContainer.removeChild(selectors.activityContainer.lastChild);
  }
}

function updateMetrics(snapshot) {
  if (!snapshot) return;
  state.performanceSnapshot = snapshot;

  charts.performance.update(snapshot);

  const latest = snapshot.latest || snapshot.points?.[snapshot.points.length - 1];
  if (latest) {
    Object.entries(selectors.metricValues).forEach(([key, element]) => {
      if (!element) return;
      const value = latest.metrics?.[key];
      if (value === undefined) {
        element.textContent = '--';
        return;
      }

      if (key.toLowerCase().includes('time') && key !== 'siteResponseTime') {
        element.textContent = `${Number(value).toFixed(1)}s`;
      } else {
        element.textContent = `${Number(value).toFixed(1)}${key === 'siteResponseTime' || key === 'webhookLatency' ? 'ms' : 's'}`;
      }
    });
  }

  if (snapshot.averages) {
    Object.entries(selectors.metricTrends).forEach(([key, element]) => {
      if (!element) return;
      const trendValue = snapshot.averages[key];
      if (trendValue === undefined || trendValue === null) {
        element.textContent = '';
        return;
      }
      element.textContent = `Avg ${trendValue.toFixed(1)}`;
    });
  }
}

async function loadPipelineSummary() {
  try {
    const summary = await fetchJson('/api/realtime/pipeline-status');
    state.pipelineSummary = summary;
    updateStatusOverview(summary);
    charts.pipelineStatus.update(summary);

    if (Array.isArray(summary.recentRuns)) {
      renderPipelineRuns(summary.recentRuns);
    }
  } catch (error) {
    console.error('Failed to load pipeline summary', error);
    renderActivity('Failed to load pipeline summary', 'warning');
  }
}

async function loadWebhookSummary() {
  try {
    const summary = await fetchJson('/api/realtime/webhook-flows');
    state.webhookSummary = summary;
    charts.webhookFlow.update(summary);
  } catch (error) {
    console.error('Failed to load webhook flows', error);
    renderActivity('Failed to load webhook flow data', 'warning');
  }
}

async function loadPerformanceSnapshot(range = '3h') {
  try {
    const snapshot = await fetchJson(`/api/realtime/performance?range=${encodeURIComponent(range)}`);
    updateMetrics(snapshot);
  } catch (error) {
    console.error('Failed to load performance metrics', error);
    renderActivity('Failed to load performance metrics', 'warning');
  }
}

async function loadAlerts() {
  try {
    const alerts = await fetchJson('/api/alerts?status=active&limit=25');
    renderAlerts(alerts);
  } catch (error) {
    console.error('Failed to load alerts', error);
    renderActivity('Failed to load alerts', 'warning');
  }
}

async function loadPipelineRuns() {
  try {
    const params = new URLSearchParams();
    if (selectors.statusFilter?.value) {
      params.set('status', selectors.statusFilter.value);
    }
    params.set('limit', '25');
    const runs = await fetchJson(`/api/pipeline-runs?${params.toString()}`);
    renderPipelineRuns(runs);
  } catch (error) {
    console.error('Failed to load pipeline runs', error);
    renderActivity('Failed to load pipeline runs', 'warning');
  }
}

function setConnectionState(stateName) {
  if (!selectors.connectionIndicator || !selectors.connectionText) return;
  selectors.connectionIndicator.classList.remove('connected', 'connecting', 'disconnected');
  selectors.connectionIndicator.classList.add(stateName);

  const textMap = {
    connected: 'Connected',
    connecting: 'Connecting…',
    disconnected: 'Disconnected'
  };
  selectors.connectionText.textContent = textMap[stateName] ?? stateName;
}

function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = `${protocol}://${window.location.host}`;
  const ws = new WebSocket(wsUrl);
  state.websocket = ws;

  setConnectionState('connecting');

  ws.addEventListener('open', () => {
    setConnectionState('connected');
    ws.send(JSON.stringify({ type: 'subscribe', events: ['all'] }));
    renderActivity('Connected to real-time feed', 'success');
  });

  ws.addEventListener('message', (event) => {
    try {
      const message = JSON.parse(event.data);
      handleWebSocketMessage(message);
    } catch (error) {
      console.error('Failed to parse WebSocket message', error);
    }
  });

  ws.addEventListener('close', () => {
    setConnectionState('disconnected');
    renderActivity('Real-time connection closed', 'warning');
    setTimeout(initWebSocket, 5000);
  });

  ws.addEventListener('error', (error) => {
    console.error('WebSocket error', error);
    setConnectionState('disconnected');
  });
}

function handleWebSocketMessage(message) {
  switch (message.type) {
    case 'pipeline_started':
    case 'pipeline_updated':
    case 'pipeline_completed':
      renderActivity(`Pipeline ${message.data?.run?.id || 'run'} ${message.type.replace('pipeline_', '')}`, 'info', message.timestamp);
      if (message.meta?.pipelineSummary) {
        state.pipelineSummary = message.meta.pipelineSummary;
        updateStatusOverview(message.meta.pipelineSummary);
      } else {
        loadPipelineSummary();
      }
      if (message.meta?.recentRuns) {
        renderPipelineRuns(message.meta.recentRuns);
      } else {
        loadPipelineRuns();
      }
      if (message.meta?.webhookFlow) {
        charts.webhookFlow.update(message.meta.webhookFlow);
      }
      break;
    case 'metrics_updated':
      if (message.meta?.performanceSnapshot) {
        updateMetrics(message.meta.performanceSnapshot);
      } else if (message.data) {
        charts.performance.append({ timestamp: message.timestamp || new Date().toISOString(), metrics: message.data });
      } else {
        loadPerformanceSnapshot();
      }
      break;
    case 'alert_generated':
      loadAlerts();
      renderActivity(message.meta?.description || 'New alert generated', 'alert', message.timestamp);
      break;
    case 'system_status_changed':
      renderActivity('System status updated', 'info', message.timestamp);
      loadPipelineSummary();
      break;
    default:
      break;
  }
}

function setupEventListeners() {
  selectors.refreshRunsBtn?.addEventListener('click', () => {
    loadPipelineRuns();
    loadPipelineSummary();
  });

  selectors.statusFilter?.addEventListener('change', () => {
    loadPipelineRuns();
  });
}

function setupModal() {
  const modal = document.getElementById('run-modal');
  if (!modal) return;

  const closeBtn = modal.querySelector('.close');
  closeBtn?.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  window.addEventListener('click', (event) => {
    if (event.target === modal) {
      modal.style.display = 'none';
    }
  });
}

async function openRunModal(runId) {
  const modal = document.getElementById('run-modal');
  const modalContent = document.getElementById('run-details-content');
  if (!modal || !modalContent) return;

  modal.style.display = 'block';
  modalContent.innerHTML = '<div class="loading">Loading run details...</div>';

  try {
    const run = await fetchJson(`/api/pipeline-runs/${runId}`);
    modalContent.innerHTML = `
      <div class="run-detail-grid">
        <div><strong>Status:</strong> ${run.status}</div>
        <div><strong>Trigger:</strong> ${run.trigger?.type || 'unknown'}</div>
        <div><strong>Started:</strong> ${new Date(run.startTime).toLocaleString()}</div>
        <div><strong>Completed:</strong> ${run.endTime ? new Date(run.endTime).toLocaleString() : 'In progress'}</div>
        <div><strong>Duration:</strong> ${formatDuration(run.metrics?.totalPipelineTime || run.duration)}</div>
      </div>
      <h4>Stages</h4>
      <ul class="run-stages">
        ${(run.stages || []).map((stage) => `
          <li>
            <span class="stage-name">${stage.name}</span>
            <span class="stage-status ${stage.status}">${stage.status}</span>
            <span class="stage-duration">${formatDuration(stage.duration)}</span>
          </li>
        `).join('')}
      </ul>`;
  } catch (error) {
    console.error('Failed to load pipeline run', error);
    modalContent.innerHTML = '<div class="error">Failed to load pipeline run details.</div>';
  }
}

(async function init() {
  setupEventListeners();
  setupModal();
  await Promise.all([
    loadPipelineSummary(),
    loadPipelineRuns(),
    loadAlerts(),
    loadWebhookSummary(),
    loadPerformanceSnapshot()
  ]);
  initWebSocket();
})();
