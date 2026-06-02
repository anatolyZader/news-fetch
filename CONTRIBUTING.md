# Contributing

## Architecture review (including AI-generated code)

Before merging substantial changes:

1. **Module boundaries** — business modules import siblings only via `index.js` facades; async cross-module effects use `cross-cut-modules/messaging` typed events.
2. **HTTP routes** — Fastify route plugins live under `business_modules/*/input/*Routes.js` or `cross-cut-modules/*/input/*Routes.js`. `api/routes/` holds deprecated re-exports only.
3. **Layers** — domain must not import `node:fs` or auth; use persistence ports and inject capabilities from routes/app.
4. **Errors** — use `cross-cut-modules/errors` (`ValidationError`, `NotFoundError`, etc.) for API-facing failures.
5. **Tests** — run `npm test` and `npm run lint`; add contract tests under `tests/contracts/` when changing event payloads.
6. **Secrets** — never log tokens, passwords, or full JWTs.

Optional audit: `node scripts/audit-code-smells.mjs`
