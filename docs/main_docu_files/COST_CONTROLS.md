# Cost controls (LLM, RAG, agents)

This document describes how the app limits and records API spend for batch pipelines and interactive HTTP routes.

## Unified cost ledger

All tracked spend is appended to **`cross-cut-modules/log/data/cost-log.jsonl`** (override with `COST_LOG_PATH`).

| Source | `script` field in log | When written |
|--------|----------------------|--------------|
| Batch CLIs (`extract-signals`, `assess-signals`, …) | e.g. `extract-signals`, `assess-signals` | End of script run via `appendCostLog` |
| Chat | `http:chat` | After each `POST /api/chat` (tool loop + title + rewrite) |
| Validation explain | `http:validation-explain` | After each explain request |
| Validation agent | `http:validation-agent` | After each agent request |
| Report build turn | `http:report-build-turn` | After each turn (analyze + optional draft) |
| Report build suggest | `http:report-build-suggest` | After each suggest call |

**Daily HTTP budget:** `DAILY_BUDGET_USD` (default `10.00`). [`httpDailyBudgetPreHandler`](../../cross-cut-modules/budget/app/httpDailyBudget.js) sums **all** entries in the cost log for today (UTC date prefix on `timestamp`), including `http:*` scripts.

Batch scripts use `checkDailyBudget()` at startup with the same log.

**Retrieval embedding / rerank** (OpenAI `text-embedding-3-*`, Cohere rerank) are recorded in the same ledger via `onUsage` labels `rag:query-embed`, `rag:index-embed`, and `rag:rerank`. Pricing defaults: `EMBEDDING_USD_PER_MTOK` (default `0.02` per 1M tokens), `RERANK_USD_PER_SEARCH` (default `0.002` per rerank call). Disable RAG or unset `COHERE_API_KEY` to skip rerank cost entirely.

## Quality mode (intentionally expensive defaults)

These defaults prioritize assessment quality over cost. Tune via env when running dev/staging or cost-sensitive production.

| Feature | Default | Cost impact | Reduce spend |
|---------|---------|-------------|--------------|
| Multipass extraction | **ON** (`RESILIENCE_EXTRACT_MULTIPASS` unset) | ~3× Haiku extract calls per article batch | `RESILIENCE_EXTRACT_MULTIPASS=0` |
| Extract RAG | Follows `RAG_PIPELINE_ENABLED` | Embed + hybrid search per article per pass | `RESILIENCE_EXTRACT_RAG_ENABLED=0` |
| Second extract pass | OFF | 2× extract if enabled | Keep `RESILIENCE_SECOND_EXTRACT` unset |
| Narrative model | **Sonnet** (`RESILIENCE_NARRATIVE_MODEL` → `claude-sonnet-4-6`) | High token $ per assess | Use Haiku only in non-prod |
| Narrative facts pass | ON when grounding enabled | +1 Haiku per assess | Disable via narrative grounding flags |
| Relation judge | **Batched** per component (Haiku) | 1 call per component with claims (not per claim) | `RESILIENCE_NARRATIVE_JUDGE_BATCH=0` reverts to per-claim |
| Self-check / NLI verifier | ON | +Haiku per extract batch | `RESILIENCE_NLI_VERIFY=0` |

## Interactive agents and chat

| Control | Env | Default |
|---------|-----|---------|
| Chat tool rounds | `CHAT_MAX_TOOL_ROUNDS` | `3` (up to 4 API calls if tools every round) |
| Validation agent rounds | `VALIDATION_AGENT_MAX_TOOL_ROUNDS` | `3` |
| Chat retrieval cache TTL | `CHAT_RETRIEVAL_CACHE_TTL_MS` | `600000` (10 min) |
| Validation RAG cache TTL | `VALIDATION_RAG_CACHE_TTL_MS` | `900000` (15 min) |

**Chat retrieval cache:** One hybrid search per session/query scope can serve both the system **RETRIEVED CONTEXT** hint and the `search_sources` tool.

**Validation RAG cache:** `getItemContext` caches `buildValidationReviewContext` per `(date, scope, articleKey)`. Agent `get_validation_context` forces refresh.

## HTTP guards

Routes using `costlyRoutePreHandlers`: auth → optional App Check → daily budget.

| Route | Rate limit env (per uid/min) | Daily quota |
|-------|------------------------------|-------------|
| `POST /api/chat` | `RATE_LIMIT_CHAT_MAX` (15) | — |
| `POST .../validation/.../explain` | `RATE_LIMIT_VALIDATION_EXPLAIN_MAX` (10) | `VALIDATION_EXPLAIN_DAILY_LIMIT` (40) |
| `POST .../validation/.../agent` | `RATE_LIMIT_VALIDATION_AGENT_MAX` (8) | `VALIDATION_AGENT_DAILY_LIMIT` (20) |
| `GET .../validation/.../context` | `RATE_LIMIT_VALIDATION_CONTEXT_MAX` (30) | — |
| `GET /api/docs/search` | `RATE_LIMIT_DOCS_SEARCH_MAX` (30) | budget only |
| Report build turn/suggest | `RATE_LIMIT_REPORT_BUILD_*` | budget only |

Maintainers (`canRunAnalysisDisplay`) bypass validation LLM daily quotas.

## Related docs

- [RAG.md](./RAG.md) — retrieval flags and caches
- [LLM_CHAT.md](./LLM_CHAT.md) — chat agent and tools
- [AGENTIC_MECHANISMS.md](./AGENTIC_MECHANISMS.md) — tool loops and validation agent
