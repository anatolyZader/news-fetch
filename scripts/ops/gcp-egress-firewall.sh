#!/usr/bin/env bash
# GCP egress firewall: block private/metadata destinations (SSRF / yt-dlp), allow HTTPS out.
# Idempotent — skips create if rules already exist.
#
# Targets VMs with tag news-app (e.g. vibeswitch-1).
#
# Usage:
#   ./scripts/ops/gcp-egress-firewall.sh
#
# WARNING: Denying 10.0.0.0/8 egress breaks outbound calls to private IPs (Cloud SQL
# private IP, internal Redis, etc.). Skip or customize if you rely on those.
set -euo pipefail

PROJECT="${GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
NETWORK="${VPC_NETWORK:-default}"
TAG="${VM_NETWORK_TAG:-news-app}"

ALLOW_RULE="allow-${TAG}-egress-https"
DENY_RULE="deny-${TAG}-egress-rfc1918"

PRIVATE_RANGES="10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,169.254.0.0/16"

if [[ -z "${PROJECT}" || "${PROJECT}" == "(unset)" ]]; then
  echo "ERROR: Set GCP_PROJECT or run: gcloud config set project YOUR_PROJECT"
  exit 1
fi

echo "Project: ${PROJECT}"
echo "Network: ${NETWORK}"
echo "VM tag:  ${TAG}"
echo

rule_exists() {
  gcloud compute firewall-rules describe "$1" --project="${PROJECT}" >/dev/null 2>&1
}

create_allow_https_egress() {
  if rule_exists "${ALLOW_RULE}"; then
    echo "Firewall rule exists: ${ALLOW_RULE}"
    return 0
  fi
  echo "Creating ${ALLOW_RULE} (egress tcp:443 to internet)..."
  gcloud compute firewall-rules create "${ALLOW_RULE}" \
    --project="${PROJECT}" \
    --network="${NETWORK}" \
    --direction=EGRESS \
    --priority=1000 \
    --action=ALLOW \
    --rules=tcp:443 \
    --destination-ranges=0.0.0.0/0 \
    --target-tags="${TAG}" \
    --description="Allow outbound HTTPS from ${TAG} VMs (APIs, yt-dlp over TLS)"
}

create_deny_private_egress() {
  if rule_exists "${DENY_RULE}"; then
    echo "Firewall rule exists: ${DENY_RULE}"
    return 0
  fi
  echo "Creating ${DENY_RULE} (deny egress to RFC1918 + link-local/metadata)..."
  gcloud compute firewall-rules create "${DENY_RULE}" \
    --project="${PROJECT}" \
    --network="${NETWORK}" \
    --direction=EGRESS \
    --priority=900 \
    --action=DENY \
    --rules=all \
    --destination-ranges="${PRIVATE_RANGES}" \
    --target-tags="${TAG}" \
    --description="Block SSRF/metadata/private egress from ${TAG} VMs (yt-dlp, curl)"
}

verify_rules() {
  echo
  echo "=== Egress rules ==="
  gcloud compute firewall-rules list --project="${PROJECT}" \
    --filter="name=( ${ALLOW_RULE} ${DENY_RULE} )" \
    --format='table(name,direction,priority,targetTags.list(),destinationRanges.list():label=DEST,allowed[].map().firewall_rule().list():label=ALLOW,denied[].map().firewall_rule().list():label=DENY)'
  echo
  echo "=== Verify ON the VM (SSH to vibeswitch-1) ==="
  echo "  curl -sS --connect-timeout 2 http://169.254.169.254/ && echo FAIL || echo 'OK: metadata blocked'"
  echo "  curl -sS --connect-timeout 5 -o /dev/null -w '%{http_code}\n' https://www.google.com"
  echo
  echo "Rollback:"
  echo "  gcloud compute firewall-rules delete ${DENY_RULE} --project=${PROJECT} --quiet"
  echo "  gcloud compute firewall-rules delete ${ALLOW_RULE} --project=${PROJECT} --quiet"
}

create_allow_https_egress
create_deny_private_egress
verify_rules

echo "Done."
