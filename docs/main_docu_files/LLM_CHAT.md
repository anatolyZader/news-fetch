# LLM Chat (srulik.ai) — Current Implementation

**Location:** `docs/main_docu_files/` (canonical main documentation — see [README](./README.md))

This document describes the **LLM-based chat functionality as implemented now**: the UI/UX, backend API route, streaming protocol, prompt grounding, tool use, auth behavior, and where the data comes from.

For **agent architecture** (shared tool loop, HITL confirm flows, validation investigate agent, tool profiles, observability, and what is *not* an agent), see **[AGENTIC_MECHANISMS.md](./AGENTIC_MECHANISMS.md)**.

### What this chat is for

The chat is designed to answer questions **about the current resilience report** shown on the main page (scores, narratives, evidence, changes over time), and to let the model “drill down” via tool calls into:

- **PBO municipality details** (per-component scores + observer notes)
- **Raw behavioral signals** (search by component/source/date/municipality/keyword)
- **Compare two report dates** (per-component deltas + narrative shifts)
- **Generate a formatted brief** for a target audience
- **Original sources** (full text via `list_sources` / `search_sources` → `get_source` on the `source_archive`, with filesystem fallbacks when SQLite rows are purged)

### Source archive (originals only)

- **Store**: SQLite `source_archive` via [`cross-cut-modules/persistence/sourceArchiveStore.js`](../../cross-cut-modules/persistence/sourceArchiveStore.js) and [`createSourceArchive`](../../cross-cut-modules/source_archive/createSourceArchive.js).
- **Contents**: Full original text from all ingest paths: news, radio, field, whatsapp, video, evidence API, **social OSINT**, **PBO municipal/regional**, **Naftali**, **connectivity probes**. **Not** extracted signal JSON rows (use `lookup_signals`; signals may include `source_id` for one-hop `get_source`).
- **Stable IDs**: `md:{relativePath}#{articleIndex}` or `archive:{source_type}:{hash}`; legacy `db:evidence_items:{id}` still accepted by `get_source`.
- **Filesystem fallbacks**: When ephemeral SQLite rows are purged, chat still finds news/radio/field/whatsapp/social via on-disk exports ([`filesystemFallbacks.js`](../../cross-cut-modules/source_archive/filesystemFallbacks.js)).
- **Retention (SQLite only)**: `npm run archive:purge` removes **only** `news`, `radio`, `social` older than 14 days. **Permanent in SQLite**: field, pbo, naftali, probe, whatsapp, manual, video, etc. **Filesystem**: never deleted by purge.
- **Chat tools**: `list_sources` (browse by date/type), `search_sources` (text/url/title/range), `get_source`. Legacy `search_evidence` / `lookup_evidence` aliases kept one release.
- **Report scope**: Client sends `reportGeoScope` (`national` | `north`) so chat anchors the same report as the UI toggle. Component focus still uses `scope` body field.
- **Production RAG** ([`cross-cut-modules/retrieval/`](../../cross-cut-modules/retrieval/)): ingest-time chunk index (`rag_chunks` + FTS5), hybrid dense+lexical retrieval (RRF), Cohere rerank, Haiku session query rewrite. Injected into system context before tools; `search_sources` uses the same index when a text query is present. See **[RAG.md](./RAG.md)** for the full platform reference (all namespaces, tiers, config, and ops).
- **Indexing**: Automatic on every `source_archive` upsert; backfill/reindex via `npm run archive:backfill` (default `--reindex-rag`) or `npm run rag:reindex -- --days 14`.
- **Env**: `RAG_PIPELINE_ENABLED` (default on), `CHAT_RAG_ENABLED`, `CHAT_ARCHIVE_RAG_ENABLED`, `OPENAI_API_KEY` (embeddings), `COHERE_API_KEY` (rerank; without it, RRF order is used), `ANTHROPIC_API_KEY` (query rewrite), `RAG_RETRIEVAL_DAYS`, `RAG_FINAL_TOPK`, `RAG_COHERE_RERANK_MODEL`.
- **Eval**: `npm run rag:eval` (fixture queries in `tests/fixtures/rag-golden.he.json`).
- **Backfill**: `npm run archive:backfill -- --days 14` (evidence, news, field, whatsapp, radio, social, probes). Pass `--no-reindex-rag` to skip chunk indexing.

