import fs from 'fs/promises';
import path from 'path';

/**
 * ReportGenerator assembles analytics outputs into exportable formats.
 * Supports HTML, CSV, and JSON formats for both single pipeline runs and
 * aggregated result sets.
 */
export class ReportGenerator {
  constructor(options = {}) {
    this.options = {
      title: 'Monitoring Report',
      outputDir: options.outputDir || null,
      defaultFormat: options.defaultFormat || 'json',
      includeMetadata: options.includeMetadata !== false,
      ...options
    };
  }

  /**
   * Generate a report in the requested format.
   *
   * @param {Object} data - Analytics output data.
   * @param {'html'|'csv'|'json'} format - Desired export format.
   * @param {Object} [options] - Runtime overrides for report behavior.
   * @returns {Promise<{ content: string, format: string }>} Generated report.
   */
  async generate(data, format = this.options.defaultFormat, options = {}) {
    const normalizedFormat = (format || this.options.defaultFormat || 'json').toLowerCase();
    const reportOptions = { ...this.options, ...options };
    const normalizedData = this.normalizeData(data);

    let content;
    switch (normalizedFormat) {
      case 'html':
        content = this.generateHtmlReport(normalizedData, reportOptions);
        break;
      case 'csv':
        content = this.generateCsvReport(normalizedData, reportOptions);
        break;
      case 'json':
        content = this.generateJsonReport(normalizedData, reportOptions);
        break;
      default:
        throw new Error(`Unsupported report format: ${normalizedFormat}`);
    }

    if (reportOptions.outputDir) {
      await this.persistReport(content, normalizedFormat, normalizedData, reportOptions);
    }

    return { content, format: normalizedFormat };
  }

  /**
   * Normalize analytics output structure into a consistent schema.
   *
   * @param {Object} data - Raw analytics output.
   * @returns {Object} Normalized data structure.
   */
  normalizeData(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('Report data must be an object.');
    }

    const defaultMetadata = {
      generatedAt: new Date().toISOString(),
      source: 'analytics',
      type: 'single'
    };

    const metadata = {
      ...defaultMetadata,
      ...(data.metadata || {}),
      ...(data.meta || {})
    };

    const summary = data.summary || data.overview || {};
    const metrics = data.metrics || {};
    const stages = data.stages || data.pipeline || [];
    const alerts = data.alerts || [];
    const timeline = data.timeline || [];
    const reports = Array.isArray(data.runs) ? data.runs : (data.reports || []);

    if (reports.length > 0) {
      metadata.type = 'aggregate';
    }

