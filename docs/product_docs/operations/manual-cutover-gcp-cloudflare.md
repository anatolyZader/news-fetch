---
title: "Manual cutover: GCP, nginx, Cloudflare"
description: "Step-by-step operator runbook — what to click and run on GCP, the VM, and Cloudflare, with verification and rollback."
intent: operations
audience: ["internal"]
stability: beta
tags: ["security", "deploy", "gcp", "cloudflare", "nginx", "cutover"]
---

## Architecture (target state)

```text
Internet
  → Cloudflare (DNS, TLS edge, WAF, bot protection)
    → GCP VM public IP :443 / :80
      → nginx (TLS terminate or Cloudflare origin cert, proxy to localhost)
        → Fastify :127.0.0.1:3000
```

**Rules:**

- Fastify listens on **localhost only** in production.
- GCP firewall allows **80/443** to the VM, **not 3000**.
- Cloudflare sits in front for DDoS/WAF; app rate limits remain enabled.

See also: [production-cutover-checklist.md](./production-cutover-checklist.md), [edge-security.md](./edge-security.md).

---

## Prerequisites

- [ ] Server env complete ([deploy.md](../getting-started/deploy.md))
- [ ] Client built with `VITE_*` in `client/.env.local`, `npm run client:build`
- [ ] Domain pointed at Cloudflare (or at VM IP if not using Cloudflare yet)
- [ ] SSH access to the GCP VM

---

## 1. Fastify: bind to localhost only

The app uses `resolveListenHost()` in [`server.js`](../../../server.js):

- **`NODE_ENV=production`** and **`HOST` unset** → binds **`127.0.0.1`**
- Dev (no production) → `0.0.0.0` for convenience
- Override only if required: `HOST=0.0.0.0` or `ALLOW_PUBLIC_BIND=true` (avoid on public VM)

**On the VM, after starting the app:**

```bash
ss -ltnp | grep 3000
```

| Expected (good) | Bad |
|-----------------|-----|
| `127.0.0.1:3000` | `0.0.0.0:3000` or `*:3000` |

**Local smoke test:**

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/monitoring/health
```

Expected: `200`

```bash
curl -sS --connect-timeout 3 -o /dev/null -w "%{http_code}\n" http://VM_PUBLIC_IP:3000/ || echo "refused/timeout (good)"
```

Expected: connection refused or timeout — **not** `200`.

### Rollback (bind)

If the app must listen on all interfaces temporarily (debug only):

```bash
export ALLOW_PUBLIC_BIND=true
# or: export HOST=0.0.0.0
npm run start
```

Revert before leaving the VM exposed.

---

## 2. GCP firewall: expose 80/443 only, not 3000

**Project (this deployment):** `eventstorm-1` · **VM:** `vibeswitch-1` (`me-west1-b`) · **Tag:** `news-app`

### One-command setup (recommended)

From the repo on a machine with `gcloud` access:

```bash
./scripts/ops/gcp-ingress-firewall.sh
```

Defaults: `GCP_PROJECT=eventstorm-1`, `GCP_VM=vibeswitch-1`, `GCP_ZONE=me-west1-b`, tag `news-app`.

The script:

1. Adds tag `news-app` to the VM (keeps `http-server`, `https-server`, etc.)
2. Creates **`allow-news-app-web`** — ingress tcp:80,443 → `news-app`
3. Creates **`deny-news-app-port-3000`** — ingress deny tcp:3000, priority **900** → `news-app`

**Console:** VPC network → Firewall → Create or edit rules.

**Tag your VM** (Compute Engine → VM instance → Edit → Network tags): `news-app` (plus `http-server` / `https-server` if using default GCP HTTP rules).

### 2.1 Allow HTTPS/HTTP from the internet

| Field | Value |
|-------|--------|
| Direction | Ingress |
| Priority | 1000 |
| Action | Allow |
| Targets | Specified target tags → `news-app` |
| Source | `0.0.0.0/0` (or restrict to Cloudflare IP ranges if using Cloudflare proxy) |
| Protocols / ports | `tcp:443`, `tcp:80` |

### 2.2 Deny port 3000 from the internet

| Field | Value |
|-------|--------|
| Direction | Ingress |
| Priority | 900 (lower number = higher precedence than allow at 1000) |
| Action | Deny |
| Targets | `news-app` |
| Source | `0.0.0.0/0` |
| Protocols / ports | `tcp:3000` |

**Manual gcloud** (same as the script):

```bash
gcloud config set project eventstorm-1

