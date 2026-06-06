# ADR 004: Deployment topology (CDN + API + workers)

## Status

Accepted

## Decision

1. **CDN** serves `client/dist` (Cloudflare or equivalent).
2. **API** runs `SERVE_STATIC=false` — Fastify serves `/api/*` only (`npm run start:api`).
3. **Workers** — same repo, separate processes: `npm run worker:outbox`, `npm run worker:assess`.

## Consequences

- See [deployment-split.md](../../cross-cut-modules/docs/content/pages/operations/deployment-split.md) for cutover steps.
- Single SQLite writer per environment remains required.
