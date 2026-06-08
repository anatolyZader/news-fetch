# Cost controls

**Purpose:** Cap **interactive LLM spend** via daily HTTP budget and centralized cost logging. Batch pipeline scripts use separate budget checks.

**Sources:** `cross-cut-modules/budget/app/httpDailyBudget.js`, `cross-cut-modules/security/input/costlyRoutePreHandlers.js`, `cross-cut-modules/log/data/cost-log.jsonl`.

---

## Daily HTTP budget

**Limit:** `DAILY_BUDGET_USD` (default **$10.00**).

**Tracker:** `getDailyBudgetStatus()` sums `cost-log.jsonl` for the UTC day.

**Guard:** `httpDailyBudgetPreHandler` → HTTP **429** `{ code: 'daily_budget_exceeded' }` when over cap.

**Chat exception:** `POST /api/chat` uses `createHttpChatBudgetPreHandler` (`httpChatBudgetPreHandler.js`) — a **soft gate** when `CHAT_DETERMINISTIC_FALLBACK !== '0'`: sets `request.budgetDegraded = true` and continues (deterministic tool fallback in `chatDeterministicFallback.js`). Other costly routes remain hard **429**.

**Composition:** `costlyRoutePreHandlers` = auth hooks + optional App Check + `httpDailyBudgetPreHandler`.

---

## Costly HTTP routes

Routes using **`costlyRoutePreHandlers`** (full chain):

| Route | Module |
|-------|--------|
| `POST /api/chat` | `chatRoutes.js` — logged as `http:chat` (or `http:chat:crisis` when crisis pool active) |
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

**Extract** calls `checkDailyBudget()` before LLM work (hard exit when exceeded).

**Assess** uses `getDailyBudgetStatus()` — when the daily cap is exceeded, the assessment agent LLM is skipped and **deterministic degrade** runs (shadow scoring still completes; report includes `assessment_degraded`).

- Script ids: `extract-signals`, `assess-signals`
- Logged to same `cost-log.jsonl`

**Assess (default):** includes **assessment agent** LLM rounds (planner, specialists, synthesizer) under the `assess-signals` script id, capped by `RESILIENCE_ASSESSMENT_AGENT_MAX_USD` / `RESILIENCE_ASSESSMENT_AGENT_MAX_ROUNDS` via `cross-cut-modules/agent/` budget governor — separate from the HTTP daily cap.

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

**Fields:** `timestamp`, `requestId`, `feature`, `agentName`, `purpose`, `promptId`, `promptVersion`, `model`, token counts (including `cachedInputTokens`, `cacheCreationTokens`), `costUsd`, `latencyMs`, `stopReason`, `cacheHit` (e.g. `extraction` on SQLite cache hits), `promptCacheApplied` (when Anthropic ephemeral cache blocks were attached).

**Feature rollup:** `monitoringService.getLlmTelemetry({ date })` aggregates by `feature` for the UTC day. `readLlmTelemetryForDate` also returns `cached_input_tokens_total`, `cache_creation_tokens_total`, and `cache_by_feature`.

**Pricing:** `llmPricing.js` extends Anthropic cache-read / cache-creation token rates.

---

## Post-deploy verification

Verify prompt optimization (cache, slim prompts, tool compression) after deploy:

| Command | When |
|---------|------|
| `npm run verify:prompt-optimization` | CI / local offline smoke (mock client, no API key) |
| `npm run verify:prompt-optimization -- --audit $(date -u +%F)` | Post-deploy: analyze today's `llm-invocations.jsonl` |
| `npm run verify:prompt-optimization -- --flags` | Show optimization env ON/OFF and quality escape hatches |
| `npm run verify:prompt-optimization -- --live` | Spot-check with real Anthropic calls (`ANTHROPIC_API_KEY` required) |

**Offline smoke** runs a 2-round chat tool loop through `LlmGateway` with a mock client and asserts `cachedInputTokens` on round 1+ and `promptCacheApplied` in telemetry.

**Audit** uses `cross-cut-modules/llm/analyzeLlmInvocations.js` — flags issues when cache was created on round-0 but not read on later tool-loop rounds (chat, planner, synthesizer, etc.).

**Quality rollback:** use `--flags` to see opt-out env vars (`LLM_PROMPT_CACHE=0`, `CHAT_COMPRESS_TOOLS=0`, `RESILIENCE_ASSESS_SLIM_PLANNER=0`, etc.) or per-turn `POST /api/chat` `{ "economy": "full" }`.

Optional `--full-assess` with `--live` is reserved for manual full `assess-signals` checks (not run in CI).

---

## Extraction & assess cost controls

