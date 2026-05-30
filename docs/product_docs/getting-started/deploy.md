---
title: "Deploy (production)"
description: "Deploy Srulik's lab safely with correct env, auth, and build outputs."
intent: getting-started
audience: ["internal"]
stability: beta
canonical: "https://docs.vibeswitch.ai/getting-started/deploy"
version: "current"
tags: ["deploy", "operations", "auth"]
---

## Purpose
Deploy Srulik's lab to a real environment — a VM, a container, Cloud Run, or a Node.js-capable PaaS — with sensible defaults for auth, secrets, and the SPA build. This guide covers what runs, what serves what, which environment variables matter, and where things typically break in production that don't break locally.

## Prerequisites
- **Required**: A runtime that can run Node.js 20+ (container, VM, Cloud Run, Render, Fly, etc.).
- **Required**: A secrets mechanism — real env vars, a secret manager (Google Secret Manager, AWS Secrets Manager, Vault), or your platform's equivalent. Not `.env` files checked into the repo.
- **Required**: A way to route traffic to the server (a reverse proxy or your platform's built-in router).
- **Strongly recommended**: Google Identity Platform / Firebase Auth if the app is reachable from the public internet.
- **Optional**: A custom domain and TLS cert (usually supplied by your platform or a proxy like Cloudflare).

### Source archive retention (chat originals)

Chat validation text lives in SQLite `source_archive`. Nightly purge removes **only ephemeral types** (`news`, `radio`, `social`) with `date` older than 14 days. **Field, visits, whatsapp, manual, audio, video, and all other types are kept forever in SQLite.** Extracted article `.md` files on disk are **never** deleted by this job.

```bash
0 3 * * * cd /path/to/news && node business_modules/source_archive/input/purgeSourceArchive.js >> /var/log/source-archive-purge.log 2>&1
```

Env: `SOURCE_ARCHIVE_RETENTION_DAYS` (default `14`, applies to news/radio/social SQLite rows only), `SQLITE_PATH`, `TZ_ARTICLES`. One-time backfill (news, field, whatsapp, radio, social, probes, evidence): `npm run archive:backfill -- --days 14`.

## Inputs
- **Server env** (at runtime, not in the image):
  - `NEWSAPI_API_KEY` — news ingestion.
  - `ANTHROPIC_API_KEY` — signal extraction + narratives.
  - `OPENAI_API_KEY` — audio transcription (only if audio is enabled).
  - `AUTH_REQUIRED=true` — force JWT verification on protected routes.
  - `FIREBASE_PROJECT_ID` — required when auth is on.
  - `SQLITE_PATH` — point this at a persistent volume.
  - `PORT` — the port to bind (most platforms set this automatically).
  - `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ALLOWED_GROUP_IDS` — only if WhatsApp ingestion is enabled.
  - `WHATSAPP_APP_SECRET` — required for signed webhook POST verification when webhooks are enabled.
  - `TRUST_PROXY=true` — **required in production** when behind nginx/Caddy/Cloud Run.
  - `ENABLE_HSTS=true` — **required in production** when TLS terminates at the edge.
  - `SECURITY_CONTACT_EMAIL` — **required in production**; served at `/.well-known/security.txt`.
  - `SECURITY_POLICY_URL` — optional vulnerability disclosure policy URL.
  - `HOST=127.0.0.1` — default bind in production (localhost only); set `ALLOW_PUBLIC_BIND=true` only if the platform requires `0.0.0.0`.
  - `ENABLE_SWAGGER` — must not be `true` in production (startup fails).
  - `RESILIENCE_PROBE_HMAC_SECRET` — required in production for connectivity probe trust.
  - `APP_CHECK_ENFORCE=true` — **required in production**; requires client `VITE_APP_CHECK_SITE_KEY`.
  - `DAILY_BUDGET_USD` — daily LLM spend cap; costly API routes return 429 when exceeded.
  - `EVIDENCE_ANALYSIS_DAILY_LIMIT` — optional per-user daily LLM analysis cap (non-maintainers); persisted in SQLite.
  - Rate limit overrides: `RATE_LIMIT_GLOBAL_MAX`, `RATE_LIMIT_CHAT_MAX`, `RATE_LIMIT_EVIDENCE_SUBMIT_MAX`, `RATE_LIMIT_REPORT_BUILD_*`, `RATE_LIMIT_CATALOG_GENERATE_MAX`, `RATE_LIMIT_VIDEO_DOWNLOAD_MAX`, `RATE_LIMIT_WEBHOOK_MAX`, etc. (see [edge-security.md](../operations/edge-security.md)).
- **Client build env** (build-time only, baked into the bundle):
  - `VITE_FIREBASE_API_KEY`
  - `VITE_FIREBASE_AUTH_DOMAIN`
  - `VITE_FIREBASE_PROJECT_ID`
  - `VITE_APP_CHECK_SITE_KEY` — **required for production client build** when `APP_CHECK_ENFORCE=true`
  - `VITE_APP_CHECK_DEBUG_TOKEN` — local dev only
- **ADC credentials**: a runtime service account attached to the workload so the server can verify Firebase tokens. Avoid JSON key files in production.

## Outputs
- **A single Node process** serving both `/api/*` and the static SPA from `client/dist/`.
- **Explicit auth posture**: `NODE_ENV=production` requires `AUTH_REQUIRED=true` + `FIREBASE_PROJECT_ID` (server exits on misconfiguration).
- **A persistent SQLite file** at `SQLITE_PATH`, on a volume that survives restarts.
- **Observable endpoints**: `/api/openapi.json`, `/api/auth/config`, `/api/docs/index` all respond with `200` to unauthenticated callers.

## Constraints
- **Never embed server secrets in the client build.** Only `VITE_*` values end up in the browser bundle. Firebase web config (API key, auth domain, project ID) is designed to be public — your server enforcement is what keeps the app secure, not the secrecy of those values.
- **`VITE_*` is baked at build time.** Rotating auth domain or project ID means rebuilding and redeploying the client, not restarting the server.
- **SQLite needs a real disk.** Containers without a mounted volume lose the DB on every restart. Mount a persistent volume (EBS, Cloud Run with attached volume, Fly volumes, etc.) and point `SQLITE_PATH` at it.
- **CI should not ship keys.** Your deploy pipeline should pull secrets from a secret manager, not from CI variables for long-lived keys.
- **One writer per SQLite file.** Don't horizontally scale behind the same volume — pick a single instance, or migrate off SQLite first (outside this guide's scope).
- **Production cutover:** complete [production-cutover-checklist.md](../operations/production-cutover-checklist.md) before exposing a public VM.

