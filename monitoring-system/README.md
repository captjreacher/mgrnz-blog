# Monitoring System Operational Guidelines

This document describes how to operate the monitoring subsystem that powers alerting, notification delivery, and dashboard updates inside the mgrnz.com deployment tooling. It focuses on the new alert lifecycle and notification plumbing introduced with the persistent `AlertManager` implementation.

## AlertManager persistence and configuration

The `AlertManager` now persists its runtime configuration in the local data directory (defaults to `monitoring-system/data`). Two files are written automatically:

| File | Purpose |
| --- | --- |
| `alert-thresholds.json` | Stores threshold values, per-alert cooldowns, and notification channel settings. |
| `alert-state.json` | Tracks acknowledgement and resolution metadata across restarts. |

Thresholds, cooldowns, or notification changes applied with `AlertManager.updateThresholds`, `AlertManager.updateNotificationSettings`, or `AlertManager.updateCooldowns` are saved to disk immediately. Importing/exporting alert configuration always reads/writes these files so that operator overrides survive process restarts.

## Alert deduplication and cooldowns

Alerts are deduplicated using a signature derived from the alert type, severity, and payload. When an alert fires, its signature is cached so subsequent identical alerts within the configured cooldown window are suppressed. The default cooldown is five minutes, but you can tailor cooldowns per alert type by updating `alerts.cooldowns` in configuration or by calling `AlertManager.updateCooldowns({ byType: { slow_pipeline: 600000 } })`.

Each active alert tracks the number of times it reoccurred (`occurrences`) and timestamps for the first and last sightings. The deduplication counters flow through to notification channels and the WebSocket feed so dashboards and downstream systems can visualize recurring issues without flooding operators.

## Alert lifecycle: acknowledgement and resolution

Acknowledging an alert (`AlertManager.acknowledgeAlert`) marks it as in progress, persists the acknowledgement metadata, and dispatches an `alert_acknowledged` event to all configured notification channels. Resolving an alert (`AlertManager.resolveAlert`) clears it from the active set, records the closure metadata, and broadcasts an `alert_resolved` event.

Because acknowledgement and resolution events are persisted, downstream tooling can rebuild accurate state even when the service restarts mid-incident.

## Notification channels

Notification delivery now runs through the shared `NotificationManager` abstraction:

* **Console** – Colour-coded console logging (enabled by default).
* **Dashboard** – Pushes alert lifecycle events over the dashboard WebSocket via the `DashboardNotificationChannel`.
* **Email** – Uses Nodemailer with configurable SMTP credentials. Enable the channel and supply recipients plus transport settings through `alerts.notifications.email`.
* **Webhook** – Posts alert payloads (including lifecycle transitions) to an HTTP endpoint using `node-fetch`. Configure the URL, headers, timeout, and SSL behaviour via `alerts.notifications.webhook`.

Lifecycle notifications (acknowledgements and resolutions) respect each channel's `notifyOnLifecycle` flag. Leave the flag enabled to receive every transition or disable it when a channel should only receive freshly generated alerts.

## Dashboard WebSocket integration

Create the `WebSocketHandler` with a `NotificationManager` instance to automatically wire dashboard broadcasts:

```js
const notificationManager = new NotificationManager();
const wsHandler = new WebSocketHandler(server, engine, notificationManager);
```

The dashboard channel binds itself to the handler and emits `alert_generated`, `alert_acknowledged`, and `alert_resolved` events that clients can subscribe to in real time. The payload includes acknowledgement status, resolution metadata, and occurrence counts.

## Feeding alerts from pipeline and webhook activity

`TestCycleEngine` now pushes events into the `AlertManager` automatically:

* Stage updates, errors, and pipeline completion trigger `AlertManager.checkAlerts` to evaluate pipeline health.
* The internal `DataStore.saveWebhookRecord` wrapper invokes `AlertManager.checkWebhookAlerts` every time a webhook event is persisted.

Call `engine.setAlertManager(alertManager)` (or pass `{ alertManager }` into the constructor) to activate the bindings. The wrapper is idempotent, so the engine can be configured before or after initialization.

## Operational checklist

1. **Configure channels** – Use `ConfigManager` or the alert manager API to define email recipients, webhook destinations, and custom cooldowns. The defaults live in `alerts.notifications` within the persisted config.
2. **Persist thresholds safely** – Treat the generated JSON files as part of your deployment state. Include them in backups if you expect to rebuild nodes or containers.
3. **Monitor storage** – The alert state files are lightweight, but if you relocate the data directory update `AlertManager` and `TestCycleEngine` configuration accordingly.
4. **Subscribe dashboards** – Ensure WebSocket clients subscribe to `alert_generated`, `alert_acknowledged`, and `alert_resolved` events to visualize the full lifecycle.

Following the checklist keeps alerting predictable and ensures operators receive the right context without flooding notification channels.
