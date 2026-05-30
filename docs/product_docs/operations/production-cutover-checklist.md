---
title: "Production cutover checklist"
description: "Ordered security checklist before exposing the app on a public VM or Cloud Run."
intent: operations
audience: ["internal"]
stability: beta
tags: ["security", "deploy", "cutover"]
---

## Purpose

Run this checklist **once** before the first public production cutover and after major infra changes. Application startup validation (`validateProductionSecurity`) covers many items; this guide covers **edge and network** controls the app cannot enforce alone.

See also: [edge-security.md](./edge-security.md), [deploy.md](../getting-started/deploy.md), [SECURITY.md](../../../SECURITY.md).

## 1. Application env (server)

Set on the VM / Cloud Run service (secret manager recommended):

| Variable | Required in production |
|----------|---------------------|
| `NODE_ENV` | `production` |
| `AUTH_REQUIRED` | `true` |
| `FIREBASE_PROJECT_ID` | your project |
| `APP_CHECK_ENFORCE` | `true` |
| `TRUST_PROXY` | `true` |
| `ENABLE_HSTS` | `true` |
| `SECURITY_CONTACT_EMAIL` | real mailbox (e.g. `security@yourdomain.com`) |
| `SECURITY_POLICY_URL` | optional; defaults to GitHub policy URL |
| `ENABLE_SWAGGER` | unset or `false` (must not be `true`) |
| `RESILIENCE_PROBE_HMAC_SECRET` | required unless probes disabled |

Verify startup succeeds:

```bash
NODE_ENV=production npm run start
```

Expected: no `Production security validation failed` error.

## 2. Client build

- `VITE_APP_CHECK_SITE_KEY` set at **build time** (reCAPTCHA Enterprise / Firebase App Check).
- Rebuild SPA after rotating Firebase or App Check keys.

## 3. Proxy lockdown (no public :3000)

The server defaults to `HOST=127.0.0.1` in production unless `HOST` is set or `ALLOW_PUBLIC_BIND=true`.

- [ ] Reverse proxy (Caddy/nginx) terminates TLS on 443
- [ ] Node listens on `127.0.0.1:3000` only
- [ ] GCP firewall / security group: **deny** inbound TCP 3000 from `0.0.0.0/0`
- [ ] Allow inbound 443 (and 80 → redirect) only

Verify from outside the VM:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://YOUR_VM_IP:3000/
```

Expected: connection refused or timeout (not `200`).

Verify via proxy:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://YOUR_DOMAIN/api/monitoring/health
```

Expected: `200`.

## 4. security.txt

```bash
curl -sS https://YOUR_DOMAIN/.well-known/security.txt
```

Expected: `Contact: mailto:` with your production email (not `security@example.com`).

## 5. Edge WAF / bot protection

Choose at least one:

- **Cloudflare** in front of VM: Bot Fight Mode + rate limit on `/api/webhooks/*` — [`cloudflare-cutover.sh`](../../../scripts/ops/cloudflare-cutover.sh) or [manual cutover §4](./manual-cutover-gcp-cloudflare.md#4-cloudflare-dns-full-strict-bot-fight-webhook-rate-limit)
- **GCP Cloud Armor** on HTTPS LB: OWASP CRS + webhook path rate limit

See [edge-security.md](./edge-security.md) for rule examples.

## 6. VM egress (yt-dlp / subprocess)

Application SSRF guards do not constrain `yt-dlp`. Apply network policy on the VM:

- Deny outbound to RFC1918, link-local, `169.254.169.254`
- Allow outbound TCP 443 to vendor APIs you use

Example scripts:

- [`scripts/ops/gcp-ingress-firewall.sh`](../../../scripts/ops/gcp-ingress-firewall.sh) — allow 80/443, deny 3000
- [`scripts/ops/gcp-egress-firewall.sh`](../../../scripts/ops/gcp-egress-firewall.sh) — deny RFC1918/metadata egress
- [`scripts/ops/iptables-egress.example.sh`](../../../scripts/ops/iptables-egress.example.sh) — bare-metal fallback

## 7. Post-cutover smoke

```bash
curl -sS https://YOUR_DOMAIN/api/monitoring/health
curl -sS -o /dev/null -w "%{http_code}\n" https://YOUR_DOMAIN/
```

Log in via SPA; confirm costly actions work with App Check (chat, evidence submit).

## Related

- [Manual cutover: GCP, nginx, Cloudflare](./manual-cutover-gcp-cloudflare.md)
- [Edge security](./edge-security.md)
- [Deploy guide](../getting-started/deploy.md)