## Examples

### Build the SPA

```bash runnable
npm run client:build
```

Expected: `client/dist/` is produced, containing `index.html` and hashed assets. The Fastify server serves this directory for all non-`/api` routes.

### Run the server

```bash runnable
npm run start
```

Expected: visiting the root URL loads the SPA; `/api/*` handlers respond. On a public host, always put this behind TLS.

### Verify the deployment

```bash runnable
curl -sS -o /dev/null -w "%{http_code}\n" https://YOUR_HOST/api/openapi.json
```

Expected: `200`.

```bash runnable
curl -sS https://YOUR_HOST/api/auth/config
```

Expected: `{"authRequired":true}` if you've enabled auth, otherwise `{"authRequired":false}`. This endpoint is intentionally unauthenticated — the client uses it to decide whether to prompt for sign-in.

### A sensible deploy recipe

1. **Bake the client** during CI:
   ```bash
   cd client
   VITE_FIREBASE_API_KEY=... VITE_FIREBASE_AUTH_DOMAIN=... VITE_FIREBASE_PROJECT_ID=... npm run build
   ```
2. **Build the server image** (or zip) with `node_modules` and `client/dist/` included.
3. **Inject runtime secrets** (server-side env vars) from your platform's secret manager.
4. **Attach a service account** with permissions to verify Firebase tokens (no need for broad roles).
5. **Mount a persistent volume** and set `SQLITE_PATH` to a path inside it.
6. **Smoke test**: the three curl commands above should all return `200`/`json`.

## Troubleshooting
- **Sign-in loop or "config error" on the login screen**
  - **Check**: the client was built with all three `VITE_FIREBASE_*` values. Open devtools → Network → look at the Firebase auth request.
  - **Fix**: set the values, rebuild `client/dist`, redeploy. Don't try to "inject" them at runtime — the bundle is already built.
- **Google sign-in shows "unauthorized domain"**
  - **Check**: your production domain is listed under Firebase → Authentication → Settings → Authorized domains.
  - **Fix**: add the domain and wait a minute for it to propagate.
- **API returns 401 for authenticated requests**
  - **Check**: the server can verify ID tokens. In Cloud Run, this requires the runtime service account to have enough privilege for `firebase-admin`; locally or in other platforms, `GOOGLE_APPLICATION_CREDENTIALS` must point at a valid service account JSON.
  - **Fix**: attach a service account in production. Avoid shipping JSON keys — use ADC.
- **Reports disappear after each deploy**
  - **Check**: `SQLITE_PATH` points at ephemeral storage (the container's writable layer).
  - **Fix**: mount a persistent volume and point `SQLITE_PATH` at it. Verify with a restart.
- **Client bundle references old Firebase project after env rotation**
  - **Check**: the build step ran with new `VITE_*` values.
  - **Fix**: clear any build cache, rebuild, redeploy. Vite embeds the values into JS at build time.
- **Docs site (Docusaurus) build fails on Cloudflare Pages**
  - **Check**: `NODE_VERSION=20` is set in the Pages environment; the build command matches `docs/docs-site/README.md` (usually `npm ci && npm run build` inside `docs/docs-site/`).
  - **Fix**: align Node version, redeploy from the latest commit. See [Common failures](../operations/common-failures.md).
- **High memory on the server**
  - **Check**: whether you're running analysis in-process on very large inputs.
  - **Fix**: split long audio, cap articles per run, and run heavy pipelines from a CLI off-hours. See [Cost controls](../operations/cost-controls.md).
