---
title: "Install & run (local)"
description: "Run the API + UI locally and verify the system end-to-end."
intent: getting-started
audience: ["internal"]
stability: beta
canonical: "https://docs.vibeswitch.ai/getting-started/install-and-run"
version: "current"
tags: ["getting-started", "local-dev"]
---

## Purpose
Stand up VibeSwitch on a developer workstation and confirm every major surface works: the Fastify API, the Vite-served React UI, Swagger, the in-app Docs panel, and at least one ingestion command. This guide assumes you've read the [Quickstart](quickstart.md); it goes deeper into the moving parts, options, and things that usually trip people up.

## Prerequisites
- **Required**: Node.js 20+ and npm 10+.
- **Required**: A bash-compatible shell (macOS Terminal, Linux, WSL, Git Bash).
- **Required**: `git`, and a local clone of the repo.
- **Optional**: `ffmpeg` on `PATH` — only needed for [Audio ingestion](../guides/audio-ingestion.md).
- **Optional**: a Google Cloud project if you plan to enable auth locally.

## Inputs
- **Root `.env`** (for the server):
  - `NEWSAPI_API_KEY` (required for news ingestion)
  - `ANTHROPIC_API_KEY` (required for signal extraction and narratives)
  - `OPENAI_API_KEY` (required only for audio transcription)
  - `AUTH_REQUIRED=false` (recommended for local dev unless you're testing auth)
  - `SQLITE_PATH` (optional — defaults to a path under the repo)
  - **Mailing (Resend)**: `RESEND_API_KEY` and `MAIL_FROM` (e.g. `Vibes Witch <reports@yourdomain.com>`) — enables `/api/mail/*` send path and Settings UI; optional `MAILING_ENABLED=false` to disable; `npm run mail:digest` for cron-based daily sends
- **`client/.env.local`** (only if you're enabling auth):
  - `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`

## Outputs
- **API running**: Fastify on `http://localhost:3000` serving `/api/*` and the built SPA (if present).
- **UI running (dev mode)**: Vite on `http://localhost:5173` with live reload and an `/api` proxy to `:3000`.
- **Swagger UI**: `http://localhost:3000/api/swagger`.
- **Docs index**: `http://localhost:3000/api/docs/index` returns a non-empty JSON array.
- **SQLite DB**: a file created on first write (default inside the repo unless `SQLITE_PATH` overrides).

## Constraints
- **Never commit `.env` or `client/.env.local`.** These are in `.gitignore` — keep them there.
- **`VITE_*` is build-time only.** In dev, Vite re-reads it when you restart `npm run client:dev`. In production, you must rebuild the client after changing any `VITE_*` value.
- **Auth off by default is deliberate.** Local dev is faster without JWT verification. Turn it on only when you're specifically testing auth flows.
- **One SQLite file, one writer.** Don't share `SQLITE_PATH` across two running servers on the same machine — SQLite's locking is process-local and you'll see sporadic `SQLITE_BUSY` errors.

## Examples

### Clone and install

```bash runnable
git clone <your-fork-url> news
cd news
npm install
cd client && npm install
```

Expected: two install cycles complete without error. The second one runs inside `client/`.

### Minimum `.env` for local dev

Create `./.env` in the repo root:

```env
NEWSAPI_API_KEY=your_newsapi_key
ANTHROPIC_API_KEY=sk-ant-...
AUTH_REQUIRED=false
```

Expected: the server starts and accepts API calls without a Bearer token.

### Start the API

```bash runnable
npm run start
```

Expected: server starts and logs a line like `Server listening on http://0.0.0.0:3000`. Keep this terminal open.

### Start the UI (second terminal)

```bash runnable
npm run client:dev
```

Expected: Vite prints `Local: http://localhost:5173/`. Open that URL in a browser. The header should read **Vibes Witch — Home Front Command · Daily Assessment**.

### Verify Swagger and OpenAPI

```bash runnable
curl -sS http://localhost:3000/api/openapi.json | head -n 5
```

Expected: JSON starting with `{` and containing an `"openapi"` field near the top.

Open Swagger UI: `http://localhost:3000/api/swagger`.

### Verify the in-app Docs endpoint

```bash runnable
curl -sS http://localhost:3000/api/docs/index | head -c 200
```

Expected: JSON with a `pages` array containing this page and every other product doc.

### Run your first ingestion

```bash runnable
npm run homefront-to-md
```

Expected: a dated markdown file appears under `business_modules/news-sites/articles_extracted/`.

### Tail server logs

The server logs to stdout. Pipe or redirect as needed:

```bash runnable
npm run start 2>&1 | tee server.log
```

Expected: startup lines, then one log line per request. Errors include a stack trace.

## Troubleshooting
- **UI loads but API requests fail with 502/CORS**
  - **Check**: the API server is running on `:3000` and the Vite proxy is intact.
  - **Fix**: verify `client/vite.config.js` proxies `/api` → `http://localhost:3000`. Restart both servers.
- **Server fails with "API key is required"**
  - **Check**: root `.env` contains `NEWSAPI_API_KEY` and the server was restarted after adding it.
  - **Fix**: set the key and restart. dotenv reads `.env` only at startup.
- **Every `/api/*` returns 401**
  - **Check**: `AUTH_REQUIRED=true` in `.env`.
  - **Fix**: set it to `false` for local dev, or finish the flow in [Auth setup](auth-setup.md).
- **`Cannot find module` errors**
  - **Check**: you ran `npm install` in both the root and `client/`.
  - **Fix**: run both installs again. Delete `node_modules` and retry if needed — never edit lockfiles by hand.
- **Port 3000 or 5173 already in use**
  - **Check**: `lsof -i :3000` (or `:5173`) to see what's holding it.
  - **Fix**: kill the other process, or set `PORT=3001 npm run start` and update the Vite proxy.
- **SQLite errors on write**
  - **Check**: `SQLITE_PATH` points to a writable directory.
  - **Fix**: ensure the parent directory exists and the process user has write permission.
- **Docs panel in the app says "failed to load"**
  - **Check**: `curl http://localhost:3000/api/docs/index` directly.
  - **Fix**: if that works, the UI has a stale proxy — hard-reload the page. If it doesn't, server is not serving `product_docs/` correctly; see [Observability](../operations/observability.md).
