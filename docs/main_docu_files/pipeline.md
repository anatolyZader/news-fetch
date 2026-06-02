# Daily News Resilience Analysis — Pipeline Documentation

**Location:** `docs/main_docu_files/` (canonical main documentation — see [README](./README.md))

> **Deep reference:** For the full 8-component framework, signal catalog (~166 types), scoring math, reliability instruments, UI tiers, and QA harness, see [8-component-analysis-end-to-end.md](./8-component-analysis-end-to-end.md).
>
> **Geographic enrichment:** See [GEOGRAPHIC-ANALYSIS.md](./GEOGRAPHIC-ANALYSIS.md).

**System:** Population Resilience Monitor  
**Framework:** 8-Component Community Resilience (Pikud HaOref / פיקוד העורף)  
**Last updated:** 2026-05-30

---

## Overview

The app produces a **daily 8-component community resilience assessment** for Israeli civilian populations under emergency conditions. Evidence comes from **multiple channels** (news, radio, WhatsApp, field visits, PBO reports, Naftali questionnaires, social OSINT). Each channel is ingested and extracted independently; a combined assessment merges all enabled sources within a configurable date window.

Six report scopes are supported (`--scope` on `assess-signals`, `DistrictScopeSwitcher` in UI):

| Scope | Report prefix | Typical use |
|-------|---------------|-------------|
| **National** | `resilience-report-{date}-{HHMM}` | Country-wide population behavior |
| **North** | `resilience-report-north-{date}-{HHMM}` | Galilee / Golan / northern border belt |
| **South** | `resilience-report-south-{date}-{HHMM}` | Negev / southern districts |
| **Jerusalem** | `resilience-report-jerusalem-{date}-{HHMM}` | Jerusalem area |
| **Dan** | `resilience-report-dan-{date}-{HHMM}` | Tel Aviv metro (Dan) |
| **Haifa** | `resilience-report-haifa-{date}-{HHMM}` | Haifa / Carmel coast |

