#!/usr/bin/env bash
# Cloudflare cutover: DNS (proxied), Full (strict), Bot Fight, AI bots, DMARC, webhook rate limit.
# Idempotent — safe to re-run.
#
# Usage:
#   export CLOUDFLARE_API_TOKEN='...'   # or add to repo .env (gitignored)
#   ./scripts/ops/cloudflare-cutover.sh
#
# Optional env:
#   CLOUDFLARE_ZONE_NAME=srulik.ai
#   VM_PUBLIC_IP=34.165.63.234
#   WEBHOOK_RATE_PER_MIN=200
#   DMARC_RUA_EMAIL=security@srulik.ai
#   DRY_RUN=1
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# Load only CLOUDFLARE_* from repo .env (avoid sourcing full .env — may contain unquoted values).
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" && -f "${ROOT}/.env" ]]; then
  while IFS= read -r line || [[ -n "${line}" ]]; do
    [[ "${line}" =~ ^[[:space:]]*# ]] && continue
    [[ "${line}" =~ ^[[:space:]]*$ ]] && continue
    if [[ "${line}" =~ ^CLOUDFLARE_[A-Za-z0-9_]+= ]]; then
      key="${line%%=*}"
      val="${line#*=}"
      export "${key}=${val}"
    fi
  done < "${ROOT}/.env"
fi

API="https://api.cloudflare.com/client/v4"
ZONE_NAME="${CLOUDFLARE_ZONE_NAME:-srulik.ai}"
VM_IP="${VM_PUBLIC_IP:-34.165.63.234}"
WEBHOOK_RATE="${WEBHOOK_RATE_PER_MIN:-200}"
DMARC_RUA="${DMARC_RUA_EMAIL:-security@srulik.ai}"
DRY_RUN="${DRY_RUN:-0}"

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "ERROR: Set CLOUDFLARE_API_TOKEN (Zone:Edit, DNS:Edit, Zone Settings:Edit, Bot Fight:Edit, WAF:Edit)"
  echo "Dashboard fallback: cross-cut-modules/docs/content/pages/operations/manual-cutover-gcp-cloudflare.md §4"
  exit 1
fi

cf_api() {
  local method="$1" path="$2"
  shift 2
  if [[ "${DRY_RUN}" == "1" ]]; then
    echo "[dry-run] ${method} ${API}${path} $*"
    return 0
  fi
  curl -sS -X "${method}" "${API}${path}" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "$@"
}

cf_result_ok() {
  python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get("success") else 1)' 2>/dev/null
}

resolve_zone_id() {
  local resp
  resp="$(cf_api GET "/zones?name=${ZONE_NAME}")"
  echo "${resp}" | python3 -c "
import json, sys
d = json.load(sys.stdin)
if not d.get('success') or not d.get('result'):
    print('ERROR: zone not found', file=sys.stderr)
    sys.exit(1)
print(d['result'][0]['id'])
"
}

patch_zone_setting() {
  local zone_id="$1" setting="$2" value="$3"
  echo "Setting ${setting}=${value}..."
  local resp
  resp="$(cf_api PATCH "/zones/${zone_id}/settings/${setting}" --data "{\"value\":\"${value}\"}")"
  if [[ "${DRY_RUN}" != "1" ]]; then
    echo "${resp}" | cf_result_ok || { echo "${resp}"; exit 1; }
  fi
}

ensure_dns_a() {
  local zone_id="$1" name="$2"
  echo "DNS A ${name} → ${VM_IP} (proxied)..."
  local resp records
  resp="$(cf_api GET "/zones/${zone_id}/dns_records?type=A&name=${name}")"
  if [[ "${DRY_RUN}" == "1" ]]; then return 0; fi
  records="$(echo "${resp}" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(len(d.get('result') or []))
for r in d.get('result') or []:
    print(r['id'], r['content'], r.get('proxied'))
")"
  local count
  count="$(echo "${records}" | head -1)"
  if [[ "${count}" == "0" ]]; then
    cf_api POST "/zones/${zone_id}/dns_records" --data "{
      \"type\":\"A\",\"name\":\"${name}\",\"content\":\"${VM_IP}\",\"proxied\":true,\"ttl\":1
    }" | cf_result_ok
  else
    local record_id content proxied
    read -r record_id content proxied <<< "$(echo "${records}" | sed -n '2p')"
    if [[ "${content}" != "${VM_IP}" || "${proxied}" != "True" ]]; then
      cf_api PATCH "/zones/${zone_id}/dns_records/${record_id}" --data "{
        \"type\":\"A\",\"name\":\"${name}\",\"content\":\"${VM_IP}\",\"proxied\":true,\"ttl\":1
      }" | cf_result_ok
    else
      echo "  OK: already ${VM_IP} proxied"
    fi
  fi
}

enable_bot_fight() {
  local zone_id="$1"
  echo "Enabling Bot Fight Mode, AI bot block, and AI Labyrinth..."
  local resp
  resp="$(cf_api PUT "/zones/${zone_id}/bot_management" --data '{
    "fight_mode": true,
    "enable_js": true,
    "ai_bots_protection": "block",
    "crawler_protection": "enabled",
    "cf_robots_variant": "policy_only"
  }')"
  if [[ "${DRY_RUN}" != "1" ]]; then
    echo "${resp}" | cf_result_ok || {
      echo "WARN: bot_management API failed (plan may use dashboard toggle only):"
      echo "${resp}" | python3 -m json.tool 2>/dev/null || echo "${resp}"
    }
  fi
}

