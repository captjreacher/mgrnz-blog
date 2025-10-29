const STATUS_ORDER = ['running', 'completed', 'failed', 'queued', 'cancelled'];
const STATUS_COLORS = {
  running: '#ed8936',
  completed: '#48bb78',
  failed: '#f56565',
  queued: '#4299e1',
  cancelled: '#a0aec0'
};

function formatLabel(status) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export class PipelineStatusVisualizer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.options = {
      animate: options.animate ?? true,
      cutout: options.cutout ?? '55%',
      ...options
    };

    this.chart = null;
    this.totalElement = null;

    if (this.canvas) {
      this._initializeChart();
    }
  }

  attachTotalElement(element) {
    this.totalElement = element;
  }

  _initializeChart() {
    if (!window.Chart || !this.canvas) {
      console.warn('Chart.js not available, skipping pipeline chart setup');
      return;
    }

    const ctx = this.canvas.getContext('2d');
    this.chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: STATUS_ORDER.map(formatLabel),
        datasets: [
          {
            data: new Array(STATUS_ORDER.length).fill(0),
            backgroundColor: STATUS_ORDER.map(status => STATUS_COLORS[status]),
            borderWidth: 0,
            hoverOffset: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: this.options.cutout,
        animation: this.options.animate,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              usePointStyle: true,
              padding: 18,
              boxWidth: 10
            }
          },
          tooltip: {
            callbacks: {
              label(context) {
                const value = context.parsed;
                const total = context.dataset.data.reduce((sum, val) => sum + val, 0);
                const percentage = total ? ((value / total) * 100).toFixed(1) : 0;
                return `${context.label}: ${value} (${percentage}%)`;
              }
            }
          }
        }
      }
    });
  }

  update(summary = {}) {
    if (!this.chart) return;

    const dataset = this.chart.data.datasets[0];
    dataset.data = STATUS_ORDER.map(status => summary.totals?.[status] ?? 0);

    if (this.totalElement) {
      if (Array.isArray(summary.trend) && summary.trend.length > 0) {
        const latest = summary.trend[summary.trend.length - 1];
        this.totalElement.textContent = `${latest?.totalRuns ?? summary.totalRuns ?? 0}`;
      } else {
        this.totalElement.textContent = `${summary.totalRuns ?? 0}`;
      }
    }

    if (typeof summary.successRate === 'number' && this.totalElement) {
      this.totalElement.dataset.successRate = summary.successRate.toFixed(1);
    }

    this.chart.update('none');
  }
}