gcloud compute instances add-tags vibeswitch-1 \
  --zone=me-west1-b --tags=news-app

gcloud compute firewall-rules create allow-news-app-web \
  --network=default --direction=INGRESS --priority=1000 --action=ALLOW \
  --rules=tcp:80,tcp:443 --source-ranges=0.0.0.0/0 --target-tags=news-app \
  --description="Allow public HTTP/HTTPS to news-app VMs"

gcloud compute firewall-rules create deny-news-app-port-3000 \
  --network=default --direction=INGRESS --priority=900 --action=DENY \
  --rules=tcp:3000 --source-ranges=0.0.0.0/0 --target-tags=news-app \
  --description="Block public :3000; use nginx :443"
```

**Verify from your laptop:**

```bash
nc -vz 34.165.63.234 443    # open
nc -vz 34.165.63.234 80     # open
nc -vz 34.165.63.234 3000   # refused / timed out
```

List rules:

```bash
gcloud compute firewall-rules list --project=eventstorm-1 \
  --filter='name:(allow-news-app-web deny-news-app-port-3000)'
```

### Rollback (firewall)

```bash
gcloud compute firewall-rules delete deny-news-app-port-3000 --project=eventstorm-1 --quiet
# Optional: remove allow rule and tag if reverting entirely
# gcloud compute firewall-rules delete allow-news-app-web --project=eventstorm-1 --quiet
```

Restore deny rule before leaving the VM publicly exposed on `:3000`.

---

## 3. nginx on the VM (reverse proxy + TLS)

**This deployment:** `vibeswitch.ai` · config at [`scripts/ops/nginx-vibeswitch.conf`](../../../scripts/ops/nginx-vibeswitch.conf) → `/etc/nginx/sites-available/vibeswitch`

Install nginx on the VM. Point it at `127.0.0.1:3000`.

### 3.1 Cloudflare SSL modes

| Mode | nginx needs |
|------|-------------|
| **Full (strict)** | Valid cert on origin (Let’s Encrypt or Cloudflare origin cert) |
| **Full** | Any cert on origin |
| **Flexible** | Not recommended (HTTP between Cloudflare and origin) |

Prefer **Full (strict)** + Let’s Encrypt on the VM, or Cloudflare origin certificate.

### 3.2 Example server block

File: `/etc/nginx/sites-available/vibeswitch` (symlink in `sites-enabled/`)

Deploy from repo:

```bash
sudo cp scripts/ops/nginx-vibeswitch.conf /etc/nginx/sites-available/vibeswitch
sudo nginx -t && sudo systemctl reload nginx
```

Example server block (same as the script file):

```nginx
server {
  listen 80;
  server_name vibeswitch.ai www.vibeswitch.ai;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name vibeswitch.ai www.vibeswitch.ai;

  ssl_certificate     /etc/letsencrypt/live/vibeswitch.ai/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/vibeswitch.ai/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;
    client_max_body_size 100m;
  }
}
```

**App env on VM:**

```bash
TRUST_PROXY=true
ENABLE_HSTS=true
NODE_ENV=production
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

