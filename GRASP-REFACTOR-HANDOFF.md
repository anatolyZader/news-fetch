# GRASP Remediation — Refactor Handoff

> Self-contained handoff for continuing a GRASP (General Responsibility Assignment
> Software Patterns) refactor of this Node.js modular monolith. Read this whole file
> before editing. ~5 of 9 work items are done; the rest are detailed below.

---

## 0. CRITICAL ground rules (read first)

1. **Work in the tree; DO NOT commit.** This repo always carries a large uncommitted
   WIP (hundreds of staged + unstaged files). It is the owner's in-progress work.
   Make edits, verify, and leave them uncommitted. Do **not** run `git add`/`git commit`/
   `git stash` — a broad add/commit will sweep the owner's WIP into your commit, and a
   stash will entangle it with your edits.
2. **Behavior must be preserved.** These are structural refactors, not feature changes.
   Every change must keep runtime behavior identical.
3. **Know the baseline.** Before you start, `npm run lint` reports **22 errors + ~21
   warnings** and `npm test` reports **~7 failing tests** — these are ALL PRE-EXISTING
   and unrelated to this refactor. Your goal is to not increase those counts. Do not
   "fix" them as part of this work.
4. **Pitfall:** never measure pass/fail via `npm test | tail … ; echo $?` — `$?` is
   `tail`'s exit code, not the test runner's. Read the summary line
   (`ℹ tests / pass / fail`) instead.
5. **Verify after each file/step:** `node --input-type=module -e "await import('./<file>')"`
   to load-check, then `npx eslint <file>`, then run the nearest test file. Run the full
   `npm test` + `npm run lint` after each work item and compare to the 22-errors/7-fails
   baseline. Don't advance if you've added a new failure.
6. The hexagonal layering convention: each `business_modules/<m>/` has
   `input/` (routes/CLI), `app/` (application services), `domain/` (logic + `I*Port`
   contracts), `infrastructure/` (adapters). Shared concerns in `cross-cut-modules/`.
   Composition root is `app.js`. **A module's siblings import only via its `index.js`
   facade**, never its internals. Direct vendor SDK use is allowed only in
   `**/infrastructure/**` and `cross-cut-modules/llm/**`.

---

## 1. Background — the GRASP findings being fixed

- **Low Coupling / Protected Variations:** `resilience` had no `index.js` facade, so
  ~19 files reached into its `domain/app/infrastructure` internals directly. **(FIXED)**
- **Polymorphism / Protected Variations:** 11 app-layer files imported
  `@anthropic-ai/sdk` directly instead of through a port. Persistence (`fs`), auth
  (`firebase-admin`), embeddings (OpenAI) also un-ported. **(LLM part FIXED; fs/auth/
  embedding = P2, TODO)**
- **Controller / Pure Fabrication:** `evidence`/`chat`/`report` routes are fat;
  `requireAnalyst` was duplicated 3×; date-regex / 503 / 502 shaping duplicated.
  **(dedup FIXED; fat-controller extraction = P1.1/P1.2, TODO)**
- **High Cohesion / Information Expert:** god services (`mailingService.js` 1119 lines),
  148-line `runResilienceAssessment`, anemic `signalCatalog.js`.
  **(runResilienceAssessment FIXED; mailing split = P1.4, signal router = P2, TODO)**

---

## 2. ✅ ALREADY ACCOMPLISHED (do not redo)

All verified: 0 new lint errors, 0 new test failures vs baseline.

### P0.1 — Unified LLM transport port  ✅
- **New:** `cross-cut-modules/llm/ILlmPort.js` (JSDoc `@typedef` contract) and
  `cross-cut-modules/llm/anthropicLlmAdapter.js`.
- API:
  ```js
  import { createAnthropicLlmPort, getDefaultLlmPort } from 'cross-cut-modules/llm/anthropicLlmAdapter.js';
  // createAnthropicLlmPort({ apiKey?, defaultModel?, client? }) -> LlmPort
  // getDefaultLlmPort() -> lazy singleton (env ANTHROPIC_API_KEY, == old `new Anthropic()`)
  // LlmPort = {
  //   createMessage(opts) -> Promise<rawMessage>   // pass-through to client.messages.create
  //   stream(opts)        -> rawStream             // pass-through to client.messages.stream (has finalMessage())
  //   runToolLoop(opts)   -> Promise<...>          // shared runToolLoop with client pre-bound (DO NOT pass client)
  //   raw                 -> underlying SDK client (escape hatch; remove in P2.5)
  //   defaultModel        -> stored, NOT auto-applied
  // }
  ```
