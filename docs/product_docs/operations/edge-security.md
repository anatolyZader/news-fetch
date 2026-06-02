---
title: "Edge security (TLS, proxy, WAF)"
description: "Reverse-proxy and edge hardening for GCP VM (today) and Cloud Run (migration path)."
intent: operations
audience: ["internal"]
stability: beta
tags: ["security", "tls", "nginx", "caddy", "cloud-run"]
---

## Purpose

Document how to terminate TLS, forward client IP metadata, and optionally add WAF/bot protection in front of the Node app. Application-level controls (Helmet, rate limits, auth) are configured via env vars — this guide covers the **edge** layer.

## Prerequisites

- Production domain and TLS certificate (Let's Encrypt or Cloudflare).
- Node app configured per [deploy](../getting-started/deploy.md) with `TRUST_PROXY=true`.

## Inputs

- Reverse-proxy config (Caddy, nginx, or Cloud Run URL mapping).
- Optional WAF (Cloudflare, Cloud Armor).
- Server env vars in the table below.

## Outputs

- HTTPS termination at the edge; Fastify on `127.0.0.1:3000`.
- Correct `X-Forwarded-*` headers for rate limits and audit IP.
- Optional WAF rules on `/api/webhooks/*`.

## Constraints

- Never expose Fastify on `0.0.0.0:3000` in production without `ALLOW_PUBLIC_BIND`.
- Edge rate limits complement but do not replace `@fastify/rate-limit`.
- Subprocess egress (`yt-dlp`) needs VM-level policy — app SSRF guards are not enough.

## Examples

```bash runnable
grep -E '^TRUST_PROXY=|^ENABLE_HSTS=' .env 2>/dev/null || echo "set TRUST_PROXY and ENABLE_HSTS on the server"
```

Expected: `TRUST_PROXY=true` and `ENABLE_HSTS=true` in production `.env`, or the reminder line on a dev machine.

## Application env (both deployments)

| Variable | Production default | Role |
|----------|-------------------|------|
| `TRUST_PROXY` | `true` | Honor `X-Forwarded-*` for rate limits and audit IP |
| `ENABLE_HSTS` | `true` (behind TLS) | Helmet strict transport security |
| `AUTH_REQUIRED` | `true` | JWT on API routes |
| `FIREBASE_PROJECT_ID` | required | Token verification |
| `WHATSAPP_APP_SECRET` | required if webhooks on | `X-Hub-Signature-256` verification |
| `RATE_LIMIT_*` | see deploy.md | Override `@fastify/rate-limit` defaults |
| `APP_CHECK_ENFORCE` | `true` (required) | Require `X-Firebase-AppCheck` on costly routes |
| `DAILY_BUDGET_USD` | `10` | HTTP 429 when daily LLM spend exceeded |
| `SECURITY_CONTACT_EMAIL` | required | Dynamic `/.well-known/security.txt` |
| `ENABLE_SWAGGER` | unset / `false` | Must not be `true` (startup fails) |

Public health check: `GET /api/monitoring/health` returns `{ "status": "ok"|"degraded"|"unhealthy" }` only. Detailed paths: `GET /api/monitoring/health/detail` (auth + analyst).

**Production cutover:** [production-cutover-checklist.md](./production-cutover-checklist.md) · [manual GCP / Cloudflare runbook](./manual-cutover-gcp-cloudflare.md)

## Path A — GCP VM + reverse proxy + PM2 (today)

### Caddy example

```caddy
YOUR_DOMAIN {
  reverse_proxy localhost:3000 {
    header_up X-Forwarded-Proto {scheme}
    header_up X-Forwarded-For {remote_host}
  }
}
```

Set on the VM: `TRUST_PROXY=true`, `NODE_ENV=production`, `ENABLE_HSTS=true`.

### nginx example

```nginx
server {
  listen 443 ssl http2;
  server_name YOUR_DOMAIN;

  ssl_certificate     /etc/letsencrypt/live/YOUR_DOMAIN/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/YOUR_DOMAIN/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /.well-known/security.txt {
    proxy_pass http://127.0.0.1:3000;
  }
}
```

### Optional WAF (VM)

- **Cloudflare** proxy in front of the VM: enable Bot Fight Mode, rate limiting rules, geo blocks if needed — [`cloudflare-cutover.sh`](../../../scripts/ops/cloudflare-cutover.sh) · [manual cutover §4](./manual-cutover-gcp-cloudflare.md#4-cloudflare-dns-full-strict-bot-fight-webhook-rate-limit)
- **GCP HTTPS LB + Cloud Armor** in front of the VM static IP: attach a Cloud Armor policy (OWASP CRS, IP allow/deny lists).

Checklist:

- [ ] TLS 1.2+ only at edge
- [ ] `TRUST_PROXY=true` on Node
- [ ] `ENABLE_HSTS=true` on Node (Helmet HSTS)
- [ ] Node binds `127.0.0.1:3000` in production (default); no public `:3000` on firewall
- [ ] `security.txt` at `/.well-known/security.txt` with real contact email (app serves dynamically in production)
- [ ] WAF or Cloud Armor in front of public endpoints
- [ ] Webhook path rate-limited at edge (see below)

### Proxy lockdown

In production the Node process defaults to `HOST=127.0.0.1`. Only the reverse proxy should be reachable on 443/80. GCP example:

```bash
gcloud compute firewall-rules create deny-news-app-port-3000 \
  --direction=INGRESS --priority=900 --action=DENY \
  --rules=tcp:3000 --source-ranges=0.0.0.0/0 --target-tags=news-app
```

Verify: `curl http://VM_PUBLIC_IP:3000` should fail; `curl https://YOUR_DOMAIN/api/monitoring/health` should succeed.

### Webhook rate limiting (edge + app)

WhatsApp webhooks must accept Meta traffic but are abuse targets. Use **both**:

1. **App** — `POST /api/webhooks/whatsapp` has a dedicated limit (`RATE_LIMIT_WEBHOOK_MAX`, default 120/min per IP).
2. **Edge** — coarse protection on `/api/webhooks/*`:

**Cloudflare** (Rate limiting rule):

- Expression: `(http.request.uri.path starts_with "/api/webhooks/")`
- Action: Block when rate exceeds 200 requests / 1 minute / IP

**GCP Cloud Armor** (rate-based rule on backend service):

- Match: `request.path.startsWith('/api/webhooks/')`
- Rate limit: 200 requests per 60s per IP; exceed action: deny(429)

## Path B — Cloud Run (future migration)

Same env vars on the Cloud Run service. Managed TLS on the Cloud Run URL or custom domain mapping.

For Cloud Armor:

1. Serverless NEG → Cloud Run service
2. External HTTPS load balancer + managed certificate
3. Cloud Armor policy on backend service (rate limit, geo, bot rules)

Logging: Cloud Run sends stdout/stderr to Cloud Logging automatically — use filters in [siem-alerts.md](./siem-alerts.md).

## Rate limiting at edge vs app

- **Edge** (Cloudflare / Cloud Armor): coarse IP/geo/bot protection, DDoS absorption
- **App** (`@fastify/rate-limit`): per-route limits keyed by IP or Firebase `uid`

Use both in production; do not disable app limits when edge limits exist.

## Egress hardening (VM)

Application SSRF guards (`safeFetch`, DNS resolution checks) block obvious internal targets but **do not replace network policy**. On the GCP VM (or Cloud Run VPC connector), restrict outbound traffic:

- **Deny** RFC1918 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local (`169.254.0.0/16`), and metadata (`169.254.169.254`) except where explicitly required.
- **Allow** only vendor APIs you use: Anthropic, OpenAI, Firebase/Google Identity, Meta Graph (WhatsApp), NewsAPI, Nominatim, etc.
- Apply the **same policy to yt-dlp** subprocess egress (video URL downloads bypass Node `fetch`).

Example (conceptual GCP firewall egress rule priority):

1. Allow TCP 443 to `0.0.0.0/0` for known SaaS (or use a proxy with domain allowlist).
2. Deny RFC1918 and `169.254.169.254/32` from the app VM service account tag.
3. Log denied egress in Cloud Logging for SIEM alerts.

iptables/nftables on a bare VM: default-drop egress except 443 to approved destinations, or route all egress through an HTTP proxy with an allowlist.

Example scripts in repo: [`scripts/ops/gcp-egress-firewall.example.sh`](../../../scripts/ops/gcp-egress-firewall.example.sh), [`scripts/ops/iptables-egress.example.sh`](../../../scripts/ops/iptables-egress.example.sh).

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Rate limits use wrong IP | `TRUST_PROXY=true` and proxy sends `X-Forwarded-For` |
| HSTS not applied | `ENABLE_HSTS=true` and responses served over HTTPS |
| Webhooks blocked by WAF | Allow Meta IP ranges / tune `/api/webhooks/*` rule |
| `curl :3000` works from internet | Firewall deny 3000; bind `HOST=127.0.0.1` |

## Related

- [Production cutover checklist](./production-cutover-checklist.md)

- [Deploy guide](../getting-started/deploy.md)
- [Backup / restore](./backup-restore.md)
- [SIEM alerts](./siem-alerts.md)
- [Deploy guide — security env](../getting-started/deploy.md)