**Verify:**

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://vibeswitch.ai/api/monitoring/health
curl -sSI https://vibeswitch.ai/ | grep -i strict-transport
```

Expected: health `200`, `strict-transport-security` header present.

### Rollback (nginx)

```bash
sudo rm /etc/nginx/sites-enabled/vibeswitch
sudo nginx -t && sudo systemctl reload nginx
```

App still reachable on `127.0.0.1:3000` via SSH tunnel for debugging.

---

## 4. Cloudflare (DNS, Full (strict), Bot Fight, webhook rate limit)

**This deployment:** zone `vibeswitch.ai` · origin VM `34.165.63.234` (`vibeswitch-1`)

| Control | Script / action | Status |
|---------|-----------------|--------|
| DNS (proxied A) | [`cloudflare-cutover.sh`](../../../scripts/ops/cloudflare-cutover.sh) or dashboard §4.1 | Verify: `dig +short vibeswitch.ai` → Cloudflare IPs (`188.114.x.x`), not VM IP |
| SSL Full (strict) | Script or dashboard §4.2 | Verify: origin has Let’s Encrypt; no SSL errors in browser |
| Bot Fight Mode | Script or dashboard §4.3 | Verify in **Security → Bots** |
| Webhook rate limit | Script or dashboard §4.4 | Complements app `RATE_LIMIT_WEBHOOK_MAX` (default 120/min) |

### One-command setup (recommended)

From a machine with a Cloudflare API token:

```bash
export CLOUDFLARE_API_TOKEN='...'   # Zone:Edit, DNS:Edit, Zone Settings:Edit, Bot Fight:Edit, WAF:Edit
./scripts/ops/cloudflare-cutover.sh
```

Optional overrides: `CLOUDFLARE_ZONE_NAME=vibeswitch.ai`, `VM_PUBLIC_IP=34.165.63.234`, `WEBHOOK_RATE_PER_MIN=200`, `DRY_RUN=1`.

### 4.1 DNS

**Dashboard:** Cloudflare → **DNS** → **Records**

| Type | Name | Content | Proxy | TTL |
|------|------|---------|-------|-----|
| `A` | `@` (`vibeswitch.ai`) | `34.165.63.234` | **Proxied** (orange cloud) | Auto |
| `A` | `www` | `34.165.63.234` | **Proxied** | Auto |

Do **not** grey-cloud unless debugging origin directly (bypasses WAF/bot protection).

### 4.2 SSL/TLS — Full (strict)

**Dashboard:** **SSL/TLS** → **Overview**

1. Encryption mode → **Full (strict)** (requires valid cert on origin — Let’s Encrypt on nginx)
2. **Edge Certificates** → **Always Use HTTPS** → ON
3. Optional: **Minimum TLS Version** → 1.2

Origin cert path on VM: `/etc/letsencrypt/live/vibeswitch.ai/fullchain.pem`

### 4.3 Bot Fight Mode

**Dashboard:** **Security** → **Bots**

1. Enable **Bot Fight Mode** (free plan) — or **Super Bot Fight Mode** on Pro+ if you need skip rules for API clients
2. Optional: **Security** → **WAF** → **Managed rules** → enable OWASP core ruleset if available on your plan

**Note:** Bot Fight Mode cannot be bypassed with WAF skip rules. If legitimate API automation is challenged, upgrade to Super Bot Fight and add skip rules for trusted paths.

### 4.4 Rate limit — webhooks

**Dashboard:** **Security** → **WAF** → **Rate limiting rules** → **Create rule**

| Field | Value |
|-------|--------|
| Name | `webhook-rate-limit` |
| Expression | `(http.request.uri.path starts_with "/api/webhooks/")` |
| Characteristics | IP |
| Rate | **200** requests / **1 minute** (adjust to taste; stay ≥ app limit) |
| Action | Block |
| Duration | 60 seconds |

Complements in-app limit `RATE_LIMIT_WEBHOOK_MAX` (default **120**/min in [`registerSecurityPlugins.js`](../../../cross-cut-modules/security/input/registerSecurityPlugins.js)).

### 4.5 Verify

```bash
# Traffic via Cloudflare (cf-ray header)
curl -sSI https://vibeswitch.ai/api/monitoring/health | grep -iE 'HTTP|cf-ray|strict-transport'

