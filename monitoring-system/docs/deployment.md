# Production Deployment Guide

This document describes how to operate the monitoring system in the production environment. It covers configuration artifacts, startup scripts, operational routines, and maintenance tasks required to keep the trigger → pipeline → dashboard stack healthy.

## 1. Prerequisites

- Node.js 20.x or newer on the host that will run the monitoring stack.
- Environment variables for GitHub access and webhook secrets:
  - `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`
  - `SUPABASE_WEBHOOK_SECRET`, `MAILERLITE_WEBHOOK_SECRET`
  - Optional `MONITORING_DATA_DIR` to override the default data directory.
- Outbound network access to GitHub, Supabase edge functions, and Cloudflare Pages APIs.
- Systemd or another process supervisor to keep the Node services alive.

## 2. Configuration Artifacts

Production configuration lives in [`config/production/`](../config/production/):

- `monitoring.config.json` – runtime settings for the engine and monitors
  - `monitoring.interval`, `monitoring.timeout`, `monitoring.retryAttempts`
  - `storage` block defining retention and cleanup rules
  - `triggers` secrets for webhook validation and git polling intervals
  - `monitors` toggles for GitHub, Supabase, and MailerLite integrations
  - `alerts` thresholds and notification destinations
- `dashboard.config.json` – dashboard server host/port, WebSocket path, and CORS limits
- `start-monitoring.sh` – shell entrypoint to launch monitors and processing workers
- `start-dashboard.sh` – shell entrypoint to launch only the dashboard API/UI

Update these files before deployment with the correct hostnames, secrets, and retention policies. Committed defaults are safe templates and do not contain credentials.

## 3. Startup Scripts

Both startup scripts automatically set environment defaults and call `scripts/production-start.js`, which wires together the engine, trigger monitor, GitHub monitor, build tracker, performance analyzer, and dashboard server.

### Launch monitors + processors

```bash
./config/production/start-monitoring.sh
```

### Launch dashboard only

```bash
./config/production/start-dashboard.sh
```

Use `MONITORING_CONFIG` or `DASHBOARD_CONFIG` to point to custom configuration files. `MONITORING_DATA_DIR` overrides the on-disk persistence directory and is created automatically when the scripts run.

## 4. Runtime Management

- **Process supervision** – wrap the startup scripts in systemd services or PM2 to guarantee restart on failure.
- **Logs** – stdout/stderr contain structured JSON logs from monitors; rotate using `logrotate` or supervisor-specific tooling.
- **Health probes** – dashboard exposes `/health` and `/api/status`. Configure your load balancer to hit these endpoints for liveness.
- **Graceful shutdown** – `SIGINT`/`SIGTERM` triggers the production starter to stop monitoring intervals and close the dashboard server cleanly.

## 5. Maintenance Tasks

| Task | Frequency | Command/Action |
| ---- | --------- | -------------- |
| Data retention cleanup | Daily | Engine automatically enforces `storage.maxRecords`; adjust in `monitoring.config.json` if load changes. |
| Back up state | Weekly | Archive `${MONITORING_DATA_DIR}` (pipeline runs, metrics, alert history). |
| Token rotation | Quarterly | Rotate GitHub personal access tokens and Supabase secrets, then restart services. |
| Dependency updates | Monthly | Pull latest repo changes, run `npm install`, then redeploy. |

## 6. Recovery Playbook

1. Inspect `/api/pipeline-runs?status=failed` for the most recent failures.
2. Review generated alerts (pipeline failure, slow pipeline, stage failure) to determine the faulty stage.
3. Trigger a manual rerun by replaying the Supabase webhook or dispatching the GitHub workflow.
4. Validate dashboard metrics return to normal ranges (response time < threshold, build time < threshold).
5. If filesystem corruption is suspected, restore the latest `${MONITORING_DATA_DIR}` backup before restarting services.

## 7. Alerting Integration

The engine emits alert events for:

- `pipeline_failure` – unsuccessful runs
- `slow_pipeline` – runs exceeding `alerts.thresholds.responseTime`
- `stage_failure` – any stage marked as failed

Extend `monitoring.config.json` → `alerts.notifications` to enable email or webhook forwarding. Dashboard clients subscribe to WebSocket events for live alert streaming.

## 8. Verification Checklist

After deployment or restart:

1. `curl http://localhost:8080/health` returns HTTP 200.
2. `curl http://localhost:8080/api/pipeline-runs?limit=5` returns JSON with recent runs.
3. GitHub monitor logs show successful polling (no authentication errors).
4. A synthetic webhook replay creates a new pipeline run visible on the dashboard.
5. Alert counts reset after recovery and new alerts appear only on subsequent failures.

Follow this guide to keep the monitoring stack reliable, observable, and ready for production workloads.
