#!/usr/bin/env bash
# Print external integration URLs to update after srulik.ai cutover.
set -euo pipefail

BASE="${APP_BASE_URL:-https://srulik.ai}"

cat <<EOF
=== srulik.ai external integrations ===

Firebase authorized domains (Identity Platform):
  Added via API: srulik.ai, www.srulik.ai, docs.srulik.ai
  Verify: Firebase Console → Authentication → Settings → Authorized domains

Meta WhatsApp Cloud API (developers.facebook.com):
  Webhook callback URL: ${BASE}/api/webhooks/whatsapp
  Verify token: (WHATSAPP_VERIFY_TOKEN in .env — unchanged)

Resend — PBO inbound email (if enabled):
  Webhook URL: ${BASE}/api/pbo/review/inbound-email
  Inbound domain: set PBO_INBOUND_DOMAIN in .env if using custom inbound address

Resend — outbound / digest:
  MAIL_FROM in .env (consider @srulik.ai after domain verified in Resend)
  Add srulik.ai domain + DNS in Resend dashboard

Cloudflare Pages (optional — docs on VM nginx by default):
  docs project: add custom domain docs.srulik.ai (current vibeswitch: news-fetch-abl.pages.dev)

URGENT if vibeswitch.ai 301s to srulik.ai before DNS is live:
  Cloudflare → vibeswitch.ai zone → Bulk Redirects / Redirect Rules → disable srulik redirect
  OR add srulik.ai A records (see scripts/ops/srulik-dns-records.txt) then run:
    ./scripts/ops/srulik-cutover-after-dns.sh

EOF