### Tier 2 — Resilience pipeline RAG (extract / assess / narratives)

Same `rag_chunks` index as chat; wired in `extract-signals.js` and `assess-signals.js` via [`pipelineRetrieval.js`](../../cross-cut-modules/retrieval/pipelineRetrieval.js) and [`storyClusterIndex.js`](../../cross-cut-modules/retrieval/storyClusterIndex.js).

| Stage | Behavior |
|-------|----------|
| **Extract** | After archive upsert + RAG index, `selectArticlePromptSpans` pulls top chunks per `source_id` (domain A/B/C query + rolling window). Falls back to keyword / inline semantic paragraphs. |
| **Dedup** | `crossSourceDedupClustered` assigns `story_cluster_id` from `rag_story_clusters` (no pairwise O(n²) at assess when enabled). |
| **Narratives** | Per-component archive spans into Haiku facts pass + Sonnet system prompt (`buildNarrativeRetrievalContext`). |

**Pipeline env** (default: follow `RAG_PIPELINE_ENABLED` / embeddings): `RESILIENCE_EXTRACT_RAG_ENABLED`, `RESILIENCE_EXTRACT_RAG_DAYS`, `RESILIENCE_EXTRACT_SPANS_PER_ARTICLE`, `RESILIENCE_PIPELINE_RERANK` (default `0` — RRF only on pipeline paths), `RESILIENCE_DEDUP_CLUSTER_ENABLED`, `RESILIENCE_DEDUP_CLUSTER_THRESHOLD`, `RESILIENCE_NARRATIVE_RAG_ENABLED`, `RESILIENCE_NARRATIVE_RAG_TOPK`.

### Tier 3 — Analyst workflow RAG

Shared helpers in [`analystRetrieval.js`](../../cross-cut-modules/retrieval/analystRetrieval.js). Reuses `rag_chunks` with optional `sourceTypes` / `scopeId` filters on hybrid retrieval.

| Workflow | Behavior |
|----------|----------|
| **Validation review** | `GET /api/validation/review-queue/:date/:scope/:articleKey/context` returns similar archive articles, story cluster, prior analyst decisions, OOV neighbors, and indexed article chunks. `POST …/explain` (Haiku) answers from chunks + reasons only. Analyst UI: `ValidationReviewPanel` on the analyst site (`showValidationReview`). |
| **Catalog gap report** | `namespace=catalog` index from [`catalogIndexWriter.js`](../../cross-cut-modules/retrieval/catalogIndexWriter.js); `npm run rag:reindex-catalog`. Gap clusters get `nearest_catalog` + `counterexamples` in `catalog-learning:gap-report`. |
| **PBO historical search** | Municipal (`extract-pbo-signals.js`) and regional MD (`extract-regional-pbo-signals.js`) rows indexed as `pbo` / `pbo_regional`. `GET /api/pbo/historical-search?query=…&district=&municipality=&region=&days=30`. CLI: `node business_modules/pbo_report_review/input/runMunicipalPboReview.js --query "…"`. |

**Analyst env** (default: follow `RAG_PIPELINE_ENABLED`): `VALIDATION_REVIEW_RAG_ENABLED`, `VALIDATION_EXPLAIN_ENABLED`, `CATALOG_LEARNING_RAG_ENABLED`, `CATALOG_RAG_TOPK` (default 5), `PBO_REVIEW_RAG_ENABLED`, `PBO_RAG_RETENTION_DAYS` (default 30).

**Rollout:** `npm run archive:backfill` + `npm run rag:reindex` + `npm run rag:reindex-catalog`; enable validation/catalog/PBO flags on staging before production.

### Tier 4 — Field channels & ops RAG

