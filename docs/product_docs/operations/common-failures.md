---
title: "Common failures"
description: "Symptoms → checks → fixes for the most common operational failures."
intent: operations
audience: ["internal"]
stability: beta
canonical: "https://docs.vibeswitch.ai/operations/common-failures"
version: "current"
tags: ["operations", "troubleshooting", "user"]
---

## When something breaks, start here
This page is for operators (and power users) who need to answer one question fast:

**“Is the system up, and if not, what’s the smallest next action that restores it?”**

If you’re an end user and you can’t see today’s report, send this page to your operator.

## 60‑second “is it alive?” check
If you can run a command from the server (or from a machine that can reach it), these four checks tell you what kind of failure you have:

```bash runnable
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/openapi.json
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/auth/config
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/docs/index
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/report/today
```

Expected:
- first three return `200` (they confirm “server is up + docs are present”)
- report is `200` if cached, `404` if today hasn’t been generated yet

## The most common problems (and the fix that actually works)

### “API key is required” at startup
- **Cause**: missing `NEWSAPI_API_KEY`
- **Fix**: set it in env, restart the server.

### The report is empty / “No assessment is available yet”
- **Cause**: ingestion/analysis didn’t run for that date
- **Fix**: run the daily pipeline for today (see [Operate the daily pipeline](../guides/operating-daily-pipeline.md)).

### Everything is 401 Unauthorized
- **Cause**: auth is enabled and the client is not sending a token
- **Fix**: sign in in the UI, or temporarily disable auth for local debugging (`AUTH_REQUIRED=false`).

### Docs panel is empty or `/api/docs/*` is 404
- **Cause**: deployment missing `docs/product_docs/` (or server route isn’t running)
- **Fix**: redeploy including `docs/product_docs/`, restart.

### Swagger UI is blank
- **Cause**: OpenAPI spec missing/broken
- **Fix**: verify `/api/openapi.json` returns 200 + JSON; ensure `openapi/openapi.yaml` is present on the server.

### Upstream provider down (NewsAPI / OpenAI / Anthropic)
- **Cause**: upstream outage or egress blocked
- **Fix**: pause retries, log the gap, rerun later. Don’t “half run” a day without recording it.

## Troubleshooting
- **The symptom changed after I applied a fix**
  - That’s usually progress. Treat the *new* symptom as the current problem and work from there.
- **The failure is intermittent**
  - Check rate limits and budget caps first; those can look random but are deterministic by volume.
  - See [Cost controls](cost-controls.md) and [Observability](observability.md).