| Variable | Default | Role |
|----------|---------|------|
| `RESILIENCE_EXTRACT_CACHE` | `1` | SQLite per-article extraction cache (`llm_extraction_cache`) |
| `RESILIENCE_EXTRACT_MULTIPASS` | `1` | `0` single; `1` three-pass; `2` two-pass (AB + C) |
| `RESILIENCE_EXTRACT_MAX_TOKENS` | `5000` | Extract output cap (1500–12000) |
| `RESILIENCE_SELF_CHECK_MAX_TOKENS` | `2000` | Self-check cap |
| `RESILIENCE_EXTRACT_BATCH` | off | Anthropic Batch API for extract cron |
| `LLM_PROMPT_CACHE` | `1` | Master gate for Anthropic ephemeral prompt caching (`=0` disables all) |
| `RESILIENCE_EXTRACT_PROMPT_CACHE` | `1` | Ephemeral cache on stable extract system blocks |
| `RESILIENCE_ASSESS_PROMPT_CACHE` | `1` | Cache planner/specialist/synthesizer stable instructions |
| `CHAT_PROMPT_CACHE` | `1` | Cache chat tool template (stable) across tool rounds |
| `CHAT_COMPRESS_TOOLS` | `1` | Compress chat tool JSON/text returned to the model (`=0` to disable) |
| `RESILIENCE_ASSESS_SLIM_PLANNER` | `1` | Compact epistemic profile + planner context in planner prompt |
| `RESILIENCE_ASSESS_SLIM_SYNTH` | `1` | Compact component assessments in synthesizer prompt |
| `HOMEFRONT_PREFILTER_MODE` | `keyword` | Keyword prefilter; `llm` = legacy Haiku |
| `RESILIENCE_ASSESS_LAZY_RAG` | `1` | Planner before component RAG seed |
| `RESILIENCE_ASSESS_GLOBAL_TOPK` | `8` | Global assess retrieve top-K |
| `RESILIENCE_ASSESS_COMPACT_TOOL_LOOP` | `1` | Compact agent tool-loop history |
| `CHAT_COMPACT_TOOL_LOOP` | `1` | Compact chat tool-loop history (`=0` to disable) |
| `CHAT_CONTEXT_TIERING` | `1` | Rule-based slim system context per message (`=0` for full report every turn) |

---

## Crisis chat budget (C+B hybrid)

When daily HTTP budget is exhausted during crisis epistemic conditions, operators see a **suggest activation** banner; **analysts** HITL-activate an extra **chat-only** pool.

| Variable | Default | Role |
|----------|---------|------|
| `CRISIS_BUDGET_ENABLED` | on (`≠0`) | Master switch |
| `CRISIS_BUDGET_USD` | `50` | Extra chat pool cap |
| `CRISIS_BUDGET_DEFAULT_HOURS` | `4` | Session TTL |
| `CHAT_DETERMINISTIC_FALLBACK` | on | Non-LLM tool fallback when both pools exhausted |

**Spend scripts:** normal chat → `http:chat`; crisis pool → `http:chat:crisis`. Evidence upload, validation agent, report build, etc. **do not** use the crisis pool — they still hard **429** at daily cap.

**Routes (analyst):** `GET /api/budget/crisis-status`, `POST /api/budget/crisis/activate`, `POST /api/budget/crisis/deactivate` (`crisisBudgetRoutes.js`).

**Auto-suggest:** `suggest_crisis_budget: true` on report API when `(data_void.level >= critical \|\| sampling_blind \|\| digital_darkness) && chat budget exhausted` — no auto-activate.

**Gate order (`resolveChatBudgetGate`):** daily OK → LLM; daily exceeded + active crisis pool → LLM (`http:chat:crisis`); else fallback if enabled; else **429**.

**Sources:** `cross-cut-modules/budget/app/crisisBudgetService.js`, `crisisBudgetSqliteAdapter.js`, `httpChatBudgetPreHandler.js`.

**Chat one-turn bypass:** `POST /api/chat` body `"economy": "full"` forces full report context, disables compact tool loop, and skips chat tool compression for that turn only (no redeploy). Every `done` SSE event includes `chat_economy` metadata; cost-log records `stage=chat_economy`.

**Prompt cache hits:** Use `npm run verify:prompt-optimization -- --audit YYYY-MM-DD` instead of manual grep. Tool round 2+ on chat/assess should show non-zero `cachedInputTokens` when stable system blocks exceed ~2K chars.

Prompt version **`extract-v2`** — bump in `extractionPrompt.js` invalidates extraction cache.

---

## Related docs

- Chat and agents: [LLM-CHAT-AND-AGENTS.md](./LLM-CHAT-AND-AGENTS.md)
- Pipeline CLIs: [PIPELINE-AND-SOURCES.md](./PIPELINE-AND-SOURCES.md)
