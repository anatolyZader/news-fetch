#!/usr/bin/env bash
# GCP ingress firewall: allow HTTP/HTTPS, deny direct app port 3000.
# Idempotent — skips create if rules already exist.
#
# Usage:
#   ./scripts/ops/gcp-ingress-firewall.sh
#   GCP_PROJECT=eventstorm-1 GCP_VM=vibeswitch-1 ./scripts/ops/gcp-ingress-firewall.sh
#
# Requires: gcloud auth and compute.firewalls.create permission.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROJECT="${GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
NETWORK="${VPC_NETWORK:-default}"
TAG="${VM_NETWORK_TAG:-news-app}"
VM_NAME="${GCP_VM:-vibeswitch-1}"
VM_ZONE="${GCP_ZONE:-me-west1-b}"

ALLOW_RULE="allow-${TAG}-web"
DENY_RULE="deny-${TAG}-port-3000"

if [[ -z "${PROJECT}" || "${PROJECT}" == "(unset)" ]]; then
  echo "ERROR: Set GCP_PROJECT or run: gcloud config set project YOUR_PROJECT"
  exit 1
fi

echo "Project:  ${PROJECT}"
echo "Network:  ${NETWORK}"
echo "VM tag:   ${TAG}"
echo "VM:       ${VM_NAME} (${VM_ZONE})"
echo

rule_exists() {
  gcloud compute firewall-rules describe "$1" --project="${PROJECT}" >/dev/null 2>&1
}

ensure_vm_tag() {
  local existing
  existing="$(gcloud compute instances describe "${VM_NAME}" \
    --project="${PROJECT}" --zone="${VM_ZONE}" \
    --format='value(tags.items)' 2>/dev/null || true)"
  if [[ "${existing}" == *"${TAG}"* ]]; then
    echo "VM ${VM_NAME} already has tag: ${TAG}"
    return 0
  fi
  echo "Adding tag ${TAG} to ${VM_NAME} (preserving existing tags)..."
  gcloud compute instances add-tags "${VM_NAME}" \
    --project="${PROJECT}" \
    --zone="${VM_ZONE}" \
    --tags="${TAG}"
}

create_allow_web() {
  if rule_exists "${ALLOW_RULE}"; then
    echo "Firewall rule exists: ${ALLOW_RULE}"
    return 0
  fi
  echo "Creating ${ALLOW_RULE} (tcp:80,443 from 0.0.0.0/0)..."
  gcloud compute firewall-rules create "${ALLOW_RULE}" \
    --project="${PROJECT}" \
    --network="${NETWORK}" \
    --direction=INGRESS \
    --priority=1000 \
    --action=ALLOW \
    --rules=tcp:80,tcp:443 \
    --source-ranges=0.0.0.0/0 \
    --target-tags="${TAG}" \
    --description="Allow public HTTP/HTTPS to ${TAG} VMs (news app behind nginx)"
}

create_deny_3000() {
  if rule_exists "${DENY_RULE}"; then
    echo "Firewall rule exists: ${DENY_RULE}"
    return 0
  fi
  echo "Creating ${DENY_RULE} (deny tcp:3000, priority 900)..."
  gcloud compute firewall-rules create "${DENY_RULE}" \
    --project="${PROJECT}" \
    --network="${NETWORK}" \
    --direction=INGRESS \
    --priority=900 \
    --action=DENY \
    --rules=tcp:3000 \
    --source-ranges=0.0.0.0/0 \
    --target-tags="${TAG}" \
    --description="Block public access to Node :3000 on ${TAG} VMs; use nginx :443"
}

verify_vm() {
  local ip tags
  ip="$(gcloud compute instances describe "${VM_NAME}" \
    --project="${PROJECT}" --zone="${VM_ZONE}" \
    --format='get(networkInterfaces[0].accessConfigs[0].natIP)')"
  tags="$(gcloud compute instances describe "${VM_NAME}" \
    --project="${PROJECT}" --zone="${VM_ZONE}" \
    --format='value(tags.items)')"
  echo
  echo "=== Verification (${VM_NAME} @ ${ip}) ==="
  echo "Tags: ${tags}"
  echo
  echo "From this machine (or your laptop):"
  echo "  nc -vz ${ip} 443    # expect: open"
  echo "  nc -vz ${ip} 80     # expect: open"
  echo "  nc -vz ${ip} 3000   # expect: refused or timeout"
  echo
  gcloud compute firewall-rules list --project="${PROJECT}" \
    --filter="name=( ${ALLOW_RULE} ${DENY_RULE} )" \
    --format='table(name,direction,priority,targetTags.list(),allowed[].map().firewall_rule().list(),denied[].map().firewall_rule().list())'
}

ensure_vm_tag
create_allow_web
create_deny_3000
verify_vm

echo
echo "Done. Rollback deny rule:"
echo "  gcloud compute firewall-rules delete ${DENY_RULE} --project=${PROJECT} --quiet"