curl -sS https://vibeswitch.ai/.well-known/security.txt
curl -sS -o /dev/null -w "%{http_code}\n" https://vibeswitch.ai/api/monitoring/health
```

Expected: `cf-ray` present, health `200`, `security.txt` with production contact email.

### Rollback (Cloudflare)

| Action | When |
|--------|------|
| Set A record to **DNS only** (grey cloud) | Bypass Cloudflare to debug nginx/origin; traffic hits VM IP directly |
| **Pause** zone or disable proxy | Emergency; loses DDoS/WAF |
| Disable **Bot Fight Mode** | If blocking legitimate clients |
| Disable **webhook-rate-limit** rule | If webhooks blocked incorrectly |
| Revert SSL to **Full** (not strict) | Only if origin cert broken — fix cert instead |

After rollback, re-enable proxy + Full (strict) before leaving production.

---

## 5. VM egress (yt-dlp / metadata blocking)

Application SSRF guards do not constrain **`yt-dlp`** subprocess fetches. Restrict outbound traffic at the VPC (and optionally on-host with iptables).

**This deployment:** project `eventstorm-1` · VM tag `news-app` · [`gcp-egress-firewall.sh`](../../../scripts/ops/gcp-egress-firewall.sh)

| Goal | Rule | Script |
|------|------|--------|
| Allow public HTTPS APIs | `allow-news-app-egress-https` (tcp:443 → `0.0.0.0/0`) | [`gcp-egress-firewall.sh`](../../../scripts/ops/gcp-egress-firewall.sh) |
| Block private / metadata SSRF | `deny-news-app-egress-rfc1918` (deny → `10/8`, `172.16/12`, `192.168/16`, `169.254/16`) | same |
| Bare-metal / no GCP VPC | Host iptables example | [`iptables-egress.example.sh`](../../../scripts/ops/iptables-egress.example.sh) |

### One-command setup (recommended)

```bash
./scripts/ops/gcp-egress-firewall.sh
```

Creates on project `eventstorm-1`, tag `news-app`:

| Rule | Priority | Direction | Action | Destinations |
|------|----------|-----------|--------|--------------|
| `allow-news-app-egress-https` | 1000 | EGRESS | ALLOW tcp:443 | `0.0.0.0/0` |
| `deny-news-app-egress-rfc1918` | 900 | EGRESS | DENY all | `10/8`, `172.16/12`, `192.168/16`, `169.254/16` |

**Manual gcloud** (same as the script):

```bash
gcloud config set project eventstorm-1

gcloud compute firewall-rules create allow-news-app-egress-https \
  --network=default --direction=EGRESS --priority=1000 --action=ALLOW \
  --rules=tcp:443 --destination-ranges=0.0.0.0/0 --target-tags=news-app \
  --description="Allow outbound HTTPS from news-app VMs"

gcloud compute firewall-rules create deny-news-app-egress-rfc1918 \
  --network=default --direction=EGRESS --priority=900 --action=DENY \
  --rules=all \
  --destination-ranges=10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,169.254.0.0/16 \
  --target-tags=news-app \
  --description="Block SSRF/private egress (yt-dlp, curl)"
```

### Verify on the VM (SSH to `vibeswitch-1`)

```bash
# Private RFC1918 — expect timeout (verified)
curl -sS --connect-timeout 2 http://10.128.0.1/ || echo "OK: private egress blocked"

# Public HTTPS — expect 200 (verified)
curl -sS --connect-timeout 5 -o /dev/null -w '%{http_code}\n' https://www.google.com
```

**GCE metadata caveat:** `169.254.169.254` may still respond **from the same VM** (hypervisor-local path). VPC egress deny does not always block it. Verified on `vibeswitch-1`: RFC1918 egress **blocked**; metadata **still reachable locally**. Mitigations:

- App: `validateUserFetchUrl` / DNS checks on user-supplied URLs
- VPC: deny rule still blocks metadata targets **on other hosts** in blocked ranges
- Do **not** iptables-drop `169.254.169.254` on the VM unless you accept breaking ADC / service-account token refresh

List rules:

```bash
gcloud compute firewall-rules list --project=eventstorm-1 \
  --filter='name:(allow-news-app-egress-https deny-news-app-egress-rfc1918)'
