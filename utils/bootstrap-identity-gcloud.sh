#!/usr/bin/env bash
# bootstrap-identity-gcloud.sh
#
# Automates the gcloud-scriptable steps from docs/IDENTITY_PLATFORM_SETUP.md:
#   - Enable required APIs
#   - Create service account + grant Identity Toolkit Admin role
#   - Download SA key to secrets/service-account.json
#   - Write root .env and client/.env.local stubs
#
# Prerequisites (run once before this script):
#   gcloud auth login
#   gcloud auth application-default login
#
# Usage:
#   PROJECT_ID=my-project ./utils/bootstrap-identity-gcloud.sh
#
# Optional overrides (env vars):
#   SA_NAME          Service account name        (default: news-api-identity)
#   KEY_PATH         SA key output path           (default: secrets/service-account.json)
#   BILLING_ACCOUNT  Billing account ID to link   (default: skip)
#
# After this script:
#   - Open Firebase console, link the project, register a Web app, and
#     paste the apiKey/authDomain/projectId into client/.env.local
#   - Enable Email/Password and Google sign-in providers in Firebase console
#   - Add authorized domains (localhost + prod host) in Firebase Auth settings
#   - Configure the OAuth consent screen in GCP console

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID to your GCP project ID}"
SA_NAME="${SA_NAME:-news-api-identity}"
KEY_PATH="${KEY_PATH:-secrets/service-account.json}"
BILLING_ACCOUNT="${BILLING_ACCOUNT:-}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY_ABS="${REPO_ROOT}/${KEY_PATH}"

# ── Helpers ───────────────────────────────────────────────────────────────────

info()  { echo "[bootstrap] $*"; }
warn()  { echo "[bootstrap] WARNING: $*" >&2; }

require_cmd() {
  command -v "$1" &>/dev/null || { echo "ERROR: '$1' not found. Install it and retry."; exit 1; }
}

require_cmd gcloud

# ── Step 1: Set active project ─────────────────────────────────────────────

info "Setting active project to '$PROJECT_ID'..."
gcloud config set project "$PROJECT_ID" --quiet

# ── Step 2: Link billing (optional) ──────────────────────────────────────────

if [[ -n "$BILLING_ACCOUNT" ]]; then
  info "Linking billing account '$BILLING_ACCOUNT'..."
  gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT"
else
  warn "BILLING_ACCOUNT not set — skipping billing link. Identity Platform may require billing."
fi

# ── Step 3: Enable APIs ───────────────────────────────────────────────────────

APIS=(
  identitytoolkit.googleapis.com   # Identity Platform / Identity Toolkit
  iamcredentials.googleapis.com    # needed for ADC / token exchange
  cloudresourcemanager.googleapis.com
)

for api in "${APIS[@]}"; do
  info "Enabling $api..."
  gcloud services enable "$api" --project="$PROJECT_ID" --quiet
done

# ── Step 4: Service account ────────────────────────────────────────────────

SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

if gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" &>/dev/null; then
  info "Service account '$SA_EMAIL' already exists — skipping create."
else
  info "Creating service account '$SA_NAME'..."
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="News app — Identity Platform" \
    --project="$PROJECT_ID"
fi

# ── Step 5: Grant role ─────────────────────────────────────────────────────

info "Granting roles/identitytoolkit.admin to '$SA_EMAIL'..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/identitytoolkit.admin" \
  --condition=None \
  --quiet

# ── Step 6: SA key ────────────────────────────────────────────────────────

mkdir -p "$(dirname "$KEY_ABS")"

if [[ -f "$KEY_ABS" ]]; then
  warn "Key file already exists at '$KEY_PATH' — skipping download. Delete it first to regenerate."
else
  info "Downloading SA key to '$KEY_PATH'..."
  gcloud iam service-accounts keys create "$KEY_ABS" \
    --iam-account="$SA_EMAIL" \
    --project="$PROJECT_ID"
  chmod 600 "$KEY_ABS"
  info "Key written. DO NOT commit this file."
fi

# ── Step 7: Write root .env stub ──────────────────────────────────────────

ENV_FILE="${REPO_ROOT}/.env"

if [[ -f "$ENV_FILE" ]]; then
  warn ".env already exists — not overwriting. Verify these variables are set:"
  cat <<ENV_HINT
  AUTH_REQUIRED=true
  FIREBASE_PROJECT_ID=${PROJECT_ID}
  GOOGLE_APPLICATION_CREDENTIALS=./${KEY_PATH}   # local dev only; omit in production
ENV_HINT
else
  info "Writing root .env stub..."
  cat > "$ENV_FILE" <<EOF
# Root .env — server only. Do not commit this file.
# Browser/client config goes in client/.env.local (VITE_FIREBASE_*).

NEWSAPI_API_KEY=

AUTH_REQUIRED=true
FIREBASE_PROJECT_ID=${PROJECT_ID}

# Local dev only: path to service account JSON key.
# Production on GCP: omit this — use runtime service account (ADC) instead.
GOOGLE_APPLICATION_CREDENTIALS=./${KEY_PATH}
EOF
  info ".env written."
fi

# ── Step 8: Write client/.env.local stub ──────────────────────────────────

CLIENT_ENV="${REPO_ROOT}/client/.env.local"

if [[ -f "$CLIENT_ENV" ]]; then
  warn "client/.env.local already exists — not overwriting."
else
  info "Writing client/.env.local stub (fill VITE_FIREBASE_* from Firebase console)..."
  cat > "$CLIENT_ENV" <<EOF
# client/.env.local — fill from Firebase console → Project settings → Web app.
# Do not commit this file.

VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=${PROJECT_ID}.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=${PROJECT_ID}
EOF
  info "client/.env.local written."
fi

# ── Done ───────────────────────────────────────────────────────────────────

cat <<DONE

[bootstrap] Done. Automated steps complete.

Still required in browser / Firebase console:
  1. Link Firebase to this GCP project:
       https://console.firebase.google.com/ → Import Google Cloud project → ${PROJECT_ID}
  2. Register a Web app → copy apiKey, authDomain into client/.env.local
  3. Authentication → Sign-in method → enable Email/Password and Google
  4. Authentication → Settings → Authorized domains → add localhost + prod host
  5. OAuth consent screen (if using Google sign-in):
       https://console.cloud.google.com/apis/credentials/consent?project=${PROJECT_ID}

Production note:
  Do NOT set GOOGLE_APPLICATION_CREDENTIALS in production.
  Attach the service account to your Cloud Run service instead:
    gcloud run services update SERVICE_NAME \\
      --service-account=${SA_EMAIL} \\
      --region=REGION

Then verify:
  npm run check-identity-env
  npm run client:build
  npm start
DONE
