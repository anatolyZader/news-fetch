# LLM chat and agents

**Purpose:** **Report-grounded chat** and bounded **agent loops** (tool use, HITL confirm) for drill-down — not autonomous operation of the assessment pipeline.

**Sources:** `business_modules/chat/`, `cross-cut-modules/llm/runToolLoop.js`, validation agent routes.

---

## What chat is for

Operators and analysts ask questions about the **current resilience report** (narratives, evidence, changes). The model may call tools to:

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

## Tool loop (agent boundary)

**Implementation:** `cross-cut-modules/llm/runToolLoop.js` via `anthropicLlmAdapter.js`.

**Chat entry:** `streamChatResponse` → `runToolLoop` with:

- `maxRounds`: `CHAT_MAX_TOOL_ROUNDS` (default **3**)
- `agentKind: 'chat'`
- Tools from `chatToolHandlers.js` / `createChatToolContext`

**Handlers:** `business_modules/chat/app/chatToolHandlers.js` — reads `signals/`, `daily_reports/`, `source_archive`, PBO indices.

**Not agents (one-shot / batch):**

- `extract-signals.js`, `assess-signals.js` pipeline CLIs
- Single-shot narrative generation
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

**RAG:** text queries use hybrid retrieve over `archive` namespace before FTS fallback.

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
| `ANTHROPIC_API_KEY` | Required for chat |
| `CHAT_MAX_TOOL_ROUNDS` | Tool loop cap (default 3) |
| `CHAT_CONFIRM_ACTIONS_ENABLED` | HITL propose/confirm |
| `CHAT_ANALYST_TOOLS_ENABLED` | Analyst tools |
| `DAILY_BUDGET_USD` | Shared HTTP budget |
| `APP_CHECK_ENFORCE` | App Check on costly routes |

---

## Related docs

- RAG namespaces: [RAG.md](./RAG.md)
- Operator vs analyst apps: [SYSTEM-AND-OPERATOR-MODEL.md](./SYSTEM-AND-OPERATOR-MODEL.md)
- Validation review workflow: [RESILIENCE-ENGINE-REFERENCE.md §6.5](./RESILIENCE-ENGINE-REFERENCE.md#65-reports-and-validation)
- Signal catalog and OOV capture: [PIPELINE-AND-SOURCES.md § Signal catalog evolution](./PIPELINE-AND-SOURCES.md#signal-catalog-evolution-analyst-post-extract)
- Cost guards: [COST-CONTROLS.md](./COST-CONTROLS.md)
