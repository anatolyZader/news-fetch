# Pipeline and data sources

**Purpose:** How daily **artifacts** are produced — ingest → signal extraction → **agent assess + shadow scoring** → reports on disk. Operators depend on this pipeline running; they do not run assessment math manually.

**Sources:** `scripts/daily-pipeline.sh`, `pipeline-config.json`, `business_modules/resilience/input/extract-signals.js`, `input/assess-signals.js` (thin CLI wrappers → `app/extractSignalsCli.js`, `app/assessSignalsCli.js`), `app/produceAssessmentWithShadow.js`, `app/pipelineOrchestrator.js`, `app/pipelineIngestPlan.js`, `input/run-pipeline.js`, `domain/services/pipelineArtifactPaths.js`, `cross-cut-modules/llm/writeTokenReport.js`. Cross-module imports use `business_modules/<name>/index.js` facades — see [README § Module boundaries](./README.md#module-boundaries-option-b).

---

## End-to-end flow

```text
Sources (news, radio, WhatsApp, field, PBO, social, …)
  → normalized markdown / JSON bundles
  → extract-signals (LLM, closed vocabulary)
  → signals-{source}-{date}.json
  → assess-signals
       ├─ verify, scope, prepareScoringSignals
       ├─ scoreComponents (shadow / calibration)
       └─ runAssessmentAgent (RAG + planner + specialists + synthesizer)
  → daily_reports/resilience-report-{date}.json (+ markdown, trace, shadow artifacts)
  → API / operator UI (redacted display tier)
```

Production entry points:

```bash
node business_modules/resilience/input/run-pipeline.js [date] [options]   # unified (Node) — see § Node.js pipeline orchestrator
npm run extract-signals -- --source-type news --files <path> --date YYYY-MM-DD
npm run assess-signals -- --date YYYY-MM-DD [--days N] [--scope national|north|…]
```

Orchestrated daily run:

```bash
./scripts/daily-pipeline.sh
./scripts/daily-pipeline.sh --no-transcribe   # skip radio transcription
```

`run-pipeline.js` is the **recommended** unified entry for cron and programmatic runs. `daily-pipeline.sh` and `.claude/commands/8comp*.md` remain as legacy manual recipes (slash commands may use outdated artifact paths — prefer `run-pipeline.js`).

Worker variant: `npm run worker:assess` → `scripts/workers/assess-signals-worker.js`.

**Degrade:** When daily budget is exceeded or the agent is unavailable, assess continues with deterministic scoring + cached-report fallback (`assessment_degraded` on the report). No legacy Sonnet narrative path.

---

## Node.js pipeline orchestrator

**Entry:** `node business_modules/resilience/input/run-pipeline.js [date] [options]` → `app/pipelineOrchestrator.js` → `runPipelineOrchestrator`. Bootstraps SQLite via `bootstrapDefaultStateStore` in `run-pipeline.js` before orchestration.

**Purpose:** Unified Node.js orchestration for `/8comp-3`, `/8comp-3-north`, and cron runs. Recommended over `daily-pipeline.sh` for programmatic use.

**Plan phase** (`pipelineIngestPlan.js` → `buildPipelineIngestPlan`): Read-only filesystem preflight (no subprocess spawns or writes). Uses `existsSync` / `readdirSync` to check artifact presence and emits an ordered list of typed steps per source per date. Helpers: `parsePipelineDateArg`, `planHasWork`, `loadPipelineEnabledSources`. Action types: `reuse | skip | fetch_news | extract_news | extract_radio | export_whatsapp | extract_whatsapp | extract_field | extract_pbo | extract_naftali | extract_regional_pbo | social_gather | pbo_review`.

**Execute phase** (`pipelineOrchestrator.js` → `runPipelineOrchestrator` → `runIngestPhase`): Runs plan steps sequentially via `spawn`. Honors `pipeline-config.json` source toggles. Social gather spawns `socialMediaInput.js gather-daily` (with `--north` when `--scope` ≠ `national`).

**Post-run token report** (`tryWriteTokenReport` → `cross-cut-modules/llm/writeTokenReport.js`): After both full runs and `--ingest-only` exits, filters `llm-invocations.jsonl` by `[startedAt, completedAt]` and writes `cross-cut-modules/budget/resilience_analysis/token-report-{date}-{scope}.json` (aggregates by feature and model). See [COST-CONTROLS.md § Per-pipeline token report](./COST-CONTROLS.md#per-pipeline-token-report).

**Path resolver** (`domain/services/pipelineArtifactPaths.js`): Canonical path functions (`newsSignalsPath`, `radioSignalsPath`, `whatsappSignalsPath`, `socialSignalsPath`, `newsArticlesPath`, etc.). Always import from here — do not hardcode artifact paths.

**CLI flags:**

| Flag | Effect |
|------|--------|
| `--date YYYY-MM-DD` or positional `dd:mm:yyyy` | Target assessment date (default today) |
| `--days N` | Window size 1–14 (default 3) |
| `--scope national\|north\|…` | Report scope (default national) |
| `--force` | Re-extract; delete existing signal bundles in window |
| `--no-transcribe` | Skip radio transcription step |
| `--no-social` | Skip social OSINT gather |
| `--ingest-only` | Run ingest steps only; skip assess (still writes token report) |
| `--assess-only` | Skip ingest; run assess-signals only |

**Replay mode:** Activated when `--date` ≠ today (in `Asia/Jerusalem` / `TZ_ARTICLES`).

- `conservativeNewsFetch=true` when replay **or** when `--scope` ≠ `national` (north runs reuse-first news fetch).
- Social cannot be re-fetched in replay (`pushSocialReplaySteps` emits `skip`).
- **Ingest stages suppressed in replay** (`pipelineIngestPlan.js` — `pushOnceSteps` / `pushFieldStepsIfEnabled`; orchestrator skips radio transcribe when `replayMode`):

| Stage | Replay behavior |
|-------|-----------------|
| `field` extract | **Skipped** |
| `pbo` extract | **Skipped** |
| `naftali` extract | **Skipped** |
| `pbo_review` | **Skipped** |
| Radio transcribe (`runPipelineOrchestrator`) | **Skipped** |
| `social_gather` | `skip` (no re-fetch) |
| `extract_regional_pbo` | **Still runs** if regional MD files exist on disk |
| News | Conservative reuse-first fetch (see above) |

- **Abort guards:** (1) `assertAssessOnlySafe` — replay `--assess-only` without `--force` aborts when an existing report has `reportQualityRank(meta) === 0` (normal, no active quarantine). (2) Any replay run aborts when `planHasWork(plan.steps)` is false (nothing to ingest or assess).

---

## `scripts/daily-pipeline.sh` (typical steps)

Note: for programmatic invocation (slash commands, cron), prefer `node business_modules/resilience/input/run-pipeline.js`. The shell script remains for manual/legacy use.

**Divergence from Node orchestrator:**

| Aspect | `daily-pipeline.sh` | `run-pipeline.js` |
|--------|---------------------|-------------------|
| Social OSINT gather | Not included | `social_gather` when `social` enabled in config |
| `pipeline-config.json` | Ignored (runs all steps) | Honored via `loadPipelineEnabledSources` |
| Post-run token report | Not written | `tryWriteTokenReport` after ingest or full run |
| PBO review vs extract order | Review (7b) before municipal extract (7) | Municipal extract before `pbo_review` |
| Replay / scope guards | None | `assertAssessOnlySafe`, `planHasWork`, conservative north fetch |

Runs for **today, yesterday, two days ago** (system date):

| Step | Action |
|------|--------|
| 1 | `scripts/radio-transcribe.sh 3` (optional skip) |
| 2 | `npm run homefront-to-md -- $date` → `business_modules/news-sites/articles_extracted/` |
| 3 | `extract-signals.js --source-type news` |
| 4 | `extract-signals.js --source-type radio` on `articles-audio-*` |
| 5 | `whatsapp-to-md.js` + `extract-signals.js --source-type whatsapp` |
| 6 | Last 3 field report MD files → `extract-signals.js --source-type field` |
| 7b | `business_modules/pbo_report_review/input/runMunicipalPboReview.js --date $TODAY` |
| 7 | `extract-pbo-signals.js` (municipal) |
| 8 | `extract-regional-pbo-signals.js` |
| 9 | `extract-naftali-signals.js` |
| 10 | `assess-signals.js --date $TODAY --days 3` |

The shell script runs all steps; **source enablement** for extract/assess is also controlled by `pipeline-config.json`.

---

## `pipeline-config.json`

Per-source toggles: `{ "sources": { "<type>": { "enabled": bool, "description": "…" } } }`.

Keys include: `news`, `radio`, `whatsapp`, `field`, `pbo`, `naftali`, `social`.

**Not in config:** `extract_regional_pbo` is filesystem-driven — the orchestrator runs it when regional PBO markdown exists under `regionalPboDataDir()` (`pipelineArtifactPaths.js`), independent of `pipeline-config.json` toggles.

- **Extract:** `extract-signals.js` skips disabled sources (`isSourceEnabled`).
- **Assess:** `app/assessSignalsHelpers.js` skips disabled sources when loading bundles.

Status CLI: `npm run pipeline:status`.

---

## Stage 1 — Extract signals

**Entry:** `business_modules/resilience/input/extract-signals.js` (transport) → `app/extractSignalsCli.js`  
**npm:** `npm run extract-signals -- …`

**Inputs:** `--source-type`, `--files` (CSV paths), `--date` (default today).

**Flow:** daily budget check → archive sources to `source_archive` → LLM extraction (Claude) → geo enrich (`enrichSignalsWithGeo.js`) → write bundle.

**Outputs:**

- `business_modules/signals_extraction/data/signals/signals-{type}-{date}.json` (most types)
- Field: `business_modules/visits/data/signals/signals-field-{date}.json`

**Cost script id:** `extract-signals` in `cross-cut-modules/log/data/cost-log.jsonl`.

Optional ingest RAG when `RESILIENCE_EXTRACT_RAG_ENABLED` (see [RAG.md](./RAG.md)).

**Prod cron cost knobs:** set `RESILIENCE_EXTRACT_BATCH=1` for Anthropic Batch API (50% discount, async); sync path remains default elsewhere. Also recommended: `RESILIENCE_EXTRACT_CACHE=1` (default), `RESILIENCE_EXTRACT_MULTIPASS=2` for two-pass extract, `RESILIENCE_EXTRACT_MAX_TOKENS=5000`. See [COST-CONTROLS.md](./COST-CONTROLS.md).

---

## Stage 2 — Assess signals

**Entry:** `business_modules/resilience/input/assess-signals.js` (transport) → `app/assessSignalsCli.js`  
**npm:** `npm run assess-signals -- …`

**Inputs:** `--date`, `--days` (1–14, default 1), `--scope`, `--output`.

**Flow (high level):**

1. Load signal bundles for date window (auto-discover paths including social OSINT).
2. Dedup; attach geo; **`scopeAndPartitionSignals`** (`regionSignalFilter.js`, epistemic partition).
3. **`prepareScoringSignals`** — quarantine, data void, OOV, gaming policy.
4. **`runScoringPipeline`** → `scoreComponents` → epistemic gate → EWMA (`scoringPipelinePrep.js`) — **shadow path**.
5. **`produceAssessmentWithShadow`** → epistemic profile → **`runAssessmentAgent`** (default) or **deterministic degrade** / cached fallback.
6. `mapAssessmentV2ToLegacy`; write JSON/MD report; shadow/divergence artifacts (via `resilience_assessment` adapter); validation queue upsert; domain events.

**Outputs:**

- `daily_reports/resilience-report-{date}.json` (and scoped variants) — includes v2 agent fields + legacy-mapped narratives
- `daily_reports/shadow-scores-{scopeId}-{date}.json` — deterministic scores (`RESILIENCE_SHADOW_SCORING=1`, default on); written by `writeShadowArtifacts` in `business_modules/resilience_assessment/infrastructure/adapters/shadowArtifactsFileAdapter.js` (orchestrated from `produceAssessmentWithShadow.js`)
- `daily_reports/divergence-{scopeId}-{date}.json` — shadow vs agent comparison
- `daily_reports/epistemic-profile-{scopeId}-{date}.json` — epistemic profile snapshot (`epistemicFeaturesService.persistProfile`)
- `daily_reports/assessment-agent-trace-{traceId}.jsonl` — per-assess agent audit trail
- Markdown report paths as configured
- SQLite validation review queue (default unless `VALIDATION_REVIEW_SQLITE=0`)

**Cost script id:** `assess-signals` (includes agent LLM rounds under assess budget governor).

Full stage detail: [RESILIENCE-ENGINE-REFERENCE.md](./RESILIENCE-ENGINE-REFERENCE.md).

---

## Source modules (where ingest lives)

| Source | Module / script |
|--------|-----------------|
| News | `business_modules/news-sites/` — `homefront-to-md` |
| Radio / audio | `business_modules/audio/`, `scripts/radio-transcribe.sh` |
| WhatsApp (groups) | `business_modules/whatsapp/input/whatsapp-to-md.js` — passive group export → extract |
| WhatsApp (DM Report bot) | Same guided flow as Write report — [§ Guided report](#guided-report-write-report--whatsapp-dm) |
| Field visits | `business_modules/visits/data/` |
| PBO municipal / regional | `business_modules/pbo_report_muni/`, `business_modules/pbo_report_regional/` |
| PBO municipal review | `business_modules/pbo_report_review/` — completeness gaps, officer email, inbound replies (see [§ Municipal PBO review](#municipal-pbo-review)) |
| Naftali / pools | `business_modules/pool/` |
| Social OSINT | `business_modules/social_media/data/` |

Geographic scoping for regional reports: [GEOGRAPHIC-ANALYSIS.md](./GEOGRAPHIC-ANALYSIS.md).

---

## Municipal PBO review

**Module:** `business_modules/pbo_report_review/` — municipal PBO **completeness** workflow (distinct from municipal extract in `pbo_report_muni/`).

**Flow:**

```text
Municipal PBO markdown on disk
  → extract-pbo-signals (may force re-extract when review answers arrive)
  → pbo_review step (orchestrator, today-only — skipped in replay)
       ├─ compute gaps vs expected sections (municipalCompleteness.js)
       ├─ email officers with questions (pboReviewMailingAdapter)
       └─ store review state in SQLite (pboReviewSqliteStore)
  → officer replies via inbound email webhook or analyst web form
  → supplemental answers merged on next extract (loadReviewMetadataMapForDate)
```

**Orchestrator:** `pbo_review` action in `pipelineIngestPlan.js` spawns `input/runMunicipalPboReview.js` after municipal extract, before assess. **Skipped in replay mode.**

**Extract coupling:** `business_modules/pbo_report_muni/input/extract-pbo-signals.js` imports `loadReviewMetadataMapForDate` and `shouldForcePboSignalRewrite` from `pbo_report_review/index.js` to merge officer supplemental text and force re-extract when inbound answers arrive.

**HTTP routes** (`input/pboReviewRoutes.js`):

| Route | Purpose |
|-------|---------|
| `GET /api/pbo/municipal-reviews?date=` | List reviews for a date |
| `GET /api/pbo/municipal-reviews/:date/:municipality` | Review detail |
| `POST /api/pbo/municipal-reviews/:date/:municipality/replies` | Analyst web reply |
| `POST /api/pbo/review/inbound-email` | Resend inbound webhook (`RESEND_WEBHOOK_SECRET`) |
| `GET /api/pbo/historical-search` | RAG-backed historical PBO search (when wired) |

**Data:** officer directory `business_modules/pbo_report_review/data/officers.json`; review state in SQLite.

**Chat tools:** `list_pbo_reviews`, `get_pbo_review`, `search_pbo_history` — see [LLM-CHAT-AND-AGENTS.md § PBO review surfaces](./LLM-CHAT-AND-AGENTS.md#pbo-review-surfaces).

**Shell vs Node order:** `daily-pipeline.sh` runs review (step 7b) **before** municipal extract (step 7); Node orchestrator runs municipal extract **before** `pbo_review`.


---

## Guided report (Write report + WhatsApp DM)

Structured situational reports use one **`report_build`** orchestrator for two surfaces:

| Surface | Entry | Session key |
|---------|-------|-------------|
| **Write report (web)** | Header button → `ReportBuildPanel.jsx` | Firebase `request.user.uid` |
| **WhatsApp Report bot (DM)** | `POST /api/webhooks/whatsapp` → `handleDmMessage` | Sender phone |

**API (web):** `POST /api/report-build/start`, `/turn`, `/suggest`, `/confirm`, `/cancel` — `business_modules/report_build/input/reportBuildRoutes.js`.

**Flow:** officer turns → `reportBuildService` (gap engine + LLM draft) → confirm → **`source_archive`** (`report_build-web` or `field_whatsapp` labels).

**WhatsApp groups** are **not** the guided bot: approved group messages → passive ingest → `whatsapp-to-md` → `extract-signals --source-type whatsapp` (same row as groups in the table above).

**Wiring:** `composition/registerMedia.js` registers web routes and a WhatsApp-scoped `reportBuildService` when Meta env vars are set. Requires `ANTHROPIC_API_KEY`.

---

## Artifacts operators rely on

| Path | Role |
|------|------|
| `daily_reports/resilience-report-*.json` | Full assessment — agent v2 fields + legacy-mapped narratives; shadow scores on disk; API redacts for operators |
| `daily_reports/shadow-scores-{scopeId}-*.json` | Deterministic calibration scores (analyst; `RESILIENCE_SHADOW_SCORING=1`) |
| `daily_reports/divergence-{scopeId}-*.json` | Shadow vs agent divergence (`GET /api/report/divergence`, analyst) |
| `daily_reports/epistemic-profile-{scopeId}-*.json` | Epistemic profile snapshot per scope/date |
| `daily_reports/assessment-agent-trace-*.jsonl` | Agent step replay (analyst) |
| `cross-cut-modules/budget/resilience_analysis/token-report-{date}-{scope}.json` | Per-run LLM token/cost rollup (pipeline orchestrator) |
| `business_modules/signals_extraction/data/signals/signals-{type}-*.json` | Extracted signals per source/day (field: `business_modules/visits/data/signals/signals-field-*.json`) |
| `business_modules/news-sites/articles_extracted/` | News markdown exports |
| SQLite `source_archive` | Original source text for chat `get_source` and assess-time RAG |
| SQLite validation queue | Analyst review of extraction quality |

Deploy must include product pages (`cross-cut-modules/docs/content/pages/`) and these data dirs for a functioning operator experience.

---

## Signal catalog evolution (analyst, post-extract)

During **extract**, optional OOV learning capture writes `daily_reports/oov-capture-{date}.jsonl` when `RESILIENCE_OOV_CAPTURE=1` (unknown types, self-check uncertain, zero-signal articles; optional residual observations when `RESILIENCE_RESIDUAL_CAPTURE=1`).

**Module:** `business_modules/signal_catalog_evolution/` — clusters captures, generates gap reports, and stores human-reviewed draft catalog proposals (SQLite `catalog_proposals`). Does **not** change daily scores; OOV/residual may feed **investigation** when Tier 2 flags enabled. Closed catalog is `CATALOG_VERSION` v6 (~165 types) — see [RESILIENCE-ENGINE-REFERENCE.md § Signal catalog v6](./RESILIENCE-ENGINE-REFERENCE.md#signal-catalog-v6).

```bash
npm run signal-catalog-evolution:gap-report
npm run rag:reindex-catalog
```

**API (analyst):** `/api/signal-catalog-evolution/proposals*` — see [COST-CONTROLS.md](./COST-CONTROLS.md).

---

## Related docs

- Operator UI: [SYSTEM-AND-OPERATOR-MODEL.md](./SYSTEM-AND-OPERATOR-MODEL.md)
- Assessment agent + shadow scoring: [RESILIENCE-ENGINE-REFERENCE.md](./RESILIENCE-ENGINE-REFERENCE.md)
- RAG reindex after deploy: [RAG.md](./RAG.md)
- Agent env flags: [docs/MODEL-CARD.md](../MODEL-CARD.md)
