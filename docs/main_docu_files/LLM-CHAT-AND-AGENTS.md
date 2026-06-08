# LLM chat and agents

**Purpose:** Distinguish **report-grounded chat** (operator drill-down) from the **assessment agent** (batch assess pipeline). Both use tool loops and RAG; only chat is interactive HTTP.

**Sources:** `business_modules/chat/`, `business_modules/resilience_assessment/`, `cross-cut-modules/agent/`, `cross-cut-modules/llm/runToolLoop.js`, validation agent routes.

---

## Agent roles in the product

| Agent | When | Pattern | Autonomy |
|-------|------|---------|----------|
| **Assessment agent** | `assess-signals` (default) | Planner → parallel specialists → critic → synthesizer | Batch; writes report + trace JSONL |
| **Report chat** | Operator/analyst asks about current report | Single-session tool loop (max rounds) | Read-mostly; HITL for side effects |
| **Validation investigate** | Analyst validation queue | Multi-turn tool loop | Analyst-only |
| **Report build** | Write report / WhatsApp DM | Turn-based gap engine + LLM draft | Confirm-gated archive write |

The assessment agent is **plan-and-execute map–reduce**, not peer-to-peer multi-agent chat. See [RESILIENCE-ENGINE-REFERENCE.md §3.1](./RESILIENCE-ENGINE-REFERENCE.md#31-assessment-agent-v2).

**Escape hatch:** `RESILIENCE_ASSESSMENT_AGENT=0` → legacy single-pass narratives (`claudeNarratives`), no assessment agent trace.

---

## Assessment agent (batch)

**Entry:** `produceAssessmentWithShadow.js` → `runAssessmentAgent` in `assessmentOrchestrator.js`

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

Operators and analysts ask questions about the **current resilience report** (narratives, claims, evidence, changes). The model may call tools to:

- Look up raw signals (`lookup_signals`)
- Compare report dates (`compare_dates`)
- Query PBO municipality data
- Search/fetch **source archive** originals (`search_sources`, `get_source`, `list_sources`)
- Generate audience briefs (`generate_brief`)
- Geo unknown queue (analyst tools)

Chat does **not** re-run extract/assess or mutate reports without explicit confirm-gated actions.

---

## HTTP surface

**Routes:** `business_modules/chat/input/chatRoutes.js`

| Method | Route | Daily budget |
|--------|-------|--------------|
| GET/POST/PUT/DELETE | `/api/chat/sessions*` | No |
| GET/DELETE | `/api/chat/sessions/:id/messages*` | No |
| POST | `/api/chat/confirm-action` | No (HITL) |
| POST | `/api/chat` | **Yes** (`http:chat`) |

**Streaming:** SSE events `{ type: 'text' }`, `{ type: 'action_proposed' }`, `{ type: 'done' }`, `{ type: 'error' }`.

**Sessions:** SQLite-backed (`chat_sessions`); client sends `sessionId`, not full history blob.

**Security:** `costlyRoutePreHandlers` = auth → optional App Check → daily HTTP budget ([COST-CONTROLS.md](./COST-CONTROLS.md)).

---

## Grounding

**`buildReportContext(reportData)`** (`domain/reportContext.js`):

- Report date, component summaries, executive summary, PBO index
- Footer listing available tool data (report dates on disk, signal sources)

Uses same cached report path as `GET /api/report/today` (`getCachedReport`).

**Operator tier:** report payload redacted before context build when applicable (`redactReportPayload`).

**Provider:** `infrastructure/claudeChat.js` — Anthropic Claude (`claude-haiku-4-5-20251001`), `max_tokens: 4000`.

---

## Tool loop (shared kernel)

**Implementation:** `cross-cut-modules/llm/runToolLoop.js` via `anthropicLlmAdapter.js`; assessment agent uses the same kernel with per-stage `agentKind` values (`planner`, `specialist:{componentId}`, `synthesizer`).

**Chat entry:** `streamChatResponse` → `runToolLoop` with:

- `maxRounds`: `CHAT_MAX_TOOL_ROUNDS` (default **3**)
- `agentKind: 'chat'`
- Tools from `chatToolHandlers.js` / `createChatToolContext`

**Handlers:** `business_modules/chat/app/chatToolHandlers.js` — reads `signals/`, `daily_reports/`, `source_archive`, PBO indices.

**One-shot / batch (not interactive chat):**

- `extract-signals.js`, `assess-signals.js` pipeline CLIs (assess includes multi-agent loop)
- Legacy narrative generation when agent disabled
- Docs search without tool loop

---

## HITL confirm actions

When `CHAT_CONFIRM_ACTIONS_ENABLED` (default on):

- Propose tools emit `action_proposed` SSE events
- Client calls `POST /api/chat/confirm-action` to approve/reject
- Prevents silent side effects

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

**Routes:** `business_modules/resilience/validation/input/validationReviewRoutes.js`

| Route | Role |
|-------|------|
| POST `.../explain` | Haiku explanation (budget guarded) |
| POST `.../agent` | Multi-turn investigate agent (`runToolLoop`, validation tool profile) |

Used from analyst `ValidationReviewPanel` — not operator Daily Assessment tab.

---

## Key environment variables

| Variable | Role |
|----------|------|
| `RESILIENCE_ASSESSMENT_AGENT` | `0` disables assessment agent (legacy narratives) |
| `ANTHROPIC_API_KEY` | Required for chat and agent assess |
| `CHAT_MAX_TOOL_ROUNDS` | Chat tool loop cap (default 3) |
| `CHAT_CONFIRM_ACTIONS_ENABLED` | HITL propose/confirm |
| `CHAT_ANALYST_TOOLS_ENABLED` | Analyst tools |
| `DAILY_BUDGET_USD` | Shared HTTP budget (chat); assess uses CLI budget governor |
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
