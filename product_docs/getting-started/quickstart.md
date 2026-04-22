---
title: "Quickstart"
description: "Get to first success in under 10 minutes."
intent: getting-started
audience: ["public", "customer"]
stability: beta
canonical: "https://docs.vibeswitch.ai/getting-started/quickstart"
version: "current"
tags: ["quickstart"]
llm:
  chunkHint: "Prefer steps with explicit inputs/outputs."
---

## Purpose
Get a minimal VibeSwitch deployment running and produce a first end-to-end result.

## Prerequisites
- **Required**: Node.js \(project root uses `type: module`\)
- **Required**: One of: `NEWSAPI_API_KEY` \(for article ingest\) or a submission workflow

## Inputs
- **Environment variables**: `.env` values for your deployment

## Outputs
- **Running app**: server responds and UI loads
- **First result**: a report/analysis output visible in the UI

## Constraints
- **Secrets**: never commit API keys; use environment variables
- **Auth**: some endpoints may require Firebase JWT when `AUTH_REQUIRED=true`

## Examples

### Run the server

```bash
npm install
npm run start
```

Expected: server starts without crashing.

### Run the client in dev mode

```bash
cd client
npm install
npm run dev
```

Expected: Vite dev server starts and loads the app UI.

## Troubleshooting
- **UI loads but API calls fail**\n  - **Check**: server is running and reachable from the client proxy\n  - **Fix**: verify `client/vite.config.js` proxy settings and server port

