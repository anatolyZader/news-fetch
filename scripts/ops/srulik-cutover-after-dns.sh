#!/usr/bin/env bash
# Finish srulik.ai cutover after DNS exists (see srulik-dns-records.txt).
# Option B (default): docs on Cloudflare Pages — cert covers apex/www/analyst only.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

VM_IP="${VM_PUBLIC_IP:-34.165.63.234}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-security@srulik.ai}"
DOCS_HOSTING="${DOCS_HOSTING:-pages}"
DOCS_CNAME_TARGET="${DOCS_CNAME_TARGET:-news-fetch-abl.pages.dev}"
APEX_HOSTS=(srulik.ai www.srulik.ai analyst.srulik.ai)

dns_ready() {
  local h
  for h in "${APEX_HOSTS[@]}"; do
    local a
    a="$(dig @1.1.1.1 +short "${h}" A 2>/dev/null | head -1 || true)"
    if [[ -z "${a}" ]]; then
      echo "  waiting: ${h} has no A record"
      return 1
    fi
    echo "  ${h} → ${a}"
  done
  if [[ "${DOCS_HOSTING}" == "pages" ]]; then
    local cname
    cname="$(dig @1.1.1.1 +short docs.srulik.ai CNAME 2>/dev/null | head -1 || true)"
    if [[ -z "${cname}" ]]; then
      echo "  waiting: docs.srulik.ai has no CNAME (expect ${DOCS_CNAME_TARGET})"
      return 1
    fi
    echo "  docs.srulik.ai CNAME → ${cname}"
  else
    local a
    a="$(dig @1.1.1.1 +short docs.srulik.ai A 2>/dev/null | head -1 || true)"
    if [[ -z "${a}" ]]; then
      echo "  waiting: docs.srulik.ai has no A record"
      return 1
    fi
    echo "  docs.srulik.ai → ${a}"
  fi
  return 0
}

echo "=== srulik.ai post-DNS cutover ==="
echo "Docs hosting: ${DOCS_HOSTING}"
echo "Expect A records for apex/www/analyst → ${VM_IP} (proxied OK for LE HTTP-01 via origin)"
echo

if ! dns_ready; then
  echo
  echo "DNS not ready. Run ./scripts/ops/srulik-dns-option-b.sh or add records manually — see scripts/ops/srulik-dns-records.txt"
  exit 1
fi

echo
echo "DNS OK — requesting certificate..."
sudo mkdir -p /var/www/certbot
sudo cp scripts/ops/nginx-srulik-http-acme.conf /etc/nginx/sites-available/srulik
sudo ln -sf /etc/nginx/sites-available/srulik /etc/nginx/sites-enabled/srulik
sudo nginx -t
sudo systemctl reload nginx

if [[ ! -f /etc/letsencrypt/live/srulik.ai/fullchain.pem ]]; then
  CERT_ARGS=(-d srulik.ai -d www.srulik.ai -d analyst.srulik.ai)
  if [[ "${DOCS_HOSTING}" != "pages" ]]; then
    CERT_ARGS+=(-d docs.srulik.ai)
  fi
  sudo certbot certonly --webroot -w /var/www/certbot \
    "${CERT_ARGS[@]}" \
    --non-interactive --agree-tos -m "${CERTBOT_EMAIL}"
fi

echo "Deploying TLS nginx configs..."
sudo cp scripts/ops/nginx-srulik.conf /etc/nginx/sites-available/srulik
sudo cp scripts/ops/nginx-srulik-subdomains.conf /etc/nginx/sites-available/srulik-subdomains
sudo ln -sf /etc/nginx/sites-available/srulik /etc/nginx/sites-enabled/srulik
sudo ln -sf /etc/nginx/sites-available/srulik-subdomains /etc/nginx/sites-enabled/srulik-subdomains
sudo nginx -t
sudo systemctl reload nginx

if grep -q '^APP_BASE_URL=' .env 2>/dev/null; then
  pm2 restart news
fi

echo
echo "=== Verify ==="
curl -sSI "https://srulik.ai/api/monitoring/health" | head -5 || true
curl -sS "https://srulik.ai/.well-known/security.txt" 2>/dev/null | head -3 || true
curl -sSI "https://docs.srulik.ai/" | head -3 || true
curl -sSI "https://analyst.srulik.ai/" | head -3 || true
echo "Done."
