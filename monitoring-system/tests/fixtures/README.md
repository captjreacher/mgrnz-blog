# Test Fixtures

This directory collects reusable data fixtures for the monitoring system test suites. Keep the files lightweight and
focused on realistic pipeline, workflow, and metrics payloads so the analytics and reporting tests exercise meaningful
scenarios.

## Guidelines
- Prefer exporting factory helpers from `sample-data.js` so tests can create fresh copies without mutating shared state.
- Keep timestamps in ISO 8601 format and durations in milliseconds to match the production data model.
- Update this directory when new analytics or reporting behaviours require additional structured fixtures.
