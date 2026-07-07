## AI-Backed Chat on Main Page — Implementation Review

Date: 2026-03-25

### What this review covers

This review focuses on the current end-to-end implementation of the AI-backed chat UI on the main page, including:

- UI state management and user experience (`client/src/components/ChatPanel.jsx`, `client/src/hooks/useChat.js`)
- Backend SSE streaming route and error semantics (`app.js`, `api/chatService.js`)
- Prompt/context construction and report grounding (`business_modules/chat/app/chatService.js`, `business_modules/resilience_scorer/app/reportCacheService.js`)
- Security posture around authenticated access and content handling (`auth/requireAuthPreHandler.js`)
- Reliability concerns (stream termination, failure modes, and resiliency)

### Main page chat wiring (overview)

The main page renders the chat panel only when a “today report” is present:

- Main tab `report` renders `ReportView` and then `ChatPanel` only if `report` exists (`client/src/MainApp.jsx`).

The chat panel uses a hook to manage local chat state and to stream responses from the server:

- `client/src/components/ChatPanel.jsx` collects the user’s prompt and calls `send(...)`.
- `client/src/hooks/useChat.js`:
  - appends the user message to `history`
  - POSTs to `POST /api/chat`
  - reads the response body as a streaming `ReadableStream`
  - parses server-sent events (SSE-like `data: <json>\n\n`) and updates:
    - `draft` while streaming
    - `history` when the server sends a terminal `{ type: 'done' }`

Server-side streaming is implemented as:

- `app.js` defines `POST /api/chat` and sets:
  - `Content-Type: text/event-stream`
  - `Cache-Control: no-cache`
  - `Connection: keep-alive`
- It then calls `streamChat(message, history, reply.raw)` and ends the raw response.

LLM streaming is implemented in:

- `api/chatService.js` uses the Anthropic SDK to stream tokens from `claude-haiku-4-5-20251001`
- It writes events back to the client via `rawReply.write('data: ...\n\n')`.

### Prompt and context grounding

`streamChat()` constructs the model messages by concatenating:

- client-provided `history` (role/content only)
- the current user message

It also builds a `system` instruction that includes report context:

- The system string contains `CONTEXT:` from `buildReportContext(reportData)`.
- The report data is retrieved with `getCachedReport()` from `business_modules/resilience_scorer/app/reportCacheService.js`.

Important behavior:

- `getCachedReport()` (in `business_modules/resilience_scorer/app/reportCacheService.js`) prefers filesystem JSON reports under `business_modules/resilience_scorer/data/reports/`.
- It only consults the DB store when `getCachedReport(store)` is called with a store.
- In `streamChat()`, the code calls `getCachedReport()` **without** providing `evidenceStore`, which can produce `null` context even when the UI is showing a report (if the UI path used the DB-backed version).

### Findings (prioritized)

## 1) High severity: streaming can get stuck indefinitely on backend error

Backend behavior:

- On successful streaming, the server sends `{ type: 'done' }`.
- On failure, the backend sends `{ type: 'error', message: ... }` but does **not** send a terminal `{ type: 'done' }` event.

Client behavior:

- The client only resets `streaming` when it receives `{ type: 'done' }` (or when the fetch throws and the outer `catch` runs).
- If the SSE connection stays open and the stream terminates without triggering `done`, the UI may remain stuck with `disabled={streaming}`.

Code points:

- Backend error path (`api/chatService.js`) sends `type: 'error'` but no `done`.
- Client updates streaming state only on `type: 'done'` (`client/src/hooks/useChat.js`).

Recommendation:

- Always send a terminal event (e.g. `{ type: 'done' }` or `{ type: 'error_done' }`) after an error.
- Or send `{ type: 'done', error: true, message: ... }` and have the client always finalize state on any terminal event.

## 2) High severity: possible context mismatch between `/api/report/today` and `/api/chat`

UI gating:

- `client/src/MainApp.jsx` shows `ChatPanel` only if `useTodayReport()` reports `found` and `assessment`.

Chat grounding:

- `streamChat()` calls `getCachedReport()` **without passing the evidence store**.

Result:

- The UI can display a report while the chat system prompt contains `CONTEXT: No resilience report is available...` (or otherwise missing/incorrect context).