Helpers in [`fieldRetrieval.js`](../../cross-cut-modules/retrieval/fieldRetrieval.js). Injected into Haiku prompts as **reference-only** blocks (no new facts in structured state or dialogue).

| Channel | Behavior |
|---------|----------|
| **Report build / WhatsApp** | Before draft: similar approved `field` / `whatsapp` / `manual` archive reports; `field_examples` taxonomy; controlled `hfc` guidelines (`docs/corpora/hfc-field-guidelines.md`). Analyzer gets taxonomy + HFC only while collecting. |
| **Audio contextualizer** | Prior `radio` scenes for same station/program; optional locality hint in scene-segmentation user message. |
| **Social classify** | Few-shot from `social_examples` index (recent `signals-social-*.json` keep/reject rows). |

**Field env** (default: follow `RAG_PIPELINE_ENABLED`): `REPORT_BUILD_RAG_ENABLED`, `REPORT_BUILD_RAG_DAYS` (30), `REPORT_BUILD_RAG_TOPK` (4), `AUDIO_CONTEXTUALIZER_RAG_ENABLED`, `AUDIO_SCENE_RAG_TOPK` (5), `SOCIAL_CLASSIFY_RAG_ENABLED`, `SOCIAL_CLASSIFY_RAG_TOPK` (6).

**Reindex:** `npm run rag:reindex-field-examples`, `rag:reindex-hfc`, `rag:reindex-social-examples` (after `rag:reindex` + field archive backfill). Optional `SOCIAL_EXAMPLES_AUTO_REINDEX=1` on gather-daily.

**Archive:** `visitsInput` indexes field rows; WhatsApp submit uses `source_label: field_whatsapp`; web report-build confirm archives as `field` / `report_build-web`.

### Tier 5 — Product & documentation RAG

Operator help in the in-app **Docs** panel uses a separate `docs` namespace so product documentation does not compete with news/archive chunks in chat defaults.

| Surface | Behavior |
|---------|----------|
| **Docs panel** | Debounced `GET /api/docs/search?query=…` hybrid search; “Suggested topics” above the sidebar filter. Client-side index filter remains as fallback when RAG is off or returns no hits. |
| **Indexing** | [`docsIndexWriter.js`](../../cross-cut-modules/retrieval/docsIndexWriter.js) walks `docs/product_docs/` (skips `api/generated/**`); `namespace=docs`, `parent_id=docs:{slug}`, static date `2099-01-01`. |
| **Retrieval port** | [`IRetrievalPort.js`](../../cross-cut-modules/retrieval/domain/ports/IRetrievalPort.js) + [`retrievalPortAdapter.js`](../../cross-cut-modules/retrieval/infrastructure/retrievalPortAdapter.js) — thin facade over existing `hybridRetrieve` / `indexArchiveRow`; `createRetrievalService` exposes `.port` for new callers. |

**Env** (default: follow `RAG_PIPELINE_ENABLED`): `DOCS_RAG_ENABLED`, `DOCS_RAG_TOPK` (6), `DOCS_RAG_VERSION` (corpus `scopeId` on chunks).

**Ops:** `npm run rag:reindex-docs` after `docs:sync` on deploy. Eval suite: `node business_modules/source_archive/input/ragEval.js` (archive + docs + north fixtures; fallback fixture documented as SKIP).

**Optional translation glossary:** `config/resilience-translation-glossary.json`, `npm run rag:reindex-terms`, `TRANSLATION_TERM_RAG_ENABLED=1` prepends top-3 term hits to translation system prompts (default off).

**Principles:** Report JSON and scoring outputs remain authoritative; RAG returns top-k snippets only — no multi-day originals dump, no parallel retrieval stack.

### High-level request flow

- **UI**: `client/src/components/ChatPanel.jsx`
  - Renders a chat panel with input + send/stop button.
  - Displays prior `history` and the streaming assistant `draft`.