Regional scopes require resolved geo (or always-in-scope source types) matching the target district. See [GEOGRAPHIC-ANALYSIS.md](./GEOGRAPHIC-ANALYSIS.md) and [8-component doc §12](./8-component-analysis-end-to-end.md#12-geographic-scoping-national--five-regional-districts).

A key design principle: **LLM extracts, code scores**. The LLM finds behavioral evidence and classifies it into a fixed signal vocabulary (`SIGNAL_CATALOG`, ~166 types). A deterministic algorithm maps those signals to component scores — the LLM does not decide the scores.

---

## Two pipeline paths

### Modern multi-source pipeline (production default)

Split into auditable stages so signals are reusable and comparable across days:

```
[Per-source ingest] → signals/signals-{type}-{date}.json
        ↓
[assess-signals.js] → merge + scope filter + deterministic scoring + LLM narrative
        ↓
daily_reports/resilience-report[-{scopeId}]-{date}-{HHMM}.{md,json}
        ↓
validation artifacts (records + review queue)
```

**Stage 1 — extract:** `npm run extract-signals -- --source-type <type> --files … --date YYYY-MM-DD`  
**Stage 2 — assess:** `npm run assess-signals -- --date YYYY-MM-DD --days N [--scope national|north|south|jerusalem|dan|haifa]`

Recommended entry points:

| Entry | What it runs |
|-------|--------------|
| `/8comp-3` | 3-day national window (news, whatsapp, field, PBO, … per config) |
| `/8comp-3-north` | Same + north scope + `social-media:gather-daily` (X + Telegram) |
| `./scripts/daily-pipeline.sh` | Cron-friendly: transcribe → fetch news → extract all sources → assess (3-day) |

### Open observations path (research / catalog learning)

Tabula-rasa extraction does **not** use `SIGNAL_CATALOG` at extract time. Observations are stored under `business_modules/signals_extraction/data/observations-{profile}-{date}.json`. Optional assess maps them to closed types before scoring.

```
[Markdown / document pack] → npm run extract-observations -- --profile exploratory|document_pack …
        ↓
business_modules/signals_extraction/data/observations-*.json
        ↓
npm run assess-signals -- --bundle-source observations [--observations-profile exploratory]
        ↓
daily_reports/resilience-report-… (only observations with valid suggested_catalog_types / nearest_existing_types)
```

Profiles: `exploratory`, `document_pack`, `residual` (zero-signal articles after closed extract when `RESILIENCE_RESIDUAL_CAPTURE=1`). Catalog gap reports merge OOV JSONL + open observations via `catalog-learning:gap-report`. See `business_modules/signals_extraction/README.md`.

Production daily pipeline remains **closed** `extract-signals` → `signals/`.

---

## Source toggles (`pipeline-config.json`)

Each source can be enabled or disabled without code changes:

```json
{
  "sources": {
    "news":     { "enabled": true,  "description": "Homefront news articles" },
    "radio":    { "enabled": false, "description": "Radio broadcast transcripts" },
    "whatsapp": { "enabled": true,  "description": "WhatsApp reports" },
    "field":    { "enabled": false, "description": "Professional squad field visit reports" },
    "pbo":      { "enabled": false, "description": "PBO municipality daily reports" },
    "naftali":  { "enabled": false, "description": "Naftali weekly questionnaire" },
    "social":   { "enabled": true,  "description": "Social media OSINT (X + Telegram)" }
  }
}
```

Both `extract-signals.js` and `assess-signals.js` honour this file for toggled types. Disabled sources exit 0 with a log line (idempotent slash-command runs).

**Not in `pipeline-config.json`:** `pbo_regional` has no enable/disable toggle. Regional PBO signals come from `extract-regional-pbo-signals.js` → `signals/signals-pbo_regional-{date}.json`. `assess-signals.js` always loads matching regional bundles in the date window (not gated by `sources.*.enabled`; always north scope).

---

## Stage 1 — Ingestion (per source)

### News (`source_type: news`)

```bash
npm run homefront-to-md -- YYYY-MM-DD
```

**Entry:** `business_modules/news-sites/input/extract-homefront-articles.js` → `app/extractHomefrontArticles.js`

1. **Fetches** main-news articles from ~30 Israeli outlets via NewsAPI.ai (`infrastructure/adapters/newsApi*Adapter.js`). Date is `Asia/Jerusalem` (`TZ_ARTICLES`).
2. **LLM Haiku pre-filter** on title + short body snippet for population-behavior relevance (not keyword-only). Keywords at `business_modules/social_media/domain/services/homefrontKeywords.js` are auxiliary (social ingest).
3. **Deduplicates** cross-site by first 40 meaningful title chars.
4. **Writes** `business_modules/news-sites/articles_extracted/articles-homefront.md` **and** dated `articles-homefront-{date}.md`. Articles are also persisted to SQLite evidence store when configured.

| Variable | Purpose |
|----------|---------|
| `NEWSAPI_AI_KEY` (or `NEWSAPI_API_KEY`) | NewsAPI.ai authentication |
| `TZ_ARTICLES` | Timezone for "today" (default: `Asia/Jerusalem`) |
| `HOMEFRONT_MD` | Output path (default: `articles_extracted/articles-homefront.md`) |
| `HOMEFRONT_MAX_ARTICLES` | Cap after dedup (default: 300) |

### Radio / audio (`source_type: radio`)

```bash
npm run audio-to-md -- --file <path> --date YYYY-MM-DD --station … --program …
```

Whisper transcription → `articles-audio-{station}-{program}-{date}.md`. Optional `--contextualize` for speaker labels. Scheduled captures land in `business_modules/scheduled_stream_capture/data/`; daily pipeline runs `scripts/radio-transcribe.sh` for missing transcripts.

### WhatsApp (`source_type: whatsapp`)

```bash
npm run whatsapp-to-md -- --date YYYY-MM-DD
```

Export → `business_modules/whatsapp/reports/whatsapp_reports-{date}.md`. Live webhook ingest also available (`webhook-routes.js` + `whatsappIngestService.js`). Always counted as north scope. Geo attached via `IGeoEnrichmentPort` (see geographic doc).

**Webhook routing (live ingest):**

| Channel | Flow |
|---------|------|
| **Group** | One-shot resilience extract + Hebrew reply via `whatsappResilienceAnalyzer.js` |
| **DM** | Adaptive chatbot: conversation state machine → `gapEngine` (missing evidence) → draft → user confirm → `reportBuildService.recompute()` → signal extraction on approval. See `business_modules/whatsapp/domain/conversation/` and `whatsappIngestService.js` |

### Field reports (`source_type: field`)

Markdown bundles at `business_modules/visits/data/articles-field-reports-{date}.md` — professional visit notes. Signals written to `business_modules/visits/data/signals/signals-field-{date}.json`. Always north scope.

### PBO municipality (`source_type: pbo`)

```bash
node business_modules/pbo_report_muni/input/extract-pbo-signals.js
```

Excel `north_<day>_4.xlsx` → `signals/signals-pbo-{date}.json` (structured conversion, no extraction LLM).

### PBO municipal completeness review (`pbo_report_review`)

Runs **before** PBO signal extraction in the daily pipeline (step 7b). Not a signal source — operational follow-up on missing/incomplete municipal Excel reports.

```bash
node business_modules/pbo_report_review/input/runMunicipalPboReview.js --date YYYY-MM-DD [--force] [--dry-run]
```

**Module:** `business_modules/pbo_report_review/`

| Step | What happens |
|------|--------------|
| Gap detection | Compare expected municipalities vs received Excel for the date |
| Officer directory | Match gaps to contacts in `data/officers.json` |
| Follow-up email | Resend outbound when configured; parse inbound replies |
| UI | PBO reports → **Local** sub-tab (`MunicipalitiesTab`) — review status, reply thread (`PboMunicipalReviewPanel.jsx`) |

**API:** `GET /api/pbo/municipal-reviews`, `GET/POST /api/pbo/municipal-reviews/{date}/{municipality}/*`, `POST /api/pbo/review/inbound-email`

### PBO regional (`source_type: pbo_regional`)

```bash
node business_modules/pbo_report_regional/input/extract-regional-pbo-signals.js --files … --date YYYY-MM-DD
```

Per-cluster markdown/Excel under `pbo_report_regional/data/`. Always north scope.

### Naftali questionnaire (`source_type: naftali`)

```bash
node business_modules/pool/input/extract-naftali-signals.js
```

Weekly Excel → `signals/signals-naftali-{week-end-date}.json`. Module lives under `business_modules/pool/`.

### Social OSINT — X + Telegram (`source_type: social`)

```bash
npm run social-media:gather-daily -- --date YYYY-MM-DD --days 3 [--north] [--execute]
npm run social-media:treat -- --date YYYY-MM-DD   # usually auto-run by gather-daily
```

**Module:** `business_modules/social_media/`

| Step | What happens |
|------|--------------|
| X gather | Cluster queries (`xHomefrontClusterQueries.js`) — clusters A/B × langs `he`/`ar`/`ru`; count-then-search slots with cost cap; optional `--north` adds locality clauses |
| Telegram gather | MTProto client → public channels (`telegram-public-channels.json`) → raw JSONL → same classify path |
| Classify | Haiku classifier; optional few-shot RAG from `social_examples` when `SOCIAL_CLASSIFY_RAG_ENABLED` |
| Treat | `findings[]` → resilience `signals[]` via `findingToSignalMapper.js` |
| Output | `business_modules/social_media/data/signals-social-{date}.json`, `social-osint-report-{date}.md` |

**UI:** Social media tab (Daily feed + Topic search). **Assessment:** `assess-signals.js` loads `signals-social-*.json` when `social` is enabled.

| Variable | Purpose |
|----------|---------|
| `X_BEARER_TOKEN` | X API v2 |
| `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_SESSION` | Telegram MTProto |
| `ANTHROPIC_API_KEY` | Haiku classifier in gather-daily |
| `SOCIAL_CLASSIFY_RAG_ENABLED` | Few-shot examples from `social_examples` RAG index |

One-time Telegram setup: `npm run social-media:telegram-session`

### Survey (one-off, not daily pipeline)

```bash
npm run analyze-survey -- --file <excel> …
```

Municipality survey Excel → separate report with geo enrichment. See resilience `surveyReportWriter.js`.

---

## Stage 2 — Signal extraction (`extract-signals.js`)

```bash
npm run extract-signals -- --source-type news --files articles-homefront-2026-05-23.md --date 2026-05-23
```

**Core:** `business_modules/resilience/infrastructure/claudeExtraction.js` (barrel re-export: [`claudeEvaluator.js`](../../business_modules/resilience/infrastructure/claudeEvaluator.js))

| Feature | Detail |
|---------|--------|
| Model | `claude-haiku-4-5-20251001` |
| Vocabulary | ~166 closed `signal_type` values in `SIGNAL_CATALOG` (`domain/services/signalCatalog.js`) |
| Multipass | 3 grouped Haiku passes + 4th self-check pass (`RESILIENCE_EXTRACT_MULTIPASS=0` to disable) |
| Verification | N-gram evidence containment; optional embedding rescue (`RESILIENCE_EMBEDDING_VERIFY=1`) |
| Archive + RAG | Upserts to SQLite `source_archive` via [`db/source_archive/`](../../db/source_archive/createSourceArchive.js) and indexes `rag_chunks` when `RESILIENCE_EXTRACT_RAG_ENABLED` (follows `RAG_PIPELINE_ENABLED`) |
| Output | `signals/signals-{type}-{date}.json` (+ field/social paths as above) |
| Geo | Always attaches `geo` via `enrichSignalsWithGeo` → `localityCandidate` → `geoService` (written to signal JSON) |

Full signal schema, domain groups, and source-specific prompts: [8-component doc §6](./8-component-analysis-end-to-end.md#6-stage-2--signal-extraction-llm-closed-vocabulary).

---

## Stage 3 — Combined assessment (`assess-signals.js`)

```bash
npm run assess-signals -- --date 2026-05-23 --days 3 --scope national
npm run assess-signals -- --date 2026-05-23 --days 3 --scope north
```

**What it does:**

1. Discovers signal JSON for all **enabled** sources within `{date, date−1, …}` (up to `--days`, max 14).
2. Merges **connectivity probe** signals from `business_modules/resilience/data/connectivity-probes/` (`source_type: infrastructure_probe`; CLI: `ingest-connectivity-probes.js`).
3. Applies **temporal weights** (T=1.0, T−1=0.85, T−2=0.70, then geometric decay to floor 0.50 for older days in the window).
4. **Within-source dedup** and **cross-source dedup** on `(signal_type | source | evidence)`.
5. Re-attaches **geo** to any signal still missing it; applies **regional scope filter** when `--scope` is a district id (`filterSignalsForScope` → per-signal `scopeDecision`).
6. **Epistemic partition** (`evidenceEligibility.js`): separates metrics-eligible signals from context-only / macro bucket under `RESILIENCE_EPISTEMIC_GEO_V2` (default on).
7. **Deterministic scoring** via `scoreComponents()` — sigmoid to 1–10, bootstrap CI, counterfactual, EWMA, polarization, facets.
8. **Social channel quarantine** — flags suspicious social clusters for analyst confirm/dismiss via validation review (`confirm_social_quarantine` / `dismiss_social_quarantine`).
9. **LLM narrative** (Sonnet) — writes behavioral text only; does not re-score.
10. Writes `daily_reports/resilience-report[-{scopeId}]-{date}-{HHMM}.{md,json}` (+ `-brief.md` for operators).
11. Runs **validation collection** (SQLite queue + JSONL artifacts; see below).
12. Emits **methodology** (`assessment.methodology`, phase `multi_district_phase2`) — epistemic scope counts, `scope_decision_summary`, optional advisory `tuning_proposal`.
13. Computes **data void index** (`assessment.data_void`) when digital channels drop while field/PBO remain active.
14. Counts **OOV captures** for the run date (`daily_reports/oov-capture-{date}.jsonl` when `RESILIENCE_OOV_CAPTURE=1`).

**Display tiers:** operator API/UI omits headline 1–10 scores by default; analysts use `?view=analyst` when `canViewAnalystDisplay(email)` is true (`config/userAccess.json` levels `analyst`/`maintainer`, or env `RESILIENCE_ANALYST_EMAILS` / `RESILIENCE_MAINTAINER_EMAILS`). See [8-component doc §11.2](./8-component-analysis-end-to-end.md#112-display-tiers-operator-vs-analyst).

| Variable | Purpose |
|----------|---------|
| `RESILIENCE_COST_CAP_USD` | Per-run LLM cost cap (default $3) |
| `RESILIENCE_EPISTEMIC_GEO_V2` | Excludes `text_inferred` geo and `usableForMetrics: false` from component scoring (default on) |
| `RESILIENCE_DATA_VOID` | Data void / digital darkness index (default on) |
| `RESILIENCE_OOV_CAPTURE` | Log unknown types, self-check uncertain, zero-signal articles (default on) |

---

## Catalog learning & OOV capture (analyst tooling)

During **extract**, optional learning capture writes JSONL under `daily_reports/` (kinds: unknown signal types, self-check uncertain, zero-signal articles; optional residual observations when `RESILIENCE_RESIDUAL_CAPTURE=1`).

**Gap report** — clusters recent captures for catalog expansion review:

```bash
npm run catalog-learning:gap-report
# optional: --days 14 --out daily_reports/catalog-gap-report.md
npm run rag:reindex-catalog
```

**HTTP API** (analyst-only): `GET /api/catalog-learning/proposals`, `GET …/proposals/:id`, `POST …/proposals/generate`, `POST …/proposals/:id/review` — [`catalogLearningRoutes.js`](../../business_modules/catalogLearning/input/catalogLearningRoutes.js).

**UI:** `CatalogProposalPanel` embedded in analyst Report view (`ReportView.jsx`).

**Module:** `business_modules/catalogLearning/` (`catalogLearningService`, `catalogProposalService`, SQLite store `catalogProposalSqliteStore.js`). Shared capture kinds live in `cross-cut-modules/learningCapture/`. Extraction hooks: `resilience/infrastructure/learningCapture.js` + `domain/services/oovCapture.js`. Cluster digest CLI: `validation/scripts/oovClusterDigest.js`.

Does not change daily scores — feeds analyst review of the closed `SIGNAL_CATALOG` vocabulary.

---

## Validation collection (post-assess)

Automatically invoked at the end of every `assess-signals` run.

**Module:** `business_modules/resilience/validation/`  
**Config:** `business_modules/resilience/validation/validation-config.json`

| Phase | Meaning |
|-------|---------|
| `baseline` | Peacetime shadow collection (default) |
| `elevated` | Crisis volume — active collection |
| `acute` | High-intensity crisis |

```bash
npm run validation:status
npm run validation:set-phase -- elevated [--note "…"]
```

**Artifacts** (default: `business_modules/resilience/validation/artifacts/`):

| Path | Content |
|------|---------|
| `records/{date}-{scope}.json` | Daily immutable validation record |
| `review-queue/{date}-{scope}.jsonl` | Up to 15 flagged articles/day (export mirror) |
| `phase-log/phase-changes.jsonl` | Manual phase transitions |

**SQLite review queue (default):** `ValidationReviewSqliteStore` wired in `app.js` when `VALIDATION_REVIEW_SQLITE !== '0'`. Upserts queue items on every assess run. Analyst UI: `ValidationReviewPanel` with list/detail/decision plus RAG **context**, Haiku **explain**, and multi-turn **agent** investigate routes — see [AGENTIC_MECHANISMS.md](./AGENTIC_MECHANISMS.md).

Acceptance tiers are defined in config: **CI** golden corpus enforces `micro_F1 ≥ 0.55` / `macro_κ ≥ 0.40` in tests; **operational tier 2** in config targets `0.65` / `0.5` once hand-reviewed articles exist.

---

## Search trends (UI module, separate from assessment)

**Module:** `business_modules/search_trends/`  
**Tab:** Trends (main nav)

Google Trends–style interest dashboards for **six districts** (national + five regional) × 1/3/7-day windows. DataForSEO primary, `google-trends-api` fallback, 6-hour file cache.

```bash
npm run trends:warm-cache
```

API: `GET /api/search-trends/dashboard?district=&days=&refresh=1`

Does **not** feed the 8-component scoring pipeline directly — operational context for officers.

---

## Daily automation (`scripts/daily-pipeline.sh`)

```bash
./scripts/daily-pipeline.sh              # full pipeline
./scripts/daily-pipeline.sh --no-transcribe
```

Steps (last 3 calendar days):

1. Transcribe missing radio recordings (`radio-transcribe.sh`)
2. Fetch news per day (`homefront-to-md`)
3. Extract news signals
4. Extract radio signals
5. WhatsApp export + extract
6. Field report extract (last 3 files)
7b. Municipal PBO completeness review + follow-up email (`runMunicipalPboReview.js`)
7. PBO municipality extract
8. Regional PBO extract
9. Naftali extract
10. Combined assessment (`assess-signals --days 3`)

Social OSINT is **not** in this shell script — run via `/8comp-3-north` or `social-media:gather-daily` separately.

---

## Report outputs

| File | Audience |
|------|----------|
| `daily_reports/resilience-report-{date}-{HHMM}.md` | Full markdown (analyst) |
| `daily_reports/resilience-report-{date}-{HHMM}.json` | Structured data + API |
| `daily_reports/resilience-report-{date}-{HHMM}-brief.md` | Operator brief (no numeric scores) |
| `daily_reports/resilience-report-{scopeId}-{date}-{HHMM}.*` | Regional scope variants (`north`, `south`, `jerusalem`, `dan`, `haifa`) |

JSON includes: all scores, narratives, manifestations, signal appendix with URLs, methodology block, geo reference versions, reliability instruments per component.

---

## Web UI and API

Navigation splits **Daily Assessment** (the 8-component report) from **data-source review** tabs via `DataSourcesNav` in `client/src/MainApp.jsx`.

| Tab / endpoint | Role |
|----------------|------|
| **Daily Assessment** | Latest assessment (`GET /api/report/today?scope=&view=operator`); `DistrictScopeSwitcher` — scopes: `national \| north \| south \| jerusalem \| dan \| haifa`. Operator tier in main app; allowlisted users link to **analyst-site** for full scores + validation review |
| **Report (analyst-site)** | Full analyst Report (`analyst-site/src/AnalystApp.jsx`): scores, drift sparklines, `ValidationReviewPanel`, `CatalogProposalPanel`, `OovAnomalyClustersPanel`; scopes via `DistrictScopeSwitcher` |
| **News** | Ingest review — homefront article exports (`GET /api/news-sites`, `GET /api/news-sites/daily?date=`) |
| **Radio** | Ingest review — Whisper transcripts (`GET /api/radio`, `GET /api/radio/daily?date=`) |
| **Social media** | Daily OSINT feed + topic fetch |
| **Trends** | Search interest dashboards |
| **Visits** | Field report dashboard |
| **PBO reports** | Municipality/regional PBO views (local + regional sub-tabs) |
| **Pools** | Naftali questionnaire + Education sessions |
| **Report bot** | Manual report submission tab |

**Desktop panel popups** (footer / chat launcher; `client/src/lib/panelPopup.js`):

| Popup | API / module | Role |
|-------|--------------|------|
| **Chat** | Session APIs + `POST /api/chat` (SSE), `POST /api/chat/confirm-action`, `business_modules/chat/` | Evidence-aware assistant scoped to current report |
| **Write Report** | `POST /api/report-build/start`, `/turn`, `/suggest`, `/confirm`, `/cancel`, `business_modules/report_build/` | Guided report drafting with locality picker; Tier 4 RAG at draft time |
| **Docs panel** | `GET /api/docs/search`, in-app `DocsPanel` | Tier 5 product-docs RAG (`docs` namespace); run `npm run rag:reindex-docs` after `docs:sync` on deploy |
| **Social gather** | `social-media:gather-daily` | Haiku classify; optional few-shot RAG (`rag:reindex-social-examples`) |
| **Audio contextualize** | `audio-to-md --contextualize` | Prior radio-scene RAG when `AUDIO_CONTEXTUALIZER_RAG_ENABLED` |
| **Send Data** | Evidence upload flow | Submit new source material |
| **Settings** | `GET /api/mail/preferences`, `business_modules/mailing/` | Mailing preferences and digest config |

News and Radio tabs show a banner when the source is disabled in `pipeline-config.json` (existing exports remain visible for review).

Regional scope in UI requires a matching report artifact (`resilience-report-{scopeId}-*`) — otherwise API returns `hint: regional_requires_assess_signals` (expected until `assess-signals --scope <id>` has been run for that district).

---

## Cost and safety controls

| Control | Value / behavior |
|---------|------------------|
| Cost cap | $3.00 per assess run (`RESILIENCE_COST_CAP_USD`) |
| Haiku retries | Up to 3 attempts, 3/6/9s backoff |
| Sonnet retries | Up to 3 attempts, 5/10/15s backoff |
| Partial recovery | Truncated Haiku JSON salvaged when possible |
| Unknown signal types | Dropped with warning — no score corruption |

Typical single-source extract + assess run: ~$0.18–0.26 for news-only. Multi-source runs scale with enabled sources and window size.

---

## File map

```
business_modules/news-sites/
  input/extract-homefront-articles.js     News fetch + LLM filter
  input/newsSitesRoutes.js                GET /api/news-sites/*
  app/newsSitesService.js                 Dashboard + daily feed
  articles_extracted/articles-homefront-{date}.md

business_modules/audio/
  input/audio-to-md.js                    Whisper transcription CLI
  input/radioRoutes.js                    GET /api/radio/*
  app/audioEvidenceIngestService.js       Transcript feed reader

cross-cut-modules/geo/
  createGeoWiring.js                      Composition factory (overrides + unknown SQLite/JSONL sinks)
  enrichSignalsWithGeo.js                 Pipeline geo attach
  geoEnvelopeAccess.js                    v3 nested envelope read helpers

business_modules/resilience/
  input/extract-signals.js                Stage 1: per-source extraction
  input/assess-signals.js                 Stage 2: merge + score + narrate
  input/ingest-connectivity-probes.js     Probe JSON/JSONL → assess merge
  validation/                             Post-assess calibration + SQLite review queue
  domain/services/behaviorSignals.js      Scoring + SIGNAL_TO_COMPONENTS
  domain/services/dataVoidIndex.js        Digital darkness / data void index
  domain/services/oovCapture.js           OOV + learning-capture buffer
  infrastructure/claudeExtraction.js      LLM signal extraction (barrel: claudeEvaluator.js)
  infrastructure/claudeNarratives.js      Sonnet narrative synthesis
  infrastructure/learningCapture.js       Residual / zero-signal capture hooks

business_modules/catalogLearning/
  input/generate-gap-report.js            npm run catalog-learning:gap-report
  input/catalogLearningRoutes.js          GET/POST /api/catalog-learning/proposals/*
  infrastructure/adapters/catalogProposalSqliteStore.js

business_modules/report_build/
  input/reportBuildRoutes.js              POST /api/report-build/start|turn|suggest|confirm|cancel

business_modules/geo/
  infrastructure/adapters/geoUnknownSqliteQueueAdapter.js
  input/geoRoutes.js                      GET /api/geo/* (resolve, localities, unknown-queue)

business_modules/pbo_report_regional/
  input/extract-regional-pbo-signals.js   → signals-pbo_regional-{date}.json

business_modules/pbo_report_review/
  input/runMunicipalPboReview.js          Daily step 7b — completeness + follow-up
  input/pboReviewRoutes.js                GET/POST /api/pbo/municipal-reviews/*

business_modules/social_media/
  input/socialMediaInput.js               gather-daily | treat | init
  data/signals-social-{date}.json         OSINT bundle (findings + signals)

business_modules/search_trends/           Trends tab (not in assess pipeline)

signals/
  signals-{news,radio,whatsapp,pbo,pbo_regional,naftali}-{date}.json

scripts/daily-pipeline.sh                 Cron-friendly multi-source runner
pipeline-config.json                      Source enable/disable toggles

.claude/commands/
  8comp-3.md, 8comp-3-north.md            Recommended daily runbooks
  analyze-news.md                         Legacy news-only shortcut (not production default)
```

---

## Design principles

1. **LLM extracts, code scores.** Scoring is deterministic and auditable.
2. **Closed vocabulary.** ~166 fixed signal types; trends comparable across days.
3. **Behavioral signals only.** Concrete quotes, actions, or statistics — not journalist characterizations.
4. **Atomic signals.** One signal = one behavioral fact.
5. **Many-to-many mapping.** One signal can affect multiple components.
6. **Absence is explicit.** Reports list manifestations with no evidence today.
7. **Provenance everywhere.** Every signal links back to source URL or report identifier.
8. **Auditable stages.** Intermediate signal JSON enables replay, QA, and validation review queues.

---

## Related documentation

| Document | Covers |
|----------|--------|
| [8-component-analysis-end-to-end.md](./8-component-analysis-end-to-end.md) | Full framework, scoring math, reliability instruments, QA, UI reading guide |
| [GEOGRAPHIC-ANALYSIS.md](./GEOGRAPHIC-ANALYSIS.md) | Geo envelope, north scoping, reference data |
| [MODEL-CARD.md](../MODEL-CARD.md) | Operator instruments, epistemic tiers, feature flags |
| [README](./README.md) | Index of main docs + auto-sync markers |
