# LLM chat and agents

**Purpose:** Distinguish **report-grounded chat** (operator drill-down) from the **assessment agent** (batch assess pipeline). Both use tool loops and RAG; only chat is interactive HTTP.

**Sources:** `business_modules/chat/`, `business_modules/specialist_agents/`, `cross-cut-modules/agent/`, `cross-cut-modules/llm/`, validation agent routes, `business_modules/chat/domain/proposedActionCommands.js`.

---

## Agent roles in the product

| Agent | When | Pattern | Autonomy |
|-------|------|---------|----------|
| **Assessment agent** | `assess-signals` (default) | Planner → parallel specialists → critic → synthesizer | Batch; writes report + trace JSONL |
| **Report chat** | Operator/analyst asks about current report | Single-session tool loop (max rounds) | Read-mostly; HITL for side effects |
| **Validation investigate** | Analyst validation queue | Multi-turn tool loop | Analyst-only |
| **Report build** | Write report / WhatsApp DM | Turn-based gap engine + LLM draft | Confirm-gated archive write |

The assessment agent is **plan-and-execute map–reduce**, not peer-to-peer multi-agent chat. Planner, specialists, critic, and synthesizer are **sequential roles on one Anthropic stack** (per-stage prompts and tool profiles) — not separate human-scale services. See [RESILIENCE-ENGINE-REFERENCE.md §3.1](./RESILIENCE-ENGINE-REFERENCE.md#31-assessment-agent-v2).

**Degrade ladder:** On agent skip/failure, `produceAssessmentWithShadow.js` runs `runDeterministicAssessment` (no LLM), then `loadCachedAssessmentFallback` if scores are empty. `RESILIENCE_ASSESSMENT_FORCE_DETERMINISTIC=1` skips the agent explicitly. `RESILIENCE_ASSESSMENT_AGENT=0` is **deprecated** (same as force-deterministic; no legacy Sonnet narratives).

---

## Assessment agent (batch)

**Entry:** `produceAssessmentWithShadow.js` → `runAssessmentAgent` in `assessmentOrchestrator.js` (or deterministic degrade)

**Kernel:** `cross-cut-modules/agent/agentKernel.js` — shared tool loop, budget governor, JSONL trace.

| Stage | Agent module | Notes |
|-------|--------------|-------|
| Planner | `plannerAgent.js` | Deterministic or Haiku; investigation plan from evidence graph + epistemic profile |
| Specialists | `componentSpecialistAgent.js` | Parallel per component; tiers A/B/C; RAG + `lookup_signals` / `get_source` |
| Critic | `criticAgent.js` | Deterministic grounding / gap checks |
| Synthesizer | `synthesizerAgent.js` | Cross-component narrative (conditional Sonnet) |

**Artifacts:** `daily_reports/assessment-agent-trace-{traceId}.jsonl`; report fields `agent_trace_id`, `investigation_plan`, `cross_component_issues`.

**Eval:** `npm run agent:eval`. **Replay:** `GET /api/report/agent-trace/:traceId` (analyst).

**Not chat:** assess agent does not use `/api/chat` sessions; it runs inside the assess CLI budget (`assess-signals` script id).

---

## What chat is for

Operators and analysts ask questions about the **current resilience report** (narratives, claims, evidence, changes). The model may call tools grouped by role:

**Operator hub (priorities and briefs):**

- `list_attention_items` — ranked attention queue from current report
- `get_decision_brief` — structured decision brief for hub-mode questions
- `list_operator_recommendations` — pending operator recommendations
- `generate_brief` — audience-targeted narrative brief

**Evidence and sources:**

- `lookup_signals` — raw signal bundles by date/source
- `compare_dates` — day-over-day report diff
- `lookup_pbo` — municipality PBO dashboard lookup
- `search_sources`, `get_source`, `list_sources` — source archive hybrid search and fetch (`lookup_evidence` / `search_evidence` are aliases)

**Analyst tools** (gated by `CHAT_ANALYST_TOOLS_ENABLED` and analyst access):

- Validation: `list_validation_queue`, `get_validation_item`, `explain_validation_item`, `search_similar_articles`
- PBO review: `search_pbo_history`, `list_pbo_reviews`, `get_pbo_review`
- Calibration: `get_resilience_drift`
- Catalog: `list_catalog_proposals`, `get_catalog_gap_summary`
- Geo: `list_geo_unknown`

**HITL propose tools** (require `POST /api/chat/confirm-action`):

- `propose_validation_decision`
- `propose_geo_unknown_update`
- `propose_catalog_proposal_review`
- `propose_operator_recommendation`

Chat does **not** re-run extract/assess or mutate reports without explicit confirm-gated actions.

## PBO review surfaces

Municipal PBO completeness review is exposed through **chat tools** and **REST** (`business_modules/pbo_report_review/input/pboReviewRoutes.js`):

| Surface | Endpoints / tools |
|---------|-------------------|
| **Chat (analyst)** | `list_pbo_reviews`, `get_pbo_review`, `search_pbo_history` |
| **REST** | `GET /api/pbo/municipal-reviews`, `GET /api/pbo/municipal-reviews/:date/:municipality`, `POST /api/pbo/municipal-reviews/:date/:municipality/replies` |
| **Inbound email** | `POST /api/pbo/review/inbound-email` (Resend webhook, `RESEND_WEBHOOK_SECRET`) |
| **Historical search** | `GET /api/pbo/historical-search` (RAG-backed, when wired) |

Pipeline integration: [PIPELINE-AND-SOURCES.md § Municipal PBO review](./PIPELINE-AND-SOURCES.md#municipal-pbo-review).


---

## HTTP surface

**Routes:** `business_modules/chat/input/chatRoutes.js`

| Method | Route | Daily budget |
|--------|-------|--------------|
| GET/POST/PUT/DELETE | `/api/chat/sessions*` | No |
| GET/DELETE | `/api/chat/sessions/:id/messages*` | No |
| POST | `/api/chat/confirm-action` | No (HITL) |
| POST | `/api/chat` | **Yes** — soft gate via `createHttpChatBudgetPreHandler`; logged as `http:chat` or `http:chat:crisis` when crisis pool active |

**Chat budget:** Unlike other costly routes, `POST /api/chat` uses a **soft gate** — when daily budget is exceeded, chat may continue with deterministic tool fallback (`CHAT_DETERMINISTIC_FALLBACK`, default on) or draw from an analyst-activated **crisis chat pool** (`http:chat:crisis`). See [COST-CONTROLS.md § Crisis chat budget](./COST-CONTROLS.md#crisis-chat-budget-cb-hybrid).

**Economy override:** `POST /api/chat` body `"economy": "full"` forces full report context, disables compact tool loop, and skips tool compression for that turn only. Every `done` SSE event includes `chat_economy` metadata.

**Streaming:** SSE events `{ type: 'text' }`, `{ type: 'action_proposed' }`, `{ type: 'done' }`, `{ type: 'error' }`.

**Sessions:** SQLite-backed (`chat_sessions`); client sends `sessionId`, not full history blob.

**Security:** `costlyRoutePreHandlers` = auth → optional App Check → daily HTTP budget ([COST-CONTROLS.md](./COST-CONTROLS.md)).

---

## Grounding

**`buildReportContext(reportData)`** (`domain/reportContext.js`):

- Report date, component summaries, executive summary, PBO index
- Footer listing available tool data (report dates on disk, signal sources)

Uses same cached report path as `GET /api/report/today` — `business_modules/resilience_scorer/app/reportCacheService.js` (`getCachedReport`, scope-aware JSON paths).

**Operator tier:** report payload redacted before context build when applicable (`redactReportPayload`).

**Provider:** `business_modules/chat/app/chatLlmOrchestrator.js` — Anthropic Claude Haiku (`claude-haiku-4-5-20251001` via `HAIKU_MODEL`), `max_tokens: 4000`. (`infrastructure/claudeChat.js` is a deprecated re-export shim.)

---

## Tool loop (shared kernel)

**Kernel:** `cross-cut-modules/agent/agentKernel.js` — shared tool loop, budget governor, trace JSONL. Assessment agent and chat both use it with different profiles.

**Chat entry:** `chatService.streamChat` → `chatLlmOrchestrator.streamChatResponse` → `agentKernel.run({ profile: 'chat' })` with:

- `maxRounds`: `CHAT_MAX_TOOL_ROUNDS` (default **3**)
- Tools from `chatToolHandlers.js` / `createChatToolContext`
- Optional injected `agentKernel` from composition (shared singleton)

**Assessment agent:** same kernel with per-stage `agentKind` values (`planner`, `specialist:{componentId}`, `synthesizer`).

**Handlers:** `business_modules/chat/app/chatToolHandlers.js` — reads signal bundles, `daily_reports/`, `source_archive`, PBO indices, validation/catalog/drift services.

**One-shot / batch (not interactive chat):**

- `extract-signals.js`, `assess-signals.js` pipeline CLIs (assess includes multi-agent loop via `agentKernel`)
- Deterministic assess degrade (`runDeterministicAssessment`) when agent skipped — no LLM, no legacy narratives
- Docs search without tool loop

---

## HITL confirm actions

When `CHAT_CONFIRM_ACTIONS_ENABLED` (default on):

- Propose tools emit `action_proposed` SSE events
- Client calls `POST /api/chat/confirm-action` to approve/reject
- Prevents silent side effects

**Command registry (staging):** `business_modules/chat/domain/proposedActionCommands.js` defines `PROPOSED_ACTION_SUMMARIES` — target registry for propose tools. **Not wired yet:** `chatToolHandlers.handleProposeTool` and `executePendingAction.js` still inline validation/summaries. When adding propose tools, update the registry first, then wire handlers to import it; execution logic stays in `executePendingAction.js` (`PENDING_EXECUTORS`).

Env: `CHAT_ANALYST_TOOLS_ENABLED` gates analyst read tools.

---

## Source archive

**Store:** SQLite `source_archive` (`db/persistence/sourceArchiveStore.js`).

**Stable IDs:** `md:{path}#{index}`, `archive:{type}:{hash}`, legacy `db:evidence_items:{id}`.

**Filesystem fallbacks:** `db/source_archive/filesystemFallbacks.js` when SQLite rows purged.

**RAG:** text queries use hybrid retrieve over `archive` namespace — shared by chat and assess specialists.

**Purge:** `npm run archive:purge` — time-limited types only; field/PBO/whatsapp etc. retained per store policy.

---

## Validation investigate agent

**Routes:** `business_modules/resilience_scorer/validation/input/validationReviewRoutes.js`

| Route | Role |
|-------|------|
| POST `.../explain` | Haiku explanation (budget guarded) |
| POST `.../agent` | Multi-turn investigate agent (`runToolLoop`, validation tool profile) |

Used from analyst `ValidationReviewPanel` — not operator Daily Assessment tab.

---


---

## Observability

| Signal | Location | Mechanism |
|--------|----------|-----------|
| Chat retrieval hint | `chatService.js` | `tracePort.startActiveSpan('chat.retrieval_hint', …)` |
| Chat LLM stream | `chatService.js` | `tracePort.startActiveSpan('chat.llm_stream', …)` |
| LLM calls | `anthropicLlmAdapter.js` | `withSpan('llm.createMessage' / 'llm.runToolLoop')` when `OTEL_ENABLED=true` |
| Chat economy | `chatService.js` + `httpCostRecorder` | `stage: 'chat_economy'` → `cost-log.jsonl` |
| LLM invocations | `llmGateway` | `llm-invocations.jsonl` — see [COST-CONTROLS.md](./COST-CONTROLS.md) |
| Agent tool rounds | `agentKernel.js` | Trace JSONL `tool_round` events (assess + chat) |

**Retrieval cache:** `createChatRetrievalCache` deduplicates `buildChatRetrievalHint` + `search_sources` per session (`CHAT_RETRIEVAL_CACHE_TTL_MS`). **Prompt cache / compact loop:** `CHAT_PROMPT_CACHE`, `CHAT_COMPACT_TOOL_LOOP` — see [COST-CONTROLS.md](./COST-CONTROLS.md).

**Module boundaries:** chat HTTP entry is `input/chatRoutes.js`; cross-module imports use `business_modules/chat/index.js` facade only — see [README § Module boundaries](./README.md#module-boundaries-option-b).

## Key environment variables

| Variable | Role |
|----------|------|
| `RESILIENCE_ASSESSMENT_FORCE_DETERMINISTIC` | `1` skips agent LLM (deterministic degrade) |
| `RESILIENCE_ASSESSMENT_AGENT` | `0` **deprecated** — forces deterministic degrade (no legacy narratives) |
| `ANTHROPIC_API_KEY` | Required for chat and agent assess |
| `CHAT_MAX_TOOL_ROUNDS` | Chat tool loop cap (default 3) |
| `CHAT_CONFIRM_ACTIONS_ENABLED` | HITL propose/confirm |
| `CHAT_ANALYST_TOOLS_ENABLED` | Analyst tools |
| `CHAT_DETERMINISTIC_FALLBACK` | Non-LLM tool fallback when both daily and crisis chat pools exhausted (default on) |
| `CRISIS_BUDGET_ENABLED` | Crisis chat pool master switch — see [COST-CONTROLS.md](./COST-CONTROLS.md) |
| `DAILY_BUDGET_USD` | Shared HTTP budget (chat); assess uses CLI budget governor |
| `CHAT_CONTEXT_TIERING` | Rule-based slim system context per message (default on) |
| `APP_CHECK_ENFORCE` | App Check on costly routes |

Assessment agent Tier 1/2 flags: [MODEL-CARD.md](../MODEL-CARD.md).

---

## Related docs

- RAG at assess: [RAG.md](./RAG.md)
- Operator vs analyst apps: [SYSTEM-AND-OPERATOR-MODEL.md](./SYSTEM-AND-OPERATOR-MODEL.md)
- Assessment agent stages: [RESILIENCE-ENGINE-REFERENCE.md §7.5](./RESILIENCE-ENGINE-REFERENCE.md#75-assessment-agent-default)
- Validation review workflow: [RESILIENCE-ENGINE-REFERENCE.md §7.6](./RESILIENCE-ENGINE-REFERENCE.md#76-reports-and-validation)
- Signal catalog and OOV capture: [PIPELINE-AND-SOURCES.md § Signal catalog evolution](./PIPELINE-AND-SOURCES.md#signal-catalog-evolution-analyst-post-extract)
- Cost guards: [COST-CONTROLS.md](./COST-CONTROLS.md)
