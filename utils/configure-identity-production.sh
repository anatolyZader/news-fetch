#!/usr/bin/env bash
# configure-identity-production.sh
#
# Applies production auth posture via gcloud/REST + local .env (no secrets printed).
# Prerequisites: gcloud auth login (user creds with Identity Platform admin)
#
# Usage:
#   PROJECT_ID=eventstorm-1 ./utils/configure-identity-production.sh
#   ./utils/configure-identity-production.sh --restart   # also pm2 restart news + client build

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-eventstorm-1}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RESTART=false
DO_CLIENT_BUILD=false

for arg in "$@"; do
  case "$arg" in
    --restart) RESTART=true ;;
    --client-build) DO_CLIENT_BUILD=true ;;
  esac
done

info() { echo "[configure-identity] $*"; }
warn() { echo "[configure-identity] WARNING: $*" >&2; }

require_cmd() {
  command -v "$1" &>/dev/null || { echo "ERROR: '$1' required"; exit 1; }
}

require_cmd gcloud
require_cmd curl
require_cmd python3

gcloud config set project "$PROJECT_ID" --quiet

TOKEN=$(gcloud auth print-access-token --project="$PROJECT_ID")
AUTH_HDR=(-H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $PROJECT_ID" -H "Content-Type: application/json")
ITK="https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config"

set_env_var() {
  local key="$1" val="$2" file="$3"
  if [[ ! -f "$file" ]]; then
    echo "${key}=${val}" >>"$file"
    return
  fi
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$file"
  else
    echo "${key}=${val}" >>"$file"
  fi
}

info "Disabling public sign-up (Identity Platform)..."
SIGNUP_RESP=$(curl -sS -X PATCH "${ITK}?updateMask=client.permissions" \
  "${AUTH_HDR[@]}" \
  -d '{"client":{"permissions":{"disabledUserSignup":true,"disabledUserDeletion":false}}}')
python3 - <<'PY' "$SIGNUP_RESP"
import json, sys
d = json.loads(sys.argv[1])
ok = d.get("client", {}).get("permissions", {}).get("disabledUserSignup") is True
print("  disabledUserSignup:", ok)
if not ok and "error" in d:
    print("  error:", d["error"].get("message"))
    sys.exit(1)
PY

info "Enabling TOTP MFA (optional enrollment)..."
MFA_RESP=$(curl -sS -X PATCH "${ITK}?updateMask=mfa" \
  "${AUTH_HDR[@]}" \
  -d '{"mfa":{"state":"ENABLED","providerConfigs":[{"state":"ENABLED","totpProviderConfig":{"adjacentIntervals":5}}]}}')
python3 - <<'PY' "$MFA_RESP"
import json, sys
d = json.loads(sys.argv[1])
if "error" in d:
    print("  MFA not applied:", d["error"].get("message"))
    print("  → Upgrade to full Identity Platform (GCIP) in console, or enable MFA manually.")
else:
    print("  mfa state:", d.get("mfa", {}).get("state"))
PY

info "Resolving Firebase web app + App Check..."
WEB_APPS=$(curl -sS "${AUTH_HDR[@]}" \
  "https://firebase.googleapis.com/v1beta1/projects/${PROJECT_ID}/webApps")
APP_ID=$(python3 - <<'PY' "$WEB_APPS"
import json, sys
apps = json.loads(sys.argv[1]).get("apps", [])
print(apps[0]["appId"] if apps else "")
PY
)
if [[ -z "$APP_ID" ]]; then
  warn "No Firebase web app found — register one in Firebase console."
else
  AC_CFG=$(curl -sS "${AUTH_HDR[@]}" \
    "https://firebaseappcheck.googleapis.com/v1/projects/${PROJECT_ID}/apps/${APP_ID}/recaptchaEnterpriseConfig" || true)
  SITE_KEY=$(python3 - <<'PY' "$AC_CFG"
import json, sys
try:
    d = json.loads(sys.argv[1])
except json.JSONDecodeError:
    d = {}
print(d.get("siteKey", ""))
PY
  )
  if [[ -n "$SITE_KEY" ]]; then
    info "App Check site key present for app $APP_ID"
    CLIENT_ENV="${REPO_ROOT}/client/.env.local"
    set_env_var VITE_APP_CHECK_SITE_KEY "$SITE_KEY" "$CLIENT_ENV"
  else
    warn "App Check not configured — create reCAPTCHA Enterprise key and register in Firebase → App Check."
    KEYS=$(gcloud recaptcha keys list --project="$PROJECT_ID" --format="value(name)" 2>/dev/null | head -1 || true)
    if [[ -n "$KEYS" ]]; then
      SITE_KEY="${KEYS##*/}"
      info "Using reCAPTCHA key id: $SITE_KEY (register in Firebase App Check if not done)"
      set_env_var VITE_APP_CHECK_SITE_KEY "$SITE_KEY" "${REPO_ROOT}/client/.env.local"
    fi
  fi
fi

info "Updating server .env flags..."
ENV_FILE="${REPO_ROOT}/.env"
for kv in \
  "AUTH_REQUIRED=true" \
  "AUTH_REQUIRE_LISTED_USER=true" \
  "AUTH_DISABLE_SIGNUP=true" \
  "SYNC_USER_CLAIMS_ON_START=true" \
  "OPERATOR_DISTRICT_ENFORCEMENT_ENABLED=true" \
  "FIREBASE_CHECK_REVOKED=true" \
  "APP_CHECK_ENFORCE=true" \
  "ENABLE_STRICT_CSP=true" \
  "ENABLE_HSTS=true" \
  "TRUST_PROXY=true"; do
  set_env_var "${kv%%=*}" "${kv#*=}" "$ENV_FILE"
done

if [[ ! -f "$ENV_FILE" ]] || ! grep -q '^FIREBASE_PROJECT_ID=' "$ENV_FILE" 2>/dev/null; then
  set_env_var FIREBASE_PROJECT_ID "$PROJECT_ID" "$ENV_FILE"
fi

info "userAccess.json — ensure real user emails are listed (not committed secrets)."

if [[ "$DO_CLIENT_BUILD" == true ]]; then
  info "Building client..."
  (cd "$REPO_ROOT" && npm run client:build)
fi

if [[ "$RESTART" == true ]]; then
  if command -v pm2 &>/dev/null && pm2 describe news &>/dev/null; then
    info "Restarting pm2 process news..."
    pm2 restart news
  else
    warn "pm2 'news' not running — restart server manually (npm start)."
  fi
fi

cat <<DONE

[configure-identity] Complete.

GCP (automated):
  ✓ disabledUserSignup=true (if API succeeded)
  ? MFA TOTP — only if project is Identity Platform (GCIP); see warning above
  ✓ App Check site key → client/.env.local (if key exists)

Local .env flags set (see docs/env.server.example).

Manual / console still required:
  • Add each user email to config/userAccess.json (or RESILIENCE_*_EMAILS)
  • Firebase Console → App Check → enforce (if not already)
  • MFA: GCIP upgrade + enroll maintainer/developer accounts, or Workspace SSO
  • After access changes: POST /api/auth/sync-claims (maintainer) or SYNC_USER_CLAIMS_ON_START on restart

Next:
  npm run client:build   # if VITE_APP_CHECK_SITE_KEY changed
  pm2 restart news       # or: ./utils/configure-identity-production.sh --restart --client-build
DONE
