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

**Assess (default):** includes **assessment agent** LLM rounds (planner, specialists, synthesizer) under the `assess-signals` script id, capped by `RESILIENCE_ASSESSMENT_AGENT_MAX_USD` / `RESILIENCE_ASSESSMENT_AGENT_MAX_ROUNDS` via `cross-cut-modules/agent/` budget governor — separate from the HTTP daily cap.

Legacy narrative and verification steps inside assess also accumulate under assess script id when agent is disabled.

---

## Related configuration

| Variable | Role |
|----------|------|
| `DAILY_BUDGET_USD` | Daily cap |
| `RATE_LIMIT_DOCS_SEARCH_MAX` | Docs search rate (default 30) |
| `CHAT_MAX_TOOL_ROUNDS` | Limits chat tool-loop cost exposure |
| `CHAT_RETRIEVAL_CACHE_TTL_MS` | Retrieval cache (default 600000) |

Assessment agent caps (planner/specialist/synth tiers, re-plan hop): see [MODEL-CARD.md](../MODEL-CARD.md) and `cross-cut-modules/agent/agentConfig.js`.

**Testing:** `npm run test-tokens` → `cross-cut-modules/budget/input/test-token-usage.js`.

---

## LLM invocation telemetry

Every LLM call routed through **`LlmGateway`** (`cross-cut-modules/llm/llmGateway.js`) appends a structured line to:

`cross-cut-modules/log/data/llm-invocations.jsonl`

**Fields:** `timestamp`, `requestId`, `feature`, `agentName`, `purpose`, `promptId`, `promptVersion`, `model`, token counts (including `cachedInputTokens`, `cacheCreationTokens`), `costUsd`, `latencyMs`, `stopReason`, `cacheHit` (e.g. `extraction` on SQLite cache hits).

**Feature rollup:** `monitoringService.getLlmTelemetry({ date })` aggregates by `feature` for the UTC day.

**Pricing:** `llmPricing.js` extends Anthropic cache-read / cache-creation token rates.

---

## Extraction & assess cost controls

| Variable | Default | Role |
|----------|---------|------|
| `RESILIENCE_EXTRACT_CACHE` | `1` | SQLite per-article extraction cache (`llm_extraction_cache`) |
| `RESILIENCE_EXTRACT_MULTIPASS` | `1` | `0` single; `1` three-pass; `2` two-pass (AB + C) |
| `RESILIENCE_EXTRACT_MAX_TOKENS` | `5000` | Extract output cap (1500–12000) |
| `RESILIENCE_SELF_CHECK_MAX_TOKENS` | `2000` | Self-check cap |
| `RESILIENCE_EXTRACT_BATCH` | off | Anthropic Batch API for extract cron |
| `RESILIENCE_EXTRACT_PROMPT_CACHE` | off | Ephemeral cache on stable extract prefix |
| `HOMEFRONT_PREFILTER_MODE` | `keyword` | Keyword prefilter; `llm` = legacy Haiku |
| `RESILIENCE_ASSESS_LAZY_RAG` | `1` | Planner before component RAG seed |
| `RESILIENCE_ASSESS_GLOBAL_TOPK` | `8` | Global assess retrieve top-K |
| `RESILIENCE_ASSESS_COMPACT_TOOL_LOOP` | `1` | Compact agent tool-loop history |
| `CHAT_COMPACT_TOOL_LOOP` | off | Compact chat tool-loop history |

Prompt version **`extract-v2`** — bump in `extractionPrompt.js` invalidates extraction cache.

---

## Related docs

- Chat and agents: [LLM-CHAT-AND-AGENTS.md](./LLM-CHAT-AND-AGENTS.md)
- Pipeline CLIs: [PIPELINE-AND-SOURCES.md](./PIPELINE-AND-SOURCES.md)