- **Client hook**: `client/src/hooks/useChat.js`
  - Appends the user’s message to local history.
  - `POST`s to `POST /api/chat` and parses a streaming SSE-like response.
- **Server route**: [`api/routes/chatRoutes.js`](../../api/routes/chatRoutes.js) (registered from `app.js`)
  - Session APIs + `POST /api/chat` (JWT when `AUTH_REQUIRED=true`).
  - Responds as a `text/event-stream` and calls the chat module to stream events.
- **Chat module**: `business_modules/chat/app/chatService.js`
  - Builds report-grounded context.
  - Calls Anthropic (Claude) and streams back partial text events.
- **LLM provider + tools**: `business_modules/chat/infrastructure/claudeChat.js`
  - Uses `@anthropic-ai/sdk` and a tool-use loop.
  - Implements the tool handlers (PBO lookup, signal search, report compare, brief generation).

### UI behavior and UX

#### Rendering and gating

- The chat strings are localized via `client/src/i18n/translations.js` under:
  - `chat.header`, `chat.placeholder`, `chat.input`, `chat.send`
- The chat panel itself is implemented in `client/src/components/ChatPanel.jsx`.
- The app typically shows chat only when a “today report” exists (see [ai-chat-main-page-review.md](../ai-chat-main-page-review.md) for the wiring overview and review notes).

#### Local state model

`useChat()` maintains:

- **history**: array of `{ role, content, error? }` where role is typically `user` or `assistant`
- **streaming**: boolean (true while a response is streaming)
- **draft**: the assistant message being streamed (concatenated token chunks)
- **stop()**: aborts the in-flight request via `AbortController`

File: `client/src/hooks/useChat.js`

### API: `POST /api/chat`

#### Request

- **Method**: `POST`
- **Path**: `/api/chat`
- **Body** (JSON):

```json
{
  "message": "string",
  "history": [{ "role": "user|assistant", "content": "string" }]
}
```

Notes:

- The **client sends the full local `history`** on every request.
- The server further caps the incoming history (see “History cap” below).

#### Authentication

`POST /api/chat` is protected only when auth is enabled:

- **Auth toggle**: `AUTH_REQUIRED=true`
- **Auth verification**: Firebase/Identity Platform via:
  - `auth/requireAuthPreHandler.js`
  - `auth/firebaseAdmin.js`
- **Client token**: `useChat()` attaches `Authorization: Bearer <idToken>` if available from `useAuth()`.

When auth is required and a request lacks a valid token, the server returns:

- `401` with JSON `{ error: 'Unauthorized', code: 'missing_token'|'invalid_token' }`

#### Response: streaming events (SSE-like)

The server uses an SSE-like framing:

- Headers:
  - `Content-Type: text/event-stream`
  - `Cache-Control: no-cache`
  - `Connection: keep-alive`
- Each event is written as a single line:
  - `data: <json>\n\n`

The client parses the response stream line-by-line and expects event objects like:

- **Text chunk**:

```json
{ "type": "text", "text": "..." }
```

- **Terminal completion**:

```json
{ "type": "done" }
```

- **Terminal error**:

```json
{ "type": "error", "message": "..." }
```

Backend implementation:

- Route: `app.js` (`POST /api/chat`)
- Streaming orchestration: `business_modules/chat/app/chatService.js` (`streamChat`)

Client implementation:

- Streaming + parsing: `client/src/hooks/useChat.js`

### Server-side orchestration (`streamChat`)

File: `business_modules/chat/app/chatService.js`

Key behavior:

- **Report context**:
  - Pulls report data via the injected `getReportData` callback (currently passed as `getCachedReport` from `api/analysisService.js`).
  - Builds a large system-context string using `buildReportContext(reportData)`.
- **History cap**:
  - `MAX_HISTORY_MESSAGES = 20`
  - Only the last 20 history messages are kept to reduce context growth.
- **Message payload passed to the LLM**:
  - `trimmedHistory` (mapped to `{ role, content }`)
  - plus the newest `{ role: 'user', content: message }`
