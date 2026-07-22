# Dependencies

Inventory and review process for npm dependencies in this monorepo (root app, `client/`, `docs-site/`).

## Lockfiles and install policy

| Path | Lockfile | CI install |
|------|----------|------------|
| Repository root | `package-lock.json` | `npm ci` with min-release-age (7 days) |
| `client/` | `client/package-lock.json` | `npm ci --prefix client` |
| `docs-site/` | `docs-site/package-lock.json` | `npm ci --prefix docs-site` |

Local development may use `npm install` when adding deps; commit the updated lockfile. Prefer `npm ci` after switching branches.

Automated updates: [.github/dependabot.yml](../.github/dependabot.yml) (weekly, grouped).

Security policy: [SECURITY.md](../SECURITY.md).

## Root production dependencies

| Package | Purpose | Used in | Status |
|---------|---------|---------|--------|
| `@anthropic-ai/sdk` | Claude API | Resilience, translation | Keep |
| `@fastify/multipart` | File uploads | Server | Keep |
| `@fastify/static` | Static assets | Server | Keep |
| `@fastify/swagger` / `@fastify/swagger-ui` | OpenAPI UI | Server | Keep |
| `ajv` | JSON schema validation | Cross-cutting | Keep |
| `dotenv` | Local env loading | Server, scripts | Keep |
| `fastify` | HTTP server | Server | Keep |
| `firebase-admin` | Firebase backend | Identity, storage | Keep |
| `google-trends-api` | Google Trends HTTP client | `search_trends` adapter | Keep (not duplicate of googleapis) |
| `googleapis` | Google Sheets, YouTube Data API | Pool, video adapters | Keep |
| `jsonrepair` | Repair malformed JSON from LLMs | Resilience, translation | Keep |
| `openai` | OpenAI API | Various modules | Keep |
| `xlsx` | Excel ingest (visits, pool, PBO, surveys) | Multiple modules | Keep; high severity accepted in CI audit (no npm fix) |
| `yaml` | YAML parsing | Config / docs tooling | Keep |
| `pptxgenjs` | — | — | **Removed** (was unused) |

## Root dev dependencies

| Package | Purpose | Status |
|---------|---------|--------|
| `@redocly/cli` | OpenAPI lint | Keep |
| `eslint` / `@eslint/js` / `eslint-plugin-react-hooks` / `globals` | Linting | Keep |

## Client (`client/package.json`)

Standard React 18 + Vite 6 + MUI 9 + Firebase client SDK stack. No periodic purge planned unless features are removed.

## Docs site (`docs-site/package.json`)

Docusaurus 3 + OpenAPI docs plugins. Separate lockfile; update via Dependabot or intentional PR.

## Quarterly review checklist

Run at least once per quarter (or after major feature removals):

1. `npm run deps:audit` — flags direct root dependencies with no import under application paths.
2. `npm ls --prod` at root, `client/`, and `docs-site/`.
3. Review open Dependabot PRs; merge or close stale ones.
4. Re-read this table; remove packages whose features were deleted.
5. Re-check [scripts/ci-audit.mjs](../scripts/ci-audit.mjs) exceptions (e.g. `xlsx`).

## Adding or upgrading dependencies

1. Open a PR with lockfile changes only from intentional `npm install` / Dependabot.
2. Ensure CI passes: **Security audit**, **Dependency review**, and min-release-age (7 days).
3. If a critical CVE fix requires a version younger than 7 days, use the **`security-exception`** label or CI workflow dispatch skip (see [SECURITY.md](../SECURITY.md)) and note the CVE in the PR description.

## AI-generated dependency changes

Same rules as human changes: review diff, run tests locally when possible, do not merge solely on AI recommendation without CI green.
