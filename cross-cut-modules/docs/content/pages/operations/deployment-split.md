---
title: Deployment split (CDN, API, workers)
description: Run static UI, API, and background workers separately.
intent: operations
audience: ["internal"]
stability: beta
---

## Purpose
Describe how to run the API, background workers, and static UI as separate processes for production-style deployments.

## Prerequisites
- **Required**: A built `client/dist` when serving the UI from a CDN.
- **Useful**: Familiarity with `scripts/ops/cloudflare-cutover.sh`.

## Inputs
- **Process roles**: API server, outbox/assess workers, static UI origin or CDN.
- **Environment**: `SERVE_STATIC`, worker interval vars, scope/date for assess worker.

## Outputs
- **API-only** Node process (`SERVE_STATIC=false`).
- **Worker** processes for outbox dispatch and signal assessment.
- **Static UI** served from CDN with `/api/*` routed to the API service.

## Constraints
- Do not run long assess jobs on the same replica as user-facing API without resource limits.
- API replicas that serve JSON only should set `SERVE_STATIC=false`.

## Examples

### API-only mode

```bash runnable
SERVE_STATIC=false npm start
```

Expected: Fastify listens without serving `client/dist`; `/api/*` routes respond.

Or: `npm run start:api`

### Workers

```bash
npm run worker:outbox
npm run worker:assess -- --date 2026-06-02 --scope national
```

### Static UI

Build `client/dist` and serve via CDN (`scripts/ops/cloudflare-cutover.sh`). Origin routes `/api/*` to the API service.

## Environment

| Variable | Role |
|----------|------|
| `SERVE_STATIC` | `false` on API replicas |
| `OUTBOX_DISPATCH_INTERVAL_MS` | Outbox drain interval in API or worker |
| `WORKER_MODE` | Set by worker scripts |

## Troubleshooting
- **UI loads but API calls fail**
  - **Check**: CDN/origin routes `/api/*` to the API service, not the static bucket.
  - **Fix**: update Cloudflare origin rules per `scripts/ops/cloudflare-cutover.sh`.
- **Workers never drain the outbox**
  - **Check**: `OUTBOX_DISPATCH_INTERVAL_MS` and that the worker process is running.
  - **Fix**: run `npm run worker:outbox` on a dedicated worker host or enable in-process dispatch on the API if appropriate.
