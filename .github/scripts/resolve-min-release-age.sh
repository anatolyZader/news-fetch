#!/usr/bin/env bash
# Outputs min-release-age days for CI npm ci (empty = skip check).
# Exceptions: workflow_dispatch skip_release_age, PR label security-exception.
set -euo pipefail

days=7

if [ "${GITHUB_EVENT_NAME:-}" = "workflow_dispatch" ] && [ "${INPUT_SKIP_RELEASE_AGE:-false}" = "true" ]; then
  days=
elif [ "${GITHUB_EVENT_NAME:-}" = "pull_request" ]; then
  labels_json="${PR_LABELS_JSON:-[]}"
  if echo "$labels_json" | grep -q '"security-exception"'; then
    days=
  fi
fi

if [ -n "$days" ]; then
  echo "min-release-age=${days} days (supply-chain policy)"
else
  echo "min-release-age disabled (security exception)"
fi

echo "days=${days}" >> "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"
