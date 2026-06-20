#!/usr/bin/env bash
#
# Daily resilience pipeline — delegates to unified run-pipeline.js (preset 8comp-3).
#
# Usage:
#   ./scripts/daily-pipeline.sh
#   ./scripts/daily-pipeline.sh --no-transcribe
#
set -euo pipefail
cd "$(dirname "$0")/.."

ARGS=(--preset 8comp-3)
for arg in "$@"; do
  ARGS+=("$arg")
done

exec node business_modules/resilience/input/run-pipeline.js "${ARGS[@]}"