    return {
      metadata,
      summary,
      metrics,
      stages,
      alerts,
      timeline,
      reports
    };
  }

  /**
   * Generate HTML representation of the analytics data.
   *
   * @param {Object} data - Normalized data.
   * @param {Object} options - Report options.
   * @returns {string} HTML string.
   */
  generateHtmlReport(data, options) {
    const title = options.title || 'Monitoring Report';
    const metadataHtml = options.includeMetadata ? `
      <section class="metadata">
        <h2>Metadata</h2>
        <ul>
          ${Object.entries(data.metadata).map(([key, value]) => `<li><strong>${key}:</strong> ${this.escapeHtml(String(value))}</li>`).join('')}
        </ul>
      </section>
    ` : '';

    const summaryHtml = Object.keys(data.summary).length > 0 ? `
      <section class="summary">
        <h2>Summary</h2>
        <ul>
          ${Object.entries(data.summary).map(([key, value]) => `<li><strong>${this.escapeHtml(key)}:</strong> ${this.escapeHtml(this.formatValue(value))}</li>`).join('')}
        </ul>
      </section>
    ` : '';

    const metricsHtml = Object.keys(data.metrics).length > 0 ? `
      <section class="metrics">
        <h2>Metrics</h2>
        <table>
          <thead><tr><th>Metric</th><th>Value</th></tr></thead>
          <tbody>
            ${Object.entries(data.metrics).map(([key, value]) => `<tr><td>${this.escapeHtml(key)}</td><td>${this.escapeHtml(this.formatValue(value))}</td></tr>`).join('')}
          </tbody>
        </table>
      </section>
    ` : '';

    const stagesHtml = data.stages.length > 0 ? `
      <section class="stages">
        <h2>Pipeline Stages</h2>
        <table>
          <thead><tr><th>Name</th><th>Status</th><th>Duration</th><th>Errors</th></tr></thead>
          <tbody>
            ${data.stages.map(stage => `
              <tr>
                <td>${this.escapeHtml(stage.name || '')}</td>
                <td>${this.escapeHtml(stage.status || '')}</td>
                <td>${this.escapeHtml(this.formatValue(stage.duration))}</td>
                <td>${this.escapeHtml((stage.errors || []).map(err => err.message || err).join('; '))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </section>
    ` : '';

    const alertsHtml = data.alerts.length > 0 ? `
      <section class="alerts">
        <h2>Alerts</h2>
        <ul>
          ${data.alerts.map(alert => `<li>${this.escapeHtml(alert.message || JSON.stringify(alert))}</li>`).join('')}
        </ul>
      </section>
    ` : '';

    const timelineHtml = data.timeline.length > 0 ? `
      <section class="timeline">
        <h2>Timeline</h2>
        <ul>
          ${data.timeline.map(entry => `<li>${this.escapeHtml(`${entry.timestamp || ''} - ${entry.event || ''}`)}</li>`).join('')}
        </ul>
      </section>
    ` : '';

    const aggregatedHtml = data.reports.length > 0 ? `
      <section class="aggregated">
        <h2>Aggregated Runs (${data.reports.length})</h2>
        <table>
          <thead><tr><th>Run ID</th><th>Status</th><th>Success</th><th>Duration</th></tr></thead>
          <tbody>
            ${data.reports.map(report => `
              <tr>
                <td>${this.escapeHtml(report.runId || report.summary?.runId || '')}</td>
                <td>${this.escapeHtml(report.summary?.status || report.status || '')}</td>
                <td>${this.escapeHtml(this.formatValue(report.summary?.success ?? report.success))}</td>
                <td>${this.escapeHtml(this.formatValue(report.summary?.duration ?? report.duration))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </section>
    ` : '';

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${this.escapeHtml(title)}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 2rem; color: #1a202c; }
      h1 { border-bottom: 2px solid #2d3748; padding-bottom: 0.5rem; }
      section { margin-bottom: 2rem; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #cbd5f5; padding: 0.5rem; text-align: left; }
      th { background: #2d3748; color: #f7fafc; }
      tbody tr:nth-child(even) { background: #edf2f7; }
    </style>
  </head>
  <body>
    <h1>${this.escapeHtml(title)}</h1>
    ${metadataHtml}
    ${summaryHtml}
    ${metricsHtml}
    ${stagesHtml}
    ${alertsHtml}
    ${timelineHtml}
    ${aggregatedHtml}
  </body>
</html>`;
  }

  /**
   * Generate CSV representation of analytics data.
   *
   * @param {Object} data - Normalized data.
   * @param {Object} options - Report options.
   * @returns {string} CSV string.
   */
  generateCsvReport(data, options) {
    const rows = [];

    if (options.includeMetadata) {
      rows.push('Section,Key,Value');
      Object.entries(data.metadata).forEach(([key, value]) => {
        rows.push(`Metadata,${this.escapeCsv(key)},${this.escapeCsv(this.formatValue(value))}`);
      });
    }

    if (Object.keys(data.summary).length > 0) {
      Object.entries(data.summary).forEach(([key, value]) => {
        rows.push(`Summary,${this.escapeCsv(key)},${this.escapeCsv(this.formatValue(value))}`);
      });
    }

    if (Object.keys(data.metrics).length > 0) {
      Object.entries(data.metrics).forEach(([key, value]) => {
        rows.push(`Metrics,${this.escapeCsv(key)},${this.escapeCsv(this.formatValue(value))}`);
      });
    }

    if (data.stages.length > 0) {
      rows.push('Stage,Status,Duration,Errors');
      data.stages.forEach(stage => {
        rows.push(`${this.escapeCsv(stage.name || '')},${this.escapeCsv(stage.status || '')},${this.escapeCsv(this.formatValue(stage.duration))},${this.escapeCsv((stage.errors || []).map(err => err.message || err).join('; '))}`);
      });
    }

    if (data.reports.length > 0) {
      rows.push('Run ID,Status,Success,Duration');
      data.reports.forEach(report => {
        rows.push(`${this.escapeCsv(report.runId || report.summary?.runId || '')},${this.escapeCsv(report.summary?.status || report.status || '')},${this.escapeCsv(this.formatValue(report.summary?.success ?? report.success))},${this.escapeCsv(this.formatValue(report.summary?.duration ?? report.duration))}`);
      });
    }

    return rows.join('\n');
  }

  /**
   * Generate JSON representation.
   *
   * @param {Object} data - Normalized data.
   * @param {Object} options - Report options.
   * @returns {string} JSON string.
   */
  generateJsonReport(data, options) {
    const payload = {
      title: options.title,
      ...data
    };
    return JSON.stringify(payload, null, 2);
  }

  /**
   * Persist report to the configured output directory if provided.
   *
   * @param {string} content - Report contents.
   * @param {string} format - Report format.
   * @param {Object} data - Normalized data.
   * @param {Object} options - Report options.
   * @returns {Promise<string>} Resolved file path.
   */
  async persistReport(content, format, data, options) {
    const outputDir = options.outputDir;
    if (!outputDir) return null;

    const fileName = this.getFileName(data, format, options.fileNamePrefix);
    const filePath = path.resolve(outputDir, fileName);

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf8');
    return filePath;
  }

  /**
   * Determine export file name based on metadata.
   */
  getFileName(data, format, prefix = 'report') {
    const timestamp = (data.metadata.generatedAt || new Date().toISOString())
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .replace('Z', '');

    const typeSuffix = data.metadata.type === 'aggregate' ? 'aggregate' : (data.summary?.runId || data.metadata.runId || 'single');
    return `${prefix}-${typeSuffix}-${timestamp}.${format}`;
  }

  escapeHtml(value) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  escapeCsv(value) {
    const stringValue = value == null ? '' : String(value);
    if (/[",\n]/.test(stringValue)) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  }

  formatValue(value) {
    if (value == null) return '';
    if (typeof value === 'number') {
      return Number.isInteger(value) ? value.toString() : value.toFixed(2);
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (Array.isArray(value) || typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }
}

export default ReportGenerator;