- **Streaming semantics**:
  - Emits `{ type: 'text', text: ... }` as Claude returns text blocks.
  - On success emits `{ type: 'done' }`.
  - On errors emits `{ type: 'error', message }`.

### Prompt grounding (`buildReportContext`)

File: `business_modules/chat/domain/reportContext.js`

The system context contains:

- Report date and overall score
- Per-component scores + confidence labels
- Executive summary and component narratives
- A PBO index section (derived from signals)
- A footer listing which data is available to tools:
  - Report dates present on disk (for `compare_dates`)
  - Signal source types and dates present on disk (for `lookup_signals`)

Important: the report context is only as good as the `reportData` passed into `buildReportContext()`.

#### Where the report data comes from (and a current mismatch to be aware of)

The server uses `getCachedReport()` from `api/analysisService.js` in two different ways:

- `GET /api/report/today` calls `getCachedReport(evidenceStore)` (DB-aware fallback).
- Chat now calls `getCachedReport(evidenceStore)` so DB-backed reports work when JSON is missing on disk.

Effect:

- `getCachedReport()` is **filesystem-first** (reads `reports/resilience-report-*.json` and sibling `.md`).
- Without `evidenceStore`, it will **not** fall back to SQLite when there is no report JSON on disk.

So it is possible for the UI to show a report (DB-backed) while chat builds context from disk only (or shows “No resilience report is available…”).

Reference:

- `api/analysisService.js` (`getCachedReport(store)`)
- `app.js`:
  - `GET /api/report/today` passes the store
  - `POST /api/chat` does not

### LLM provider: Anthropic (Claude)

File: `business_modules/chat/infrastructure/claudeChat.js`

- **SDK**: `@anthropic-ai/sdk`
- **Chat model**: `claude-haiku-4-5-20251001`
- **Chat max tokens**: `max_tokens: 4000`
- **Brief generation** (tool): separate non-streamed call:
  - Model: `claude-haiku-4-5-20251001`
  - `max_tokens: 3000`

The system prompt template (`SYSTEM_TEMPLATE`) instructs the model to:

- Act as an expert in Israeli community resilience (Home Front Command framework)
- Use tools for evidence and comparisons
- Match the user’s language (Hebrew/English/etc.)

### Tool use loop (server-side)

The server implements Claude tool use as an **iterative loop**:

- File: `business_modules/chat/infrastructure/claudeChat.js`
- Constant: `MAX_TOOL_ROUNDS = 5`

Flow:

1. Send `messages.create()` with `tools: [...]`.
2. Stream (server-side) the returned `text` blocks to the client as `{ type: 'text' }`.
3. If Claude returned one or more `tool_use` blocks, run each tool and append `tool_result` blocks.
4. Repeat until:
   - no tool calls are returned, or
   - `stop_reason === 'end_turn'`, or
   - the round limit is reached.

### Implemented tools

Tool schemas live in `business_modules/chat/domain/tools/chatToolSchemas.js`; handlers in `business_modules/chat/app/chatToolHandlers.js`.

#### Analyst-only read tools (require `canViewAnalystDisplay`)

When `CHAT_ANALYST_TOOLS_ENABLED` is on and the user is an analyst: `search_pbo_history`, `list_pbo_reviews`, `get_pbo_review`, `get_resilience_drift`, `list_validation_queue`, `get_validation_item`, `explain_validation_item`, `list_geo_unknown`, `list_catalog_proposals`, `get_catalog_gap_summary`.

#### Tool profiles (`toolProfile` on `POST /api/chat`)

Optional body field `toolProfile` restricts which tools are exposed:

| Profile | Tools |
|---------|--------|
| `default` | Full core + analyst + propose set |
| `validation` | `list_validation_queue`, `get_validation_item`, `explain_validation_item`, `lookup_signals`, `search_sources`, `get_source`, `propose_validation_decision` |
| `sources` | `list_sources`, `search_sources`, `get_source` |

Shared agent loop: `cross-cut-modules/llm/runToolLoop.js` (chat + validation `/agent` route). Tool rounds are logged to audit as `agent.tool_round`.