ensure_dmarc_txt() {
  local zone_id="$1" record_name="$2" content="$3"
  echo "DMARC TXT ${record_name}..."
  if [[ "${DRY_RUN}" == "1" ]]; then return 0; fi
  local resp fqdn
  fqdn="${record_name}.${ZONE_NAME}"
  [[ "${record_name}" == "_dmarc" ]] && fqdn="_dmarc.${ZONE_NAME}"
  [[ "${record_name}" == "_dmarc.send" ]] && fqdn="_dmarc.send.${ZONE_NAME}"
  resp="$(cf_api GET "/zones/${zone_id}/dns_records?type=TXT&name=${fqdn}")"
  local count
  count="$(echo "${resp}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('result') or []))")"
  if [[ "${count}" == "0" ]]; then
    cf_api POST "/zones/${zone_id}/dns_records" --data "{
      \"type\":\"TXT\",\"name\":\"${record_name}\",\"content\":\"${content}\",\"ttl\":3600
    }" | cf_result_ok
  else
    echo "  OK: ${fqdn} exists"
  fi
}

ensure_webhook_rate_limit() {
  local zone_id="$1"
  # Free plan: period and mitigation_timeout must be 10s; ~34 req/10s ≈ 200/min
  local expr='(starts_with(http.request.uri.path, "/api/webhooks/"))'
  local period=10
  local per_period=$(( (WEBHOOK_RATE * period + 59) / 60 ))
  if [[ "${per_period}" -lt 1 ]]; then per_period=1; fi
  echo "Rate limit webhooks: ~${WEBHOOK_RATE}/min (${per_period} per ${period}s) per IP..."

  if [[ "${DRY_RUN}" == "1" ]]; then return 0; fi

  local entry ruleset_id resp
  entry="$(cf_api GET "/zones/${zone_id}/rulesets/phases/http_ratelimit/entrypoint")"
  ruleset_id="$(echo "${entry}" | python3 -c "
import json, sys
d = json.load(sys.stdin)
if d.get('success') and d.get('result'):
    print(d['result']['id'])
")"

  if [[ -z "${ruleset_id}" ]]; then
    echo "Creating http_ratelimit entrypoint ruleset..."
    entry="$(cf_api POST "/zones/${zone_id}/rulesets" --data "{
      \"name\":\"default\",\"kind\":\"zone\",\"phase\":\"http_ratelimit\",\"rules\":[]
    }")"
    ruleset_id="$(echo "${entry}" | python3 -c "import json,sys; r=json.load(sys.stdin); print(r['result']['id'] if r.get('success') else ''); sys.exit(0 if r.get('success') else 1)" )" || {
      echo "${entry}" | python3 -m json.tool 2>/dev/null || echo "${entry}"
      exit 1
    }
  fi

  local rules
  rules="$(cf_api GET "/zones/${zone_id}/rulesets/${ruleset_id}")"
  if echo "${rules}" | python3 -c "
import json, sys
d = json.load(sys.stdin)
for r in d.get('result', {}).get('rules') or []:
    if r.get('description') == 'webhook-rate-limit':
        sys.exit(0)
sys.exit(1)
"; then
    echo "  OK: webhook-rate-limit rule exists"
    return 0
  fi

  resp="$(cf_api POST "/zones/${zone_id}/rulesets/${ruleset_id}/rules" --data "{
    \"description\": \"webhook-rate-limit\",
    \"expression\": \"${expr}\",
    \"action\": \"block\",
    \"enabled\": true,
    \"ratelimit\": {
      \"characteristics\": [\"cf.colo.id\", \"ip.src\"],
      \"period\": ${period},
      \"requests_per_period\": ${per_period},
      \"mitigation_timeout\": ${period}
    }
  }")"
  echo "${resp}" | cf_result_ok || {
    echo "WARN: rate limit rule failed (free plan may need dashboard):"
    echo "${resp}" | python3 -m json.tool 2>/dev/null || echo "${resp}"
    return 1
  }
}

verify_external() {
  echo
  echo "=== Verify (public) ==="
  echo "  dig +short ${ZONE_NAME} A    # expect Cloudflare proxy IPs (not ${VM_IP})"
  dig +short "${ZONE_NAME}" A 2>/dev/null || true
  echo
  curl -sSI "https://${ZONE_NAME}/api/monitoring/health" 2>&1 | grep -iE 'HTTP|cf-ray|strict-transport' || true
  echo
  echo "Dashboard checks:"
  echo "  SSL/TLS → Overview → Full (strict)"
  echo "  Security → Bots → Bot Fight Mode ON, AI bots blocked, AI Labyrinth ON"
  echo "  Security → WAF → Rate limiting → webhook-rate-limit"
  echo "  DNS → _dmarc TXT records present"
  dig +short "TXT" "_dmarc.${ZONE_NAME}" 2>/dev/null || true
  curl -sS "https://${ZONE_NAME}/.well-known/security.txt" 2>/dev/null | head -4 || true
}

echo "Zone:    ${ZONE_NAME}"
echo "VM IP:   ${VM_IP}"
echo "Dry run: ${DRY_RUN}"
echo

ZONE_ID="$(resolve_zone_id)"
echo "Zone ID: ${ZONE_ID}"
echo

ensure_dns_a "${ZONE_ID}" "${ZONE_NAME}"
ensure_dns_a "${ZONE_ID}" "www.${ZONE_NAME}"
patch_zone_setting "${ZONE_ID}" "ssl" "strict"
patch_zone_setting "${ZONE_ID}" "always_use_https" "on"
enable_bot_fight "${ZONE_ID}"
DMARC_CONTENT="v=DMARC1; p=none; rua=mailto:${DMARC_RUA}; fo=1"
ensure_dmarc_txt "${ZONE_ID}" "_dmarc" "${DMARC_CONTENT}"
ensure_dmarc_txt "${ZONE_ID}" "_dmarc.send" "${DMARC_CONTENT}"
ensure_webhook_rate_limit "${ZONE_ID}"
verify_external

echo
echo "Done."
