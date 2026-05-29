## LLM Chat (srulik.ai) — Current Implementation

This document describes the **LLM-based chat functionality as implemented now**: the UI/UX, backend API route, streaming protocol, prompt grounding, tool use, auth behavior, and where the data comes from.

### What this chat is for

The chat is designed to answer questions **about the current resilience report** shown on the main page (scores, narratives, evidence, changes over time), and to let the model “drill down” via tool calls into:

- **PBO municipality details** (per-component scores + observer notes)
- **Raw behavioral signals** (search by component/source/date/municipality/keyword)
- **Compare two report dates** (per-component deltas + narrative shifts)
- **Generate a formatted brief** for a target audience
- **Original sources** (full article/transcript text via `search_sources` → `get_source` on the `source_archive`)

### Source archive (originals only)

- **Store**: SQLite `source_archive` via [`cross-cut-modules/persistence/sourceArchiveStore.js`](../cross-cut-modules/persistence/sourceArchiveStore.js) and [`createSourceArchive`](../cross-cut-modules/source_archive/createSourceArchive.js).
- **Contents**: Full original text from ingest (news homefront export, radio/field/whatsapp MD, evidence API uploads, YouTube scenes). **Not** extracted signal JSON rows (those remain in `signals/` + report JSON; use `lookup_signals`).
- **Stable IDs**: `md:{relativePath}#{articleIndex}` or `archive:{source_type}:{hash}`; legacy `db:evidence_items:{id}` still accepted by `get_source`.
- **Retention (SQLite only)**: `npm run archive:purge` removes **only** `source_type` in `news`, `radio`, `social` with `date` older than 14 days (`SOURCE_ARCHIVE_RETENTION_DAYS`). **Permanent in SQLite**: field, visits, whatsapp, manual, audio, video, etc. **Filesystem**: all extracted `.md` exports are kept forever; purge never deletes files on disk. Old news remains reachable via homefront MD fallback in chat search. Backfill: `npm run archive:backfill`.
- **Chat tools**: `search_sources`, `get_source` (replaces `search_evidence` / `lookup_evidence`). Aliases kept in the tool handler for one release.

### High-level request flow

- **UI**: `client/src/components/ChatPanel.jsx`
  - Renders a chat panel with input + send/stop button.
  - Displays prior `history` and the streaming assistant `draft`.
- **Client hook**: `client/src/hooks/useChat.js`
  - Appends the user’s message to local history.
  - `POST`s to `POST /api/chat` and parses a streaming SSE-like response.
- **Server route**: [`api/routes/chatRoutes.js`](../api/routes/chatRoutes.js) (registered from `app.js`)
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
- The app typically shows chat only when a “today report” exists (see `docs/ai-chat-main-page-review.md` for the wiring overview and review notes).

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

All tools are defined in `business_modules/chat/infrastructure/claudeChat.js`.

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

Unified access to the **source archive** (and homefront MD fallback when a row is missing). Use `search_sources` to find `source_id`, then `get_source` for full text. See [`sourceArchiveQuery.js`](../business_modules/chat/domain/sourceArchiveQuery.js).

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

