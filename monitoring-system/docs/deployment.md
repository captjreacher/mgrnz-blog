# Production Deployment Guide

This document describes how to deploy and operate the monitoring system in the `production` environment. It covers configuration, startup procedures, validation checks, and ongoing maintenance tasks.

## Directory layout

```
monitoring-system/
├── config/
│   └── production/
│       ├── monitoring.config.json
│       └── dashboard.config.json
├── scripts/
│   ├── start-monitoring.sh
│   └── start-dashboard.sh
└── src/
    └── startup.js
```

## Configuration

### Monitoring configuration (`monitoring.config.json`)

* `engine` – runtime options consumed by `TestCycleEngine`.
  * `dataDir`: absolute or relative path where pipeline state is persisted.
  * `monitoring.interval`: poll cadence (milliseconds) for periodic jobs.
  * `monitoring.timeout`: timeout applied to long-running pipelines before they are marked failed.
  * `storage.maxRecords`: cap for retained historical pipeline runs.
  * `alerts.maxHistory`: cap for retained alert history in memory.
* `monitors` – connection details for GitHub, Supabase, and webhook listeners.
* `endpoints` – base URLs for downstream services used by monitors.
* `notifications` – toggle delivery channels for alert notifications.

### Dashboard configuration (`dashboard.config.json`)

* `host` / `port`: network binding for the web dashboard (default `0.0.0.0:4173`).
* `publicUrl`: canonical URL for reverse proxies and alert messages.
* `security.trustedOrigins`: domains permitted to load the dashboard and issue API requests.
* `cacheControl`: HTTP cache settings for static assets.

> **Tip:** copy the sample files and update secrets (e.g. API tokens) in environment variables or a secure secrets manager. Avoid committing environment-specific values to the repository.

## Startup scripts

### Prerequisites

1. Install Node.js 18 or newer on the deployment host.
2. Install dependencies:
   ```bash
   npm install --production
   ```
3. Make the helper scripts executable (one-time setup):
   ```bash
   chmod +x scripts/start-monitoring.sh scripts/start-dashboard.sh
   ```

### Launch the full monitoring stack

```bash
MONITORING_CONFIG=/etc/mgrnz/monitoring.config.json \
DASHBOARD_CONFIG=/etc/mgrnz/dashboard.config.json \
scripts/start-monitoring.sh
```

* Sets `NODE_ENV=production` and starts `src/startup.js`.
* Initializes `TestCycleEngine`, loads persisted pipeline state, and starts periodic monitoring tasks.
* Launches the dashboard HTTP/WebSocket server.

### Launch dashboard only

```bash
scripts/start-dashboard.sh
```

* Proxies to `start-monitoring.sh --dashboard-only`.
* Initializes the engine for read-only access without starting background monitors (useful for read replicas).

### Launch engine only (no dashboard)

```bash
scripts/start-monitoring.sh --engine-only
```

* Runs monitoring components while suppressing the dashboard web server.

## Validation checklist

After bootstrapping the service, verify:

1. `GET /api/status` returns `running: true`, a recent `bootTimestamp`, and non-empty `metrics.totalRuns` if historical data exists.
2. A synthetic pipeline fixture (see `tests/fixtures/pipeline-fixtures.js`) can be ingested end-to-end and is visible from the dashboard.
3. WebSocket clients receive `pipeline_completed` events when `TestCycleEngine` calls `completePipelineRun`.
4. Alert history is populated when `AlertManager` detects failures and cleared when `resolveAlert` is invoked.

Automated system tests (`npm test -- system`) exercise these scenarios and should pass before promoting a build to production.

## Maintenance tasks

* **Data rotation:** the engine enforces `storage.maxRecords`, but you can manually purge with `node -e "import('./src/core/test-cycle-engine.js').then(async ({ TestCycleEngine }) => { const engine = new TestCycleEngine({ dataDir: './data/production' }); await engine.initialize(); await engine.dataStore.cleanup(2000); })"`.
* **Alert hygiene:** periodically resolve stale alerts via `engine.resolveAlert(alertId)` to prevent dashboard clutter; `alerts.maxHistory` keeps the in-memory list bounded.
* **Config refresh:** edit the JSON config files and send `SIGTERM` to the running process. `startup.js` traps the signal, performs a graceful shutdown, and can be relaunched with updated settings.
* **Dependency updates:** run `npm outdated` monthly, update packages, and execute the full Vitest suite (`npm test`).

## Troubleshooting

| Symptom | Suggested action |
| --- | --- |
| Dashboard API returns 500 errors | Confirm configuration file paths (`MONITORING_CONFIG`, `DASHBOARD_CONFIG`) and inspect logs printed by `startup.js`. |
| WebSocket clients disconnect unexpectedly | Check reverse proxy timeouts and ensure `security.trustedOrigins` includes the dashboard host. |
| Alerts never resolve | Validate that automation calls `engine.resolveAlert` after recovery workflows succeed. |
| No pipeline data after restart | Ensure `engine.dataDir` points to a persistent volume and that the process user has read/write permissions. |

For emergency situations, stop the process with `SIGINT`/`SIGTERM`, correct configuration or credentials, and relaunch using the startup scripts above.
