#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_DIR="${ROOT_DIR}/config/production"

MONITORING_CONFIG="${MONITORING_CONFIG:-${CONFIG_DIR}/monitoring.config.json}"
DASHBOARD_CONFIG="${DASHBOARD_CONFIG:-${CONFIG_DIR}/dashboard.config.json}"

if [[ ! -f "${MONITORING_CONFIG}" ]]; then
  echo "Missing monitoring configuration: ${MONITORING_CONFIG}" >&2
  exit 1
fi

if [[ ! -f "${DASHBOARD_CONFIG}" ]]; then
  echo "Missing dashboard configuration: ${DASHBOARD_CONFIG}" >&2
  exit 1
fi

export NODE_ENV="${NODE_ENV:-production}"
export MONITORING_CONFIG
export DASHBOARD_CONFIG

echo "Starting monitoring system with config ${MONITORING_CONFIG}" >&2
exec node "${ROOT_DIR}/src/startup.js" "$@"