Recommendation:

- Ensure `streamChat()` uses the same cache source as `/api/report/today`.
- Concretely, update `api/chatService.js` to accept a report payload (or accept `store`) or update `streamChat` call site in `app.js` to pass `evidenceStore` into `getCachedReport`.

## 3) Medium severity: client does not handle non-2xx responses or SSE parsing edge cases

Client currently assumes `res.body` exists and begins reading:

- `client/src/hooks/useChat.js` does not check `res.ok` before using `res.body.getReader()`.
- Auth failures or other non-2xx responses may yield a response body without the expected SSE framing, increasing the chance that `done` never arrives.

Also, the SSE parsing is fragile:

- It splits on `'\n'` and checks `line.startsWith('data: ')` but does not handle `\r\n` and does not `trim()` the line.
- Parse errors are silently swallowed (`catch { /* skip */ }`), which can drop events without user-visible error and without triggering termination.

Recommendation:

- If `!res.ok`, read the response JSON/text (if any) and finalize the chat with an error UI state.
- Normalize SSE line parsing (handle `\r`, ignore empty lines, consider `trim()`).
- On any parsing error, decide whether to terminate the stream (and set `streaming=false`) rather than silently skipping forever.

## 4) Medium severity: unbounded prompt growth (cost + reliability)

The request body includes the full `history` array:

- `useChat()` sends `{ message, history }`.
- Server appends entire `history` into the Anthropic `messages`.

Together with report context embedded in the system prompt, this can:

- increase token usage and cost
- lead to context-length failures which likely trigger the backend catch-path (again interacting with the “stuck streaming” problem)

Recommendation:

- Cap history length (e.g. last N turns) or cap total message tokens.
- Optionally summarize prior conversation on the server side.

## 5) Medium severity: no cancellation/cleanup

If the user navigates away mid-stream, there is no `AbortController` tied to component lifecycle.

Recommendation:

- Use `AbortController` in `useChat()` and abort the fetch/reader on unmount or on “Stop” action.

## 6) Low severity/UX: no user-visible display of backend error events

Backend emits `{ type: 'error', message }`.

Client currently:

- ignores `{ type: 'error' }`
- and only resets state on `{ type: 'done' }` or thrown fetch errors

Recommendation:

- Handle `event.type === 'error'` by:
  - appending an assistant error message to `history` (or showing a dedicated error banner)
  - setting `streaming=false`
  - clearing `draft`

### Security considerations

## Auth gating

`POST /api/chat` is protected by `authHook` when `AUTH_REQUIRED=true`:

- `app.js` registers `authHook` using `requireAuthPreHandler`
- `auth/requireAuthPreHandler.js` verifies Firebase ID tokens from `Authorization: Bearer ...`

This is a positive baseline.

## Prompt injection and grounding

The system prompt provides report context but:

- there is no explicit instruction like “answer using only the provided context”
- no enforcement on server-side to ensure output is grounded

Whether this is a product risk depends on intended trust level.

Recommendation:

- Add explicit “use provided context; if insufficient, say so” language.
- Consider redaction or constraints on what evidence can be referenced (if that matters).

### Concrete recommendations (practical next steps)

1. Fix terminal SSE semantics:
   - Ensure backend always sends a terminal event even on catch/error.
   - Update client to treat `{ type: 'error' }` as terminal and finalize UI state.
2. Align cache source:
   - Ensure chat prompt context is sourced the same way as `/api/report/today`.
3. Improve client robustness:
   - Check `res.ok` before streaming parse.
   - Parse SSE lines more defensively (handle `\r\n`, ignore noise, do not silently swallow parse errors without termination).
4. Bound history:
   - Limit history length or total message size to avoid context overflow and reduce cost.
5. Add cancellation:
   - Use `AbortController` + unmount cleanup.

### Files referenced

- `client/src/MainApp.jsx`
- `client/src/components/ChatPanel.jsx`
- `client/src/hooks/useChat.js`
- `app.js` (route: `POST /api/chat`)
- `api/chatService.js`
- `business_modules/resilience_scorer/app/reportCacheService.js` (function: `getCachedReport`)
- `auth/requireAuthPreHandler.js`

