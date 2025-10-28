#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

export NODE_ENV="production"
export MONITORING_CONFIG="${MONITORING_CONFIG:-${PROJECT_ROOT}/config/production/monitoring.config.json}"
export DASHBOARD_CONFIG="${DASHBOARD_CONFIG:-${PROJECT_ROOT}/config/production/dashboard.config.json}"
export MONITORING_DATA_DIR="${MONITORING_DATA_DIR:-/var/lib/monitoring-system/data}"

mkdir -p "${MONITORING_DATA_DIR}"

cd "${PROJECT_ROOT}"
node ./scripts/production-start.js monitoring
