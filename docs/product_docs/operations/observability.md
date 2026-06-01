---
title: "Observability"
description: "Where to look when things fail: logs, endpoints, and debug flow."
intent: operations
audience: ["internal"]
stability: beta
canonical: "https://docs.vibeswitch.ai/operations/observability"
version: "current"
tags: ["operations", "debugging"]
---

## Purpose
Get from "something's broken" to "I know what's broken" quickly. This page lists the endpoints and log signals Srulik's lab exposes, and a debug flow that narrows a failure to a specific stage (ingest, extract, assess, auth, UI) before you start changing anything.

## Prerequisites
- **Required**: Access to server logs (stdout locally, your platform's log viewer in production).
- **Required**: Ability to make HTTP requests to the server (curl, Postman, or the Swagger UI).
- **Useful**: Access to the `daily_reports/`, `signals/`, and source export directories so you can tell whether each stage's artifact exists for a given date.

## Inputs
- **A symptom**: UI error, missing report, pipeline log line, unexpected number.
- **A date**: almost every issue is date-scoped. Nail down which date is affected first.

## Outputs
- **A localized stage**: ingestion vs. extraction vs. assessment vs. auth vs. UI.
- **A next action**: rerun a command, fix a config value, or escalate to a code fix.

## Constraints
- **Prefer deterministic checks** over narrative diagnosis. Files on disk, HTTP status codes, and log lines are ground truth. The UI is a derived view — debugging the UI before confirming the server is running wastes time.
- **Read logs top-down, not bottom-up.** The first error in a run is usually the real cause; later lines are symptoms of the first failure.
- **Don't patch in place.** If a stage is broken, fix the config or the code, then rerun the pipeline. Hand-editing output files (signals JSON, export markdown) creates drift you'll chase for weeks.

## Debug flow (use this first)

1. **Is the server running?** `curl /api/openapi.json` → `200` means yes.
2. **Is auth required?** `curl /api/auth/config` → response tells the UI whether to prompt.
3. **Are docs served?** `curl /api/docs/index` → `200` with a non-empty array means `docs/product_docs/` is deployed.
4. **Is there a report for today?** `curl /api/report/today` → `200` means yes, `404` means assessment hasn't run.
5. **Do today's artifacts exist?** `ls signals/signals-*-$(date -u +%F).json daily_reports/*.json` → you can tell stage-by-stage which ones completed.
6. **Server logs** for the first error in today's pipeline run.

Each step narrows the possible causes roughly in half. Do them in order.

## Examples

### Check server health via the OpenAPI endpoint

```bash runnable
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/openapi.json
```

Expected: `200`. Anything else means the server isn't reachable or is misconfigured.

### Check whether auth is required

```bash runnable
curl -sS http://localhost:3000/api/auth/config
```

Expected: `{"authRequired":true}` or `{"authRequired":false}`. This endpoint is always public — it's how the UI bootstraps.

### Check the in-app docs index

```bash runnable
curl -sS http://localhost:3000/api/docs/index | head -c 300
```

Expected: JSON with a `pages` array. Empty array or `404` means `docs/product_docs/` wasn't deployed with the server.

### Check today's report cache

```bash runnable
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/report/today
```

Expected: `200` once today's assessment completes. `404` is the normal state early in the day before the pipeline has run.

### Inspect per-stage artifacts

```bash runnable
ls -1 signals/ | tail -n 10
ls -1 daily_reports/ 2>/dev/null | tail -n 10
ls -1 business_modules/news-sites/articles_extracted/ | tail -n 10
```

Expected: recent dated files in each. Missing files for today = that stage hasn't run (or failed).

### Tail server logs

```bash runnable
tail -n 50 server.log 2>/dev/null || true
```

Expected: recent log lines. In production, substitute your platform's log command. Look for the **first** error, not the latest.

### Cost log (for cost-related symptoms)

```bash runnable
tail -n 20 cross-cut-modules/log/data/cost-log.jsonl 2>/dev/null || true
```

Expected: JSONL lines with model, tokens, and cost per call. See [Cost controls](cost-controls.md) for how to use this.

## Useful endpoints at a glance

| Endpoint | Purpose | Auth |
|---|---|---|
| `/api/openapi.json` | OpenAPI spec for the server | Public |
| `/api/swagger` | Swagger UI | Public |
| `/api/auth/config` | `{authRequired: bool}` | Public |
| `/api/docs/index` | Product docs index | Public (non-gated) |
| `/api/docs/page/:slug` | Individual doc page | Public unless gated |
| `/api/report/today` | Cached current report | Varies (auth when required) |
| `/api/report/:date` | Cached report for a date | Varies |
| `/api/chat` | Follow-up chat grounded in report | Auth when required |

## Troubleshooting
- **Docs panel in the app is empty**
  - **Check**: `/api/docs/index` returns a non-empty `pages` array.
  - **Fix**: ensure the server deploy includes `docs/product_docs/`, then restart the server.
- **Report doesn't show in the UI even though assessment ran**
  - **Check**: `/api/report/today` returns `200` with the expected date.
  - **Fix**: if the endpoint is correct but the UI is stale, hard-refresh (`Shift+Reload`). If the endpoint is wrong, regenerate the assessment and confirm server cache picks it up.
- **SSE endpoints disconnect mid-response**
  - **Check**: proxies (load balancers, Cloudflare) are configured to allow `text/event-stream` and long-lived connections.
  - **Fix**: enable streaming / long timeouts on the proxy. Locally, SSE should just work.
- **Server logs are flooded with one error**
  - **Check**: what's retrying — usually an upstream LLM call or rate limit.
  - **Fix**: add a short circuit or let the batch complete, but don't let noisy errors mask a new real one. See [Cost controls](cost-controls.md).
- **Two environments produce different reports for the same day**
  - **Check**: input files are the same in both environments.
  - **Fix**: the environments have diverged on inputs, prompts, or weights. Reconcile one side to match the other deliberately.
- **I can't reproduce a failure I saw earlier**
  - **Check**: whether the failing inputs are still on disk.
  - **Fix**: snapshot the day's exports + signals JSON every day, so you can replay later. Don't rely on being able to rerun from the original upstream sources.
