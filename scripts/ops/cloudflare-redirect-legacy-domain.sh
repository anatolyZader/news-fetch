#!/usr/bin/env bash
# Cloudflare 301 redirects: legacy vibeswitch.ai zone → srulik.ai (and subdomains).
# Idempotent — safe to re-run.
#
# Usage:
#   export CLOUDFLARE_API_TOKEN='...'   # or add to repo .env (gitignored)
#   ./scripts/ops/cloudflare-redirect-legacy-domain.sh
#
# Optional env:
#   LEGACY_ZONE_NAME=vibeswitch.ai
#   TARGET_APEX=srulik.ai
#   DRY_RUN=1
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
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
LEGACY_ZONE="${LEGACY_ZONE_NAME:-vibeswitch.ai}"
TARGET_APEX="${TARGET_APEX:-srulik.ai}"
DRY_RUN="${DRY_RUN:-0}"

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "ERROR: Set CLOUDFLARE_API_TOKEN (Zone:Edit, Account Rulesets:Edit or equivalent)"
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
  local name="$1"
  local resp
  resp="$(cf_api GET "/zones?name=${name}")"
  echo "${resp}" | python3 -c "
import json, sys
d = json.load(sys.stdin)
if not d.get('success') or not d.get('result'):
    print('ERROR: zone not found', file=sys.stderr)
    sys.exit(1)
print(d['result'][0]['id'])
"
}

ensure_redirect_rule() {
  local zone_id="$1" description="$2" expression="$3" target_expr="$4"
  echo "Redirect rule: ${description}..."

  if [[ "${DRY_RUN}" == "1" ]]; then return 0; fi

  local entry ruleset_id resp rules
  entry="$(cf_api GET "/zones/${zone_id}/rulesets/phases/http_request_dynamic_redirect/entrypoint")"
  ruleset_id="$(echo "${entry}" | python3 -c "
import json, sys
d = json.load(sys.stdin)
if d.get('success') and d.get('result'):
    print(d['result']['id'])
")"

  if [[ -z "${ruleset_id}" ]]; then
    echo "Creating http_request_dynamic_redirect entrypoint ruleset..."
    entry="$(cf_api POST "/zones/${zone_id}/rulesets" --data '{
      "name": "default",
      "kind": "zone",
      "phase": "http_request_dynamic_redirect",
      "rules": []
    }')"
    ruleset_id="$(echo "${entry}" | python3 -c "
import json, sys
r = json.load(sys.stdin)
print(r['result']['id'] if r.get('success') else '')
sys.exit(0 if r.get('success') else 1)
")" || {
      echo "${entry}" | python3 -m json.tool 2>/dev/null || echo "${entry}"
      exit 1
    }
  fi

  rules="$(cf_api GET "/zones/${zone_id}/rulesets/${ruleset_id}")"
  if echo "${rules}" | python3 -c "
import json, sys
desc = sys.argv[1]
d = json.load(sys.stdin)
for r in d.get('result', {}).get('rules') or []:
    if r.get('description') == desc:
        sys.exit(0)
sys.exit(1)
" "${description}"; then
    echo "  OK: ${description} already exists"
    return 0
  fi

  resp="$(cf_api POST "/zones/${zone_id}/rulesets/${ruleset_id}/rules" --data "{
    \"description\": \"${description}\",
    \"expression\": \"${expression}\",
    \"action\": \"redirect\",
    \"action_parameters\": {
      \"from_value\": {
        \"status_code\": 301,
        \"target_url\": {
          \"expression\": \"${target_expr}\"
        },
        \"preserve_query_string\": true
      }
    },
    \"enabled\": true
  }")"
  echo "${resp}" | cf_result_ok || {
    echo "WARN: redirect rule failed:"
    echo "${resp}" | python3 -m json.tool 2>/dev/null || echo "${resp}"
    return 1
  }
}

echo "Legacy zone: ${LEGACY_ZONE} → ${TARGET_APEX}"
echo "Dry run:     ${DRY_RUN}"
echo

ZONE_ID="$(resolve_zone_id "${LEGACY_ZONE}")"
echo "Zone ID: ${ZONE_ID}"
echo

# Apex and www → srulik.ai (same path)
ensure_redirect_rule "${ZONE_ID}" "legacy-apex-to-srulik" \
  "(http.host eq \"${LEGACY_ZONE}\")" \
  "concat(\"https://${TARGET_APEX}\", http.request.uri.path)"

ensure_redirect_rule "${ZONE_ID}" "legacy-www-to-srulik" \
  "(http.host eq \"www.${LEGACY_ZONE}\")" \
  "concat(\"https://${TARGET_APEX}\", http.request.uri.path)"

# Subdomains → matching srulik subdomains
ensure_redirect_rule "${ZONE_ID}" "legacy-docs-to-srulik-docs" \
  "(http.host eq \"docs.${LEGACY_ZONE}\")" \
  "concat(\"https://docs.${TARGET_APEX}\", http.request.uri.path)"

ensure_redirect_rule "${ZONE_ID}" "legacy-developer-to-srulik-developer" \
  "(http.host eq \"developer.${LEGACY_ZONE}\")" \
  "concat(\"https://developer.${TARGET_APEX}\", http.request.uri.path)"

echo
echo "Done. Verify:"
echo "  curl -sSI https://${LEGACY_ZONE}/ | grep -i location"
echo "  curl -sSI https://docs.${LEGACY_ZONE}/ | grep -i location"
