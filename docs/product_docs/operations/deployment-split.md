---
title: Deployment split (CDN, API, workers)
description: Run static UI, API, and background workers separately.
intent: operations
audience: ["internal"]
---

## API-only mode

```bash
SERVE_STATIC=false npm start
```

Or: `npm run start:api`

## Workers

```bash
npm run worker:outbox
npm run worker:assess -- --date 2026-06-02 --scope national
```

## Static UI

Build `client/dist` and serve via CDN (`scripts/ops/cloudflare-cutover.sh`). Origin routes `/api/*` to the API service.

## Environment

| Variable | Role |
|----------|------|
| `SERVE_STATIC` | `false` on API replicas |
| `OUTBOX_DISPATCH_INTERVAL_MS` | Outbox drain interval in API or worker |
| `WORKER_MODE` | Set by worker scripts |
