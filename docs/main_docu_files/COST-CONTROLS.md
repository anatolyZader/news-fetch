# Cost controls

**Purpose:** Cap **interactive LLM spend** via daily HTTP budget and centralized cost logging. Batch pipeline scripts use separate budget checks.

**Sources:** `cross-cut-modules/budget/app/httpDailyBudget.js`, `cross-cut-modules/security/input/costlyRoutePreHandlers.js`, `cross-cut-modules/log/data/cost-log.jsonl`.

---

## Daily HTTP budget

**Limit:** `DAILY_BUDGET_USD` (default **$10.00**).

**Tracker:** `getDailyBudgetStatus()` sums `cost-log.jsonl` for the UTC day.

**Guard:** `httpDailyBudgetPreHandler` → HTTP **429** `{ code: 'daily_budget_exceeded' }` when over cap.

**Composition:** `costlyRoutePreHandlers` = auth hooks + optional App Check + `httpDailyBudgetPreHandler`.

---

## Costly HTTP routes

Routes using **`costlyRoutePreHandlers`** (full chain):

| Route | Module |
|-------|--------|
| `POST /api/chat` | `chatRoutes.js` — logged as `http:chat` |
| `POST /api/evidence-submit`, `/api/evidence-upload` | `evidenceRoutes.js` |
| `POST /api/social-media/fetch-topic` | `socialMediaRoutes.js` |
| `POST /api/signal-catalog-evolution/proposals/generate` | `signalCatalogEvolutionRoutes.js` |
| `POST /api/video/download-url`, `/api/translate` | `reportRoutes.js` |
| `POST /api/validation/review-queue/.../explain` | `validationReviewRoutes.js` |
| `POST /api/validation/review-queue/.../agent` | `validationReviewRoutes.js` |
| `POST /api/report-build/start`, `/turn`, `/suggest` | `reportBuildRoutes.js` |

**Budget only** (no full costly chain):

| Route | Module |
|-------|--------|
| `GET /api/docs/search` | `docsRoutes.js` — rate limit + budget |

---

## Pipeline / CLI budget

Extract and assess CLIs call `checkDailyBudget()` from `cross-cut-modules/budget` before LLM work:

- Script ids: `extract-signals`, `assess-signals`
- Logged to same `cost-log.jsonl`

Narrative and verification steps inside assess accumulate under assess script id.

---

## Related configuration

| Variable | Role |
|----------|------|
| `DAILY_BUDGET_USD` | Daily cap |
| `RATE_LIMIT_DOCS_SEARCH_MAX` | Docs search rate (default 30) |
| `CHAT_MAX_TOOL_ROUNDS` | Limits chat tool-loop cost exposure |
| `CHAT_RETRIEVAL_CACHE_TTL_MS` | Retrieval cache (default 600000) |

**Testing:** `npm run test-tokens` → `cross-cut-modules/budget/input/test-token-usage.js`.

---

## Related docs

- Chat and agents: [LLM-CHAT-AND-AGENTS.md](./LLM-CHAT-AND-AGENTS.md)
- Pipeline CLIs: [PIPELINE-AND-SOURCES.md](./PIPELINE-AND-SOURCES.md)