#### Confirm-gated propose tools (analyst only)

Mutations use `propose_*` tools; the server stores a pending action and emits SSE `{ type: 'action_proposed', actionId, toolName, summary, expiresAt }`. The user confirms via `POST /api/chat/confirm-action` with `{ sessionId, actionId, confirmed: true|false }`. Tools: `propose_validation_decision`, `propose_geo_unknown_update`, `propose_catalog_proposal_review`. Disabled when `CHAT_CONFIRM_ACTIONS_ENABLED=0`.

Chat report context uses `resolveDisplayView` (same as `/api/report/today`) so analysts receive full scores in `compare_dates` / briefs.

#### `lookup_pbo`

- **Purpose**: Return detailed PBO data for a municipality.
- **Input**:

```json
{ "municipality": "string" }
```

- **Lookup strategy**:
  - Exact match on municipality name in the PBO lookup index.
  - Fallback “fuzzy-ish” match using substring inclusion on keys.

#### `lookup_signals`

- **Purpose**: Search raw behavioral signals for evidence and citations.
- **Input** (all optional except max defaults apply):

```json
{
  "query": "string",
  "component": "narrative|information_communication|lifesaving_behavior|functional_continuity|community_capital|leadership|belonging_solidarity|wellbeing_at_risk",
  "source_type": "news|radio|field|pbo|naftali|whatsapp",
  "municipality": "string",
  "date": "YYYY-MM-DD",
  "limit": 10
}
```

Backend behavior:

- Signals are loaded from JSON files on disk under `signals/` via:
  - `business_modules/chat/domain/signalLookup.js`
- Result formatting is a short numbered list with evidence snippets and URLs (when present).
- Each result includes a stable `id=...` so the chat can cite a specific signal.
- Limit is capped to **max 25**.

#### `compare_dates`

- **Purpose**: Compare two report dates and return a formatted delta summary.
- **Input**:

```json
{ "date_a": "YYYY-MM-DD", "date_b": "YYYY-MM-DD" }
```

Backend behavior:

- Reads report JSON files from `reports/`.
- Produces:
  - Overall score delta
  - Total articles delta
  - Per-component score deltas
  - A small “key narrative changes” section

Implementation: `business_modules/chat/domain/signalLookup.js` (`compareReports`)

#### `generate_brief`

- **Purpose**: Generate a structured brief for an audience and scope.
- **Input**:

```json
{
  "scope": "overall|municipality",
  "municipality": "string",
  "audience": "commander|analyst|public",
  "language": "he|en"
}
```

Backend behavior:

- Builds a `briefContext` from the cached report data:
  - overall score
  - executive summary excerpt
  - component excerpts
- If `scope === 'municipality'` it additionally appends:
  - PBO data for that municipality
  - recent signals mentioning that municipality
- Calls Claude once (non-streamed) and returns the resulting text as the tool output.

#### `search_sources` / `get_source`

Unified access to the **source archive** (and homefront MD fallback when a row is missing). Use `search_sources` to find `source_id`, then `get_source` for full text. See [`sourceArchiveQuery.js`](../../business_modules/chat/domain/sourceArchiveQuery.js).

#### `lookup_evidence` (deprecated — use `get_source`)

- **Purpose**: Retrieve full stored evidence/article text *on demand* (not included in the main prompt).
- **Input**:

```json
{
  "date": "YYYY-MM-DD",
  "evidence_id": "string",
  "query": "string",
  "url": "string",
  "title": "string",
  "source_type": "news|radio|field|pbo|naftali|whatsapp|audio|manual",
  "limit": 3,
  "max_chars": 8000
}
```

Notes:

- `date` is optional in practice: when omitted, the server defaults it to the **current assessment date**.

Backend behavior:

- Searches **SQLite evidence items** for the given `date` (when available).
- Also searches the **homefront markdown export** for that date (`articles-homefront-YYYY-MM-DD.md` preferred, falling back to `articles-homefront.md`) without the analysis-time truncation.
- Returns up to `limit` matches, each including metadata plus a body clipped to `max_chars`.

