---
title: "Quickstart"
description: "Get to first success in under 10 minutes."
intent: getting-started
audience: ["internal"]
stability: beta
canonical: "https://docs.vibeswitch.ai/getting-started/quickstart"
version: "current"
tags: ["quickstart"]
llm:
  chunkHint: "Prefer steps with explicit inputs/outputs."
---

## Purpose
Get a working VibeSwitch instance running on your machine in under ten minutes. By the end you'll have:

1. The API server running and serving the SPA.
2. The Vite dev server running (for live UI edits).
3. Swagger UI and the in-app Docs panel both reachable.
4. One fresh homefront news export on disk, ready to feed the analysis pipeline.

This is the fastest path to "I can see this working." It does *not* enable auth, set up production deploys, or wire in WhatsApp/audio — those are separate guides linked at the bottom.

## Prerequisites
- **Required**: Node.js 20+ (the project root uses `type: module`; older Node versions won't parse the code).
- **Required**: `NEWSAPI_API_KEY` from [NewsAPI.ai](https://newsapi.ai) — used to fetch homefront-relevant articles.
- **Optional but recommended**: `ANTHROPIC_API_KEY` — lets you run signal extraction and narrative generation after ingestion.
- **Optional**: `OPENAI_API_KEY` — only needed if you plan to transcribe audio.

## Inputs
- **Environment variables**: a root `.env` with at least `NEWSAPI_API_KEY`. Anthropic and OpenAI keys are optional for the Quickstart but required for full analysis.
- **Two free ports**: 3000 (API server) and 5173 (Vite dev server).

## Outputs
- **Running API**: Fastify responds at `http://localhost:3000`.
- **Running UI**: Vite serves the SPA at `http://localhost:5173` with a proxy to the API.
- **Docs + OpenAPI reachable**: `/api/docs/index`, `/api/openapi.json`, and `/api/swagger` all return `200`.
- **First ingest artifact**: a dated homefront markdown file under `business_modules/news-sites/articles_extracted/articles-homefront-YYYY-MM-DD.md`.

## Constraints
- **Never commit API keys.** `.env` and `client/.env.local` are gitignored — keep them that way. Use environment variables or a secrets manager in production.
- **Auth is off by default in the Quickstart.** If your `.env` sets `AUTH_REQUIRED=true`, several endpoints will return 401 until you also configure Firebase — see [Auth setup](auth-setup.md).
- **`type: module`**: if you see `SyntaxError: Cannot use import statement outside a module`, you're on an old Node version. Upgrade.

## Examples

### 1) Install dependencies

```bash runnable
npm install
cd client && npm install
```

Expected: both installs complete without error. Lockfiles are committed, so you should see consistent versions across machines.

### 2) Create the `.env` file

In the repo root:

```env
NEWSAPI_API_KEY=your_key_here
# Optional but recommended:
ANTHROPIC_API_KEY=sk-ant-...
# Optional — only for audio ingestion:
OPENAI_API_KEY=sk-...
# Leave auth off for the quickstart:
AUTH_REQUIRED=false
```

Expected: the server will start without "API key is required". You can add more keys later — nothing in the Quickstart needs more than `NEWSAPI_API_KEY`.

### 3) Start the server

```bash runnable
npm run start
```

Expected: the server logs a startup line and binds to `http://localhost:3000`. Leave this terminal running.

### 4) Start the client (dev, second terminal)

```bash runnable
npm run client:dev
```

Expected: Vite prints a local URL (usually `http://localhost:5173`). Open it — you should see the Home Front Command dashboard. API requests are proxied to `:3000` automatically.

### 5) Verify docs + Swagger

Back in a third terminal:

```bash runnable
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/docs/index
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/openapi.json
```

Expected: both print `200`.

Then open these in the browser:

- **Swagger UI**: `http://localhost:3000/api/swagger` — interactive API explorer.
- **In-app Docs panel**: click **Docs** in the app header.

### 6) Ingest news for today

```bash runnable
npm run homefront-to-md
```

Expected: two files appear under `business_modules/news-sites/articles_extracted/`:

- `articles-homefront.md` (the latest run, overwritten each time)
- `articles-homefront-YYYY-MM-DD.md` (dated archive)

The command fetches articles from NewsAPI.ai, asks an LLM to filter for homefront relevance, and writes both files.

### 7) (Optional) Run analysis on the export

If you added `ANTHROPIC_API_KEY`:

```bash runnable
npm run extract-signals -- --source-type news --files business_modules/news-sites/articles_extracted/articles-homefront.md --date $(date +%Y-%m-%d)
npm run assess-signals -- --date $(date +%Y-%m-%d) --days 1 --scope national
```

Expected: logs show signal extraction, then a scored assessment. The UI's Report tab picks this up on the next refresh.

## Troubleshooting
- **"API key is required" at startup**
  - **Check**: root `.env` contains `NEWSAPI_API_KEY`.
  - **Fix**: set it and restart the server.
- **UI loads but API calls fail / CORS errors**
  - **Check**: the API server is running on `:3000` and the Vite proxy is intact.
  - **Fix**: confirm `client/vite.config.js` proxies `/api` → `http://localhost:3000`. Restart both servers.
- **`npm run homefront-to-md` runs but no dated file appears**
  - **Check**: whether `HOMEFRONT_MD` is set in your env and points elsewhere.
  - **Fix**: unset `HOMEFRONT_MD`, or point it to the `business_modules/news-sites/articles_extracted/` directory.
- **`SyntaxError: Cannot use import statement outside a module`**
  - **Check**: `node --version`.
  - **Fix**: upgrade to Node 20+.
- **401 Unauthorized from every API call**
  - **Check**: `.env` for `AUTH_REQUIRED=true`.
  - **Fix**: set it to `false` for the Quickstart, or follow [Auth setup](auth-setup.md) to finish the auth wiring.
- **Swagger UI is blank**
  - **Check**: `http://localhost:3000/api/openapi.json` returns valid JSON.
  - **Fix**: confirm `openapi/openapi.yaml` exists on disk; a missing or malformed spec breaks the UI.

### Next steps
- Configure auth: [Auth setup](auth-setup.md)
- Operate the daily pipeline: [Operate the daily pipeline](../guides/operating-daily-pipeline.md)
- Plug in more sources: [WhatsApp](../guides/whatsapp-integration.md), [Audio](../guides/audio-ingestion.md)
- Understand the model: [System dataflow](../concepts/system-dataflow.md)