- It reuses the existing `cross-cut-modules/llm/runToolLoop.js`. The port is a thin
  pass-through: **no auto model, no auto cost recording** — callers keep owning `onUsage`.
- Tests: `tests/cross-cut-modules/llm/anthropicLlmAdapter.test.js` (4 passing).

### P0.2 — `resilience` module facade  ✅
- **New:** `business_modules/resilience/index.js` re-exports the public surface
  (32 exports: `assessmentDisplayTier` helpers, `buildAttentionItems`,
  `normalizeReportScope`, `COMPONENT_IDS/SIGNAL_TYPES/SIGNAL_CATALOG/CATALOG_VERSION`,
  `RESILIENCE_COMPONENTS`, policies, `updateOperatorRecommendationStatus`,
  `archiveMarkdownFiles`, `createDriftService`, `formatSimilarArticlesForChat`,
  `extractSignals/extractEvidence/synthesizeComponents/buildSignalExtractionSystemPrompt/
  extractJsonArray`, `extractJson`, `loadMdFile/loadMdFiles`, `applySourceNativeGrounding`,
  `createGeoEnrichmentAdapter/createNoOpGeoEnrichmentPort`, `loadProbeRecordsForDate`).
- All ~19 cross-module deep imports repointed to the facade (17 business-module files
  + `api/routes/{report,chat}Routes.js` + several `cross-cut-modules/*` and `db/*` + `app.js`).
- **ESLint guard added (as `warn`)** in `eslint.config.js`: bans
  `**/resilience/{domain,app,infrastructure,validation}/**` imports from outside the
  resilience module (ignores `business_modules/resilience/**`, `tests/**`, `scripts/**`).
- 6 deliberate `no-restricted-imports` warnings remain as TODO markers (see §3).

### P0.3 — Controller plumbing centralized  ✅
- Deleted the 3 local `requireAnalyst` copies in `catalogLearning/input/catalogLearningRoutes.js`,
  `geo/input/geoRoutes.js`, `resilience/validation/input/validationReviewRoutes.js`; all now
  import `requireAnalystView` from `cross-cut-modules/auth/requireAnalystAccess.js`.
- **New:** `cross-cut-modules/security/app/httpGuards.js` — `assertService(service, reply, msg)`
  and `dateParam(value, reply, {field})` and `isIsoDate(value)`. Applied in
  `news-sites/input/newsSitesRoutes.js`, `audio/input/radioRoutes.js`,
  `social_media/input/socialMediaRoutes.js`.
- **DEFERRED on purpose:** the global `app.setErrorHandler` — it would change uncaught-error
  response shape/status with no dedup benefit until per-handler `try/catch`es are removed.
  Add it only alongside P1.1/P1.2 if you remove those catches.

### P1.3 — All app-layer LLM access funneled through the port  ✅
- 11 app-layer files + `chat/infrastructure/claudeChat.js` migrated off
  `@anthropic-ai/sdk` to the port. **0 `@anthropic-ai/sdk` imports remain in any `app/` layer.**
- Pattern used per call-shape:
  - module-level `const client = new Anthropic()` → `const llmPort = getDefaultLlmPort()`;
    `client.messages.create(` → `llmPort.createMessage(`; `.messages.stream(` → `.stream(`.
  - factory `new Anthropic({apiKey})` → `createAnthropicLlmPort({apiKey})`.
  - tool-loop callers: `runToolLoop({client, ...})` → `llmPort.runToolLoop({...})`.
  - **back-compat preserved** where a raw `client` could be injected (tests):
    `socialCandidateClassifier`, `validationReviewAgent`, `claudeChat` accept a raw
    `client`/`opts.client` and wrap it via `createAnthropicLlmPort({ client })`.
- Files: `translation/app/translationService.js`,
  `audio/app/audioTranscriptContextualizer.js`,
  `resilience/validation/app/{validationReviewExplain,validationReviewAgent}.js`,
  `resilience/app/surveyEvaluator.js`, `whatsapp/app/{draftGenerator,whatsappResilienceAnalyzer}.js`,
  `news-sites/app/extractHomefrontArticles.js`, `chat/app/chatToolHandlers.js`,
  `social_media/app/socialCandidateClassifier.js`, `pbo_report_muni/app/eventLogEvaluator.js`,
  `chat/infrastructure/claudeChat.js`.
- NOTE: `**/infrastructure/**` adapters (e.g. `report_build/.../anthropic*Adapter.js`,
  `resilience/infrastructure/claude*.js`) still use the SDK directly — **that is correct**
  (infra layer), out of scope.

