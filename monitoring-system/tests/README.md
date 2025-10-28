# Monitoring System Tests

The monitoring system uses [Vitest](https://vitest.dev/) for unit and integration testing. All commands should be executed from the `monitoring-system` directory.

## Install dependencies

```bash
npm install
```

## Run the full test suite

```bash
npm test
```

## Run specific test files

Run the alert manager unit tests, including channel routing coverage:

```bash
npm test -- tests/alerts/alert-manager.test.js
```

Run the WebSocket handler unit tests:

```bash
npm test -- tests/dashboard/websocket-handler.test.js
```

Run the dashboard alert integration tests (starts a local HTTP/WebSocket server on a random port):

```bash
npm test -- tests/integration/dashboard-alerts.integration.test.js
```

> **Note:** The integration tests spin up the dashboard server and open WebSocket connections. Ensure the chosen ports are available and no other process is bound to them during the run.
