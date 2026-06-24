#!/usr/bin/env bash
# srulik.ai DNS Option B: apex/www/analyst → VM, docs → Cloudflare Pages.
# Requires CLOUDFLARE_SRULIK_API_TOKEN in .env (zone token for srulik.ai account).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

export CLOUDFLARE_ZONE_NAME=srulik.ai
export DOCS_HOSTING=pages
export DOCS_CNAME_TARGET="${DOCS_CNAME_TARGET:-news-fetch-abl.pages.dev}"

if [[ -z "${CLOUDFLARE_SRULIK_API_TOKEN:-}" && -f "${ROOT}/.env" ]]; then
  while IFS= read -r line || [[ -n "${line}" ]]; do
    [[ "${line}" =~ ^[[:space:]]*# ]] && continue
    [[ "${line}" =~ ^[[:space:]]*$ ]] && continue
    if [[ "${line}" =~ ^CLOUDFLARE_SRULIK_API_TOKEN= ]]; then
      export CLOUDFLARE_SRULIK_API_TOKEN="${line#CLOUDFLARE_SRULIK_API_TOKEN=}"
    fi
  done < "${ROOT}/.env"
fi

if [[ -z "${CLOUDFLARE_SRULIK_API_TOKEN:-}" ]]; then
  echo "ERROR: Add CLOUDFLARE_SRULIK_API_TOKEN to .env (zone-scoped token for srulik.ai)."
  echo "  Permissions: Zone:DNS:Edit, Zone:Zone:Read, Zone:Zone Settings:Edit"
  echo "  Manual records: scripts/ops/srulik-dns-records.txt (Option B)"
  exit 1
fi

exec "${ROOT}/scripts/ops/cloudflare-cutover.sh"