### P1.5 — `runResilienceAssessment` decomposed  ✅
- In `business_modules/resilience/app/resilienceAnalysisService.js`, extracted
  `scoreBatchSignals(...)` (prepare + scoring pipeline) and `persistReportIfRequested(...)`.
  Function went 147 → 125 lines, logic identical. Assessment tests pass.

---

## 3. Known intentional ESLint warnings (do not "fix" by hand — they're roadmap markers)

`npm run lint` shows exactly **6** `no-restricted-imports` warnings:
- `api/routes/evidenceRoutes.js` ×3 (`runResilienceAssessment`, `contentBatchFromMdArticles`,
  `createAnthropicResilienceLlmAdapter`) → resolved by **P1.1** (move into the evidence service,
  which imports them from the resilience facade — note: **none of these three are exported by
  the facade yet**; P1.1 step 1 must add all three).
- `app.js` ×3 (validation `validationReviewSqliteStore`, `validationReviewService`,
  `validationReviewRoutes`) → resolved in **P2** (add a `resilience/validation/index.js`
  sub-facade or extend the resilience facade, then repoint `app.js`).

When each is resolved, P2.6 flips the rule to `error`.

---

## 4. ⏳ TO BE DONE

> Order suggestion: P1.1 → P1.2 → P1.4 → P2. Do ONE item per pass; run full
> `npm test` + `npm run lint` and compare to baseline before moving on.

---

### P1.1 — Extract the Evidence controller into an app service  (behavior-risky)

**Goal:** `api/routes/evidenceRoutes.js` (~525 lines) currently inlines a job queue,
URL/file ingest, manual-evidence storage, and LLM analysis. Move that orchestration into
a service; leave the route thin (validate / classify / draft save+submit / access / audit /
enqueue / status reads).

