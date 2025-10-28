const STATUS_LABELS = ['received', 'processed', 'failed'];
const STATUS_COLORS = {
  received: '#63b3ed',
  processed: '#48bb78',
  failed: '#f56565'
};

export class WebhookFlowVisualizer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.options = {
      stacked: options.stacked ?? true,
      ...options
    };

    this.chart = null;
    if (this.canvas) {
      this._initializeChart();
    }
  }

  _initializeChart() {
    if (!window.Chart || !this.canvas) {
      console.warn('Chart.js not available, skipping webhook chart setup');
      return;
    }

    const ctx = this.canvas.getContext('2d');
    this.chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: [],
        datasets: STATUS_LABELS.map((status) => ({
          label: status.charAt(0).toUpperCase() + status.slice(1),
          data: [],
          backgroundColor: STATUS_COLORS[status],
          borderWidth: 0,
          maxBarThickness: 38
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { usePointStyle: true, padding: 16 }
          },
          tooltip: {
            callbacks: {
              title: (items) => items?.[0]?.label || '',
              label: (context) => `${context.dataset.label}: ${context.formattedValue}`
            }
          }
        },
        scales: {
          x: {
            stacked: this.options.stacked,
            ticks: { autoSkip: true, maxRotation: 0, minRotation: 0 }
          },
          y: {
            stacked: this.options.stacked,
            beginAtZero: true,
            ticks: {
              precision: 0
            }
          }
        }
      }
    });
  }

  update(flowSummary = {}) {
    if (!this.chart) return;

    const labels = flowSummary.sources ? Object.keys(flowSummary.sources) : [];
    const totals = flowSummary.totals || { received: 0, processed: 0, failed: 0 };

    if (labels.length === 0 && flowSummary.recent) {
      const uniqueSources = new Set(flowSummary.recent.map((item) => item.source));
      uniqueSources.forEach((source) => labels.push(source));
    }

    this.chart.data.labels = labels;
    this.chart.data.datasets.forEach((dataset) => {
      const statusKey = dataset.label.toLowerCase();
      dataset.data = labels.map((label) => {
        const sourceTotals = flowSummary.sources?.[label];
        if (sourceTotals) {
          return sourceTotals[statusKey] ?? 0;
        }
        return 0;
      });
    });

    if (this.chart.data.labels.length === 0) {
      this.chart.data.labels = ['No data'];
      this.chart.data.datasets.forEach((dataset) => {
        dataset.data = [totals[dataset.label.toLowerCase()] ?? 0];
      });
    }

    this.chart.update('none');
  }
}