```

**Caveat:** Denying `10.0.0.0/8` egress blocks outbound calls to **private IPs** (Cloud SQL private IP, internal Redis on VPC). Add higher-priority allow rules for specific destinations if needed.

### Rollback (egress)

```bash
gcloud compute firewall-rules delete deny-news-app-egress-rfc1918 --project=eventstorm-1 --quiet
gcloud compute firewall-rules delete allow-news-app-egress-https --project=eventstorm-1 --quiet
```

Remove **deny** first if vendor integrations break; identify required destinations, add targeted allow rules, then re-apply deny.

---

## 6. Cutover order (numbered sequence)

Run in this order. Each step has a verify gate before the next.

| Step | Action | Script / doc | Verify before next step |
|------|--------|--------------|-------------------------|
| **1** | Set production `.env` on VM; client built with `VITE_*` | [deploy.md](../getting-started/deploy.md) | `NODE_ENV=production npm run start` — no validation error |
| **2** | Deploy server + `client/dist/`; start PM2 | `pm2 start ecosystem.config.cjs` | App process online |
| **3** | Confirm localhost bind | §1 | `ss -ltnp \| grep 3000` → `127.0.0.1:3000` |
| **4** | Configure nginx → TLS → proxy headers | [`nginx-vibeswitch.conf`](../../../scripts/ops/nginx-vibeswitch.conf) §3 | `curl -sSI --resolve vibeswitch.ai:443:127.0.0.1 https://vibeswitch.ai/` → HSTS |
| **5** | GCP ingress: allow 80/443, deny 3000 | [`gcp-ingress-firewall.sh`](../../../scripts/ops/gcp-ingress-firewall.sh) §2 | `nc -vz 34.165.63.234 3000` → timeout/refused |
| **6** | Cloudflare DNS (proxied) + Full (strict) + Bot Fight + webhook limit | [`cloudflare-cutover.sh`](../../../scripts/ops/cloudflare-cutover.sh) §4 | `curl -sSI https://vibeswitch.ai/ \| grep cf-ray` |
| **7** | GCP egress: deny RFC1918/metadata, allow HTTPS out | [`gcp-egress-firewall.sh`](../../../scripts/ops/gcp-egress-firewall.sh) §5 | §5 verify commands on VM |
| **8** | Post-cutover smoke tests | [production-cutover-checklist.md](./production-cutover-checklist.md) | Login, App Check, chat, webhooks |

**Pre-DNS cutover tip:** Add `/etc/hosts` entry `34.165.63.234 vibeswitch.ai` on your laptop to test nginx (step 4) before step 6.

**Parallel-safe:** Steps 5 and 7 (GCP firewall) can be applied before or after Cloudflare; apply **before** announcing go-live if possible.

---

## 7. Rollback (per layer)

Use the minimum rollback needed. Never combine “open `:3000` to the internet” with `0.0.0.0` bind in production.

| Layer | Symptom | Rollback action | Command / location |
|-------|---------|-----------------|-------------------|
| **DNS** | Cloudflare misconfigured; need direct origin | Grey-cloud A records or point A to old IP | Cloudflare **DNS** → toggle proxy off |
| **Cloudflare SSL** | Origin cert errors with Full (strict) | Temporarily **Full** (not strict) while fixing cert | **SSL/TLS → Overview** |
| **Cloudflare Bot Fight** | Legitimate clients challenged | Disable Bot Fight Mode | **Security → Bots** |
| **Cloudflare rate limit** | Webhooks blocked | Disable `webhook-rate-limit` rule | **Security → WAF → Rate limiting** |
| **nginx** | Bad proxy config; 502/504 | Remove site, reload | `sudo rm /etc/nginx/sites-enabled/vibeswitch && sudo nginx -t && sudo systemctl reload nginx` |
| **GCP ingress** | Need SSH tunnel debug only | Delete deny-3000 rule (**not** for public prod) | `gcloud compute firewall-rules delete deny-news-app-port-3000 --project=eventstorm-1 --quiet` |
| **GCP egress** | yt-dlp / API calls to private IP fail | Delete deny RFC1918 rule; add targeted allows | §5 rollback commands |
| **App bind** | Accidental public bind | Restart with default prod bind | Unset `HOST` / `ALLOW_PUBLIC_BIND`; `pm2 restart news` |
| **App deploy** | Bad release / schema migration | Redeploy previous git tag; restore SQLite | [backup-restore.md](./backup-restore.md) |
| **Full revert** | Return to pre-cutover | Grey-cloud DNS → rollback nginx → keep `:3000` blocked → restore old deploy | Combine rows above in reverse order of §6 |

**After any rollback:** Document what broke, fix root cause, then re-run the failed §6 step and its verify gate.

---

## Related

- [Production cutover checklist](./production-cutover-checklist.md)
- [Edge security](./edge-security.md)
- [Deploy guide](../getting-started/deploy.md)
- [Backup / restore](./backup-restore.md)