Implementation:

- Tool handler: `business_modules/chat/infrastructure/claudeChat.js`
- Lookup logic: `business_modules/chat/domain/evidenceLookup.js`

#### `search_evidence` (deprecated — use `search_sources`)

- **Purpose**: Find the right evidence source before pulling full text. Returns candidates with `evidence_id`.
- **Input**:

```json
{
  "date": "YYYY-MM-DD",
  "query": "string",
  "url": "string",
  "title": "string",
  "source_type": "news|radio|field|pbo|naftali|whatsapp|audio|manual",
  "limit": 7,
  "snippet_chars": 350
}
```

Notes:

- `date` is optional in practice: when omitted, the server defaults it to the **current assessment date**.

Backend behavior:

- Searches DB evidence first (so results have stable DB-backed `evidence_id`).
- Falls back to homefront markdown export for that date if needed.
- Intended usage is: `search_evidence` → choose `evidence_id` → `lookup_evidence` to retrieve full text.

Implementation:

- Tool handler: `business_modules/chat/infrastructure/claudeChat.js`
- Lookup logic: `business_modules/chat/domain/evidenceLookup.js`

### Data dependencies (on-disk sources used by chat tools)

The chat module reads data from the repo filesystem:

- **Signals** directory: `signals/`
  - Files: `signals-<sourceType>-<YYYY-MM-DD>.json`
  - Loaded by: `business_modules/chat/domain/signalLookup.js` (`loadSignals`)
- **Reports** directory: `reports/`
  - Files: `resilience-report-<YYYY-MM-DD>.json` or `resilience-report-<YYYY-MM-DD>-<HHMM>.json`
  - Loaded by: `business_modules/chat/domain/signalLookup.js` (`loadReport`, `listReportDates`, `compareReports`)
- **PBO index**:
  - Derived from report signals in `business_modules/chat/domain/reportContext.js` via `buildPboIndex(...)` (see `business_modules/chat/domain/pboIndex.js`).

### Environment variables used by chat

Backend:

- **`ANTHROPIC_API_KEY`**: required for chat to function (used by `@anthropic-ai/sdk`).
- **`AUTH_REQUIRED`**: when `true`, protects `/api/*` routes (including `/api/chat`) with JWT verification.
- **`FIREBASE_PROJECT_ID`**: required when `AUTH_REQUIRED=true` to initialize Firebase Admin for token verification.

Other runtime vars that influence what chat can see:

- **`TZ_ARTICLES`**: affects what “today” means for report selection (used by `getCachedReport()`).
- **`SQLITE_PATH`**: affects DB location (but chat currently does not pass the store to `getCachedReport()`).

### Failure modes and current semantics

#### Backend error path

`streamChat()` catches errors and emits:

- `{ type: 'error', message: err.message }`

The route then ends the response (see `app.js`).

#### Client error handling

`useChat()` currently:

- Treats non-2xx responses as a terminal error and appends the response body text as an assistant error message.
- Treats `{ type: 'error' }` events as terminal and appends an assistant error message.
- Treats stream end without `{ type: 'done' }` as “finalize with accumulated text” if any.

### Key source files (quick links)

- **UI**: `client/src/components/ChatPanel.jsx`
- **Client streaming hook**: `client/src/hooks/useChat.js`
- **Route**: `app.js` (`POST /api/chat`)
- **Chat service orchestration**: `business_modules/chat/app/chatService.js`
- **LLM + tools implementation**: `business_modules/chat/infrastructure/claudeChat.js`
- **Prompt context**: `business_modules/chat/domain/reportContext.js`
- **Signals/reports utilities**: `business_modules/chat/domain/signalLookup.js`
- **Auth**: `auth/requireAuthPreHandler.js`, `auth/firebaseAdmin.js`
- **Report cache source**: `api/analysisService.js` (`getCachedReport`)

