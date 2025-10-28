const METRIC_KEYS = [
  'webhookLatency',
  'buildTime',
  'deploymentTime',
  'siteResponseTime'
];

const METRIC_LABELS = {
  webhookLatency: 'Webhook Latency (ms)',
  buildTime: 'Build Time (s)',
  deploymentTime: 'Deploy Time (s)',
  siteResponseTime: 'Site Response (ms)'
};

const METRIC_COLORS = {
  webhookLatency: '#63b3ed',
  buildTime: '#ed8936',
  deploymentTime: '#9f7aea',
  siteResponseTime: '#48bb78'
};

function trimToWindow(points, maxPoints) {
  if (!Array.isArray(points)) return [];
  if (points.length <= maxPoints) return points;
  return points.slice(points.length - maxPoints);
}

export class PerformanceMetricsChart {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.maxPoints = options.maxPoints ?? 20;
    this.chart = null;

    if (this.canvas) {
      this._initializeChart();
    }
  }

  _initializeChart() {
    if (!window.Chart || !this.canvas) {
      console.warn('Chart.js not available, skipping performance chart setup');
      return;
    }

    const ctx = this.canvas.getContext('2d');
    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: METRIC_KEYS.map((metric) => ({
          label: METRIC_LABELS[metric],
          data: [],
          borderColor: METRIC_COLORS[metric],
          backgroundColor: `${METRIC_COLORS[metric]}33`,
          borderWidth: 2,
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointHoverRadius: 5,
          hidden: metric === 'siteResponseTime'
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { usePointStyle: true, padding: 16 }
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              title(items) {
                if (!items || !items.length) return '';
                return items[0].label;
              }
            }
          }
        },
        scales: {
          x: {
            ticks: { autoSkip: true, maxTicksLimit: 8 },
            grid: { display: false }
          },
          y: {
            beginAtZero: true,
            ticks: {
              callback(value) {
                return value.toFixed ? value.toFixed(0) : value;
              }
            }
          }
        }
      }
    });
  }

  update(snapshot = {}) {
    if (!this.chart) return;

    const points = trimToWindow(snapshot.points || [], this.maxPoints);
    this.chart.data.labels = points.map((point) => new Date(point.timestamp).toLocaleTimeString());

    this.chart.data.datasets.forEach((dataset) => {
      const metricKey = METRIC_KEYS.find((key) => METRIC_LABELS[key] === dataset.label);
      if (!metricKey) return;
      dataset.data = points.map((point) => point.metrics?.[metricKey] ?? 0);
    });

    this.chart.update('none');
  }

  append(point) {
    if (!this.chart) return;

    const labels = this.chart.data.labels;
    if (labels.length >= this.maxPoints) {
      labels.shift();
      this.chart.data.datasets.forEach((dataset) => dataset.data.shift());
    }

    labels.push(new Date(point.timestamp).toLocaleTimeString());
    this.chart.data.datasets.forEach((dataset) => {
      const metricKey = METRIC_KEYS.find((key) => METRIC_LABELS[key] === dataset.label);
      dataset.data.push(point.metrics?.[metricKey] ?? 0);
    });

    this.chart.update('none');
  }
}