**Steps:**
1. **New** `cross-cut-modules/evidence/evidenceSubmissionService.js`:
   ```js
   export function createEvidenceSubmissionService(deps) { return { enqueue(job), processJob(job) }; }
   ```
   Move **verbatim** from `evidenceRoutes.js` (these private fns, ~lines 41–323):
   `ingestUrlByKind`, `ingestUrls`, `ingestLocalFiles`, `storeManualEvidence`,
   `runSubmissionAnalysis`, `processSubmissionJob`, and the queue
   (`createSubmissionQueue`/`drainSubmissionQueue`/`enqueueSubmissionJob`).
   - **Preserve exactly:** the **20-minute** `Promise.race` job timeout
     (`SUBMISSION_JOB_TIMEOUT_MS`), the `processingSubmissionQueue` drain guard, and every
     `evidenceDraftStore` state-machine write (`setSubmissionIngestStatus`,
     `setSubmissionExtractedContent`, `setSubmissionAnalysisResult` with identical payloads
     and `.slice(0, 4000)` truncations) including the on-timeout/on-error failure writes.
   - Inject deps (default each to today's import so behavior is identical):
     `evidenceDraftStore, evidenceStore, sourceArchive, getAudioEvidenceIngestService,
     youtubeEvidenceIngestService, videoGrabService, videoDownloadDir,
     evidenceUserUploadsRoot, runResilienceAssessment, contentBatchFromMdArticles,
     createAnthropicResilienceLlmAdapter, timezone, jobTimeoutMs`.
   - Import `runResilienceAssessment`, `contentBatchFromMdArticles`,
     `createAnthropicResilienceLlmAdapter` **from the resilience facade**
     (`business_modules/resilience/index.js`). **None of these three are exported by the
     facade yet — add all three** in this step:
     `runResilienceAssessment` from `./app/resilienceAnalysisService.js`,
     `contentBatchFromMdArticles` from `./app/contentBatchFromMdArticles.js`,
     `createAnthropicResilienceLlmAdapter` from
     `./infrastructure/adapters/anthropicResilienceLlmAdapter.js`.
2. In `evidenceRoutes.js`: delete the moved functions + their now-unused imports;
   construct `const submission = createEvidenceSubmissionService({...opts})`; replace the
   old `enqueueSubmissionJob(job)` calls with `submission.enqueue(job)`. Keep all
   multipart parsing, validation, `classify*`, draft save/submit, access checks, audit,
   and the `reply.code(202).send(...)` responses **unchanged**. Preserve the exact `ctx`
   object shape passed into the ingest helpers.
3. `app.js` already passes the full dep set to `evidenceRoutes` — no `app.js` change needed.
4. After: the 3 `evidenceRoutes` `no-restricted-imports` warnings should be **gone**
   (now via the facade). Run `tests/cross-cut-modules/evidence/*` and the full suite.

**Risk:** queue/timeout fidelity; the `ctx` object shape. Verify by exercising
`/api/evidence-submit` + `/api/evidence-upload` if you can run the app (`npm start`).

---

### P1.2 — Extract the Chat controller into a session service  (behavior-risky)

**Hard constraint:** `reply.hijack()`, `reply.raw.writeHead(...)`, the SSE pump, and
`reply.raw.end()` MUST stay in `api/routes/chatRoutes.js` (Fastify-specific). Only the
NON-streaming prep and post-stream persistence move out.

**Steps:**
1. **New** `business_modules/chat/app/chatSessionService.js`:
   ```js
   export function createChatSessionService({ chatStore, timezone, generateChatTitle }) {
     return { prepareTurn(args), finalizeTurn(args) };
   }
   ```
   - `prepareTurn({ ownerUid, sessionId, body, userEmail })` — NO `reply`. Validate session
     (return a discriminated `{ error, code }` on failure; the route maps to 400/404),
     ownership assert, assemble `history` from `chatStore.listMessages`, build `systemHint`
     (`buildChatSystemHint` merge), `resolveDisplayView`, derive `act`/`userMessage`
     (incl. `regenerate` → last-user lookup and the `edit_resend`/`continue`/`send` persist
     rule), persist the user message + `touchSession` when applicable. Returns
     `{ history, systemHint, display_view, userMessage, geoScope, act }`.
   - `finalizeTurn({ ownerUid, sessionId, assistantText, userMessage, costRecorder })` —
     post-stream: `chatStore.addMessage` (assistant) + `touchSession`; auto-title via
     `generateChatTitle` + `renameSession` (keep the try/catch swallow).
2. `chatRoutes.js` `/api/chat` keeps: maintainer gate, `auditFromRequest`, body parse,
   `prepareTurn(...)` → map `error` to 400/404, **the hijack block verbatim**,
   `createHttpCostRecorder`, `createChatRetrievalCache`, the `streamChat(...)` pump
   (unchanged), then `finalizeTurn(...)`, then `finally { costRecorder.flush(); reply.raw.end(); }`.
   The `getReportData` closure stays in the route (it closes over `evidenceStore` + `display_view`).
3. Wire `const chatSessionService = createChatSessionService({ chatStore, timezone, generateChatTitle })`
   inside `chatRoutes` from existing opts (no `app.js` change). The `generateChatTitle`
   import moves into the service.

**Risk:** the `regenerate` path, the `shouldPersistUser` rule, and persistence ordering
(user persisted pre-hijack; assistant + title post-stream). Test:
`tests/api/routes/chatRoutes.confirmAction.test.js`, `tests/business_modules/chat/*`,
golden `tests/fixtures/chat-agent-golden.json`.

---

### P1.4 — Split `mailingService.js` (1119 lines)  (mechanical, NO rendering tests — careful)

There are no unit tests for mailing rendering; rely on load-check + lint + careful moves.

1. **New** `business_modules/mailing/domain/copy/mailingLabels.js` — move the pure data
   blocks (`LABELS`, `COMPONENT_LABELS`, `POOL_COLORS`, `POOL_LABELS`, `NAF_SEVERITY_KEYS`,
   `NAF_VULN_KEYS`, `DEFAULT_APP_BASE_URL` — currently ~lines 14–309) and `export` each;
   `import` them back into `mailingService.js`. **This is the safe, high-value step — do it
   first and verify (load + lint) before attempting the renderer split.**
2. **New** `business_modules/mailing/app/mailDigestRenderer.js` — move the rendering cluster
   together (the HTML/text builders ~lines 311–965: `escapeHtml`, `ctaButtonHtml`,
   `poolKpiHtml`, `stackedBarHtml`, `trendStackTableHtml`, `horizontalBarsHtml`,
   `commentsTableHtml`, `componentLabel`, `labelPool`, `buildReportText/Html`,
   `buildNaftaliText/Html`, `buildEducationText/Html`, `buildPoolShellHtml`, …). They call
   each other, so **move the whole block together**; import labels; `export` the builders
   the service still calls. Verify load + lint after.
3. **New** `business_modules/mailing/app/digestAssembler.js` — `signalTotalsByDate`,
   `buildDayBreakdown`, `appendReportDigestParts`, `appendDashboardParts`, `buildDigestParts`.
4. `mailingService.js` keeps only `createMailingService` + `sendDigest` wiring, delegating
   to the three new modules. Target ≤ ~250 lines.
- Consumers to keep working: `mailing/input/runDailyDigest.js`, `mailing/input/mailingRoutes.js`,
  `app.js`. Spot-check `npm run mail:digest` if runnable.

---

### P2 — Hardening & design polish  (full scope confirmed by owner)

**P2.1 — Signal router (Information Expert).**
New `business_modules/resilience/domain/services/signalRouter.js` that owns the
signal→component routing currently split between `signalCatalog.js`
(`SIGNAL_CATALOG`, `SIGNAL_TO_COMPONENTS`) and `scoring/scoringShared.js`
(`getSignalCatalogEntry`, `contributionForSignal`). Keep `scoreFromItems`
(`scoringShared.js`, ~lines 329–375) **pure** — move the `evaluateHighSalienceBypass`
call out into a post-scoring policy step.

**P2.2 — Domain `fs` → persistence port (15 files).**
Route the 15 domain-layer `fs` imports through injected adapters under
`cross-cut-modules/persistence/` (define `IConfigStorePort`/`IStateStorePort`; default to an
fs adapter for parity; inject at each module's factory seam). Representative offenders:
`chat/domain/{sourceArchiveQuery,signalLookup}.js`,
`resilience/domain/services/{outletReputationDecay,oovCapture,peaceTimeAnchors,signalWeightsFit,
dataVoid/digitalQuarantineState,socialQuarantineOverrides,oovBurstAlert,outletReliabilityPriors}.js`,
`resilience/tuning/domain/componentTuningProposal.js`,
`resilience/validation/domain/validationStatus.js`,
`geo/domain/services/{loadDistanceBandPolicy,homefrontDistrictStubs}.js`,
`social_media/domain/services/telegramChannelRegistry.js`.
(Find the live list with: `grep -rlE "from 'node:fs|from 'fs'" business_modules --include=*.js | grep "/domain/"`.)
*This is the biggest/riskiest item — do it incrementally, one module at a time, with tests.*

**P2.3 — Auth & embedding ports.**
- New `cross-cut-modules/auth/domain/ports/IAuthPort.js` + `firebaseAuthAdapter.js` wrapping
  `cross-cut-modules/auth/firebaseAdmin.js` (`initAuth`, `isEmailVerified`,
  `verifyToken(bearerHeader, checkRevoked)`); repoint auth hooks.
- New `cross-cut-modules/vector_index/domain/ports/IEmbeddingPort.js` + adapter wrapping
  `openaiEmbeddingAdapter.js` (`enabled`, `getModelId`, `embed`, `embedBatch`); repoint RAG callers.

**P2.4 — claudeEvaluator capability.**
The facade currently re-exports `claudeEvaluator.js` LLM helpers
(`extractSignals`/`buildSignalExtractionSystemPrompt`/`extractJsonArray`) for 3 sibling
modules. Replace that with a capability exposed via `IResilienceLlmPort` (or a new shared
extraction port) so no module depends on another module's `infrastructure/` layer.

**P2.5 — Shared LLM-port injection.**
Inject one shared `LlmPort` from `app.js` into chat/validation services; drop the per-module
`getDefaultLlmPort()` singletons; remove the `ILlmPort.raw` escape hatch.

**P2.6 — ESLint guardrails → `error`.**
In `eslint.config.js` (follow the existing `eslint-rules/reactPropTypes.js` custom-rule
pattern):
- add `no-restricted-imports` banning `@anthropic-ai/sdk` outside `cross-cut-modules/llm/**`
  and `**/infrastructure/**`;
- ban `node:fs`/`fs` inside `**/domain/**`;
- (custom rule) forbid cross-module imports that don't go through a module `index.js`.
Flip each from `warn` → `error` once its migration is complete (resolve the 6 markers in §3 first).

---

## 5. Verification cheat-sheet

```bash
npm test        # node:test; expect ~7 pre-existing fails — don't add more
npm run lint    # expect 22 pre-existing errors; watch the warning count
# load-check a single file:
node --input-type=module -e "await import('./<path>.js')"
# lint a single file:
npx eslint <path>.js
```
Relevant existing tests: `tests/cross-cut-modules/llm/*`, `tests/cross-cut-modules/evidence/*`,
`tests/business_modules/chat/*`, `tests/api/routes/chatRoutes.confirmAction.test.js`,
`tests/business_modules/resilience/app/resilienceAnalysisService.test.js`,
`tests/business_modules/resilience/validation/app/validationReviewAgent.test.js`.

The original approved plan (pre-execution) is at
`/home/eventstorm1/.claude/plans/peaceful-bouncing-clarke.md` for reference.
