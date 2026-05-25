# Daily News Resilience Analysis — Pipeline Documentation

**Location:** `docs/main_docu_files/` (canonical main documentation — see [README](./README.md))

> **Deep reference:** For the full 8-component framework, signal catalog (~165 types), scoring math, reliability instruments, UI tiers, and QA harness, see [8-component-analysis-end-to-end.md](./8-component-analysis-end-to-end.md).
>
> **Geographic enrichment:** See [GEOGRAPHIC-ANALYSIS.md](./GEOGRAPHIC-ANALYSIS.md).

**System:** Population Resilience Monitor  
**Framework:** 8-Component Community Resilience (Pikud HaOref / פיקוד העורף)  
**Last updated:** 2026-05-25

---

## Overview

The app produces a **daily 8-component community resilience assessment** for Israeli civilian populations under emergency conditions. Evidence comes from **multiple channels** (news, radio, WhatsApp, field visits, PBO reports, Naftali questionnaires, social OSINT). Each channel is ingested and extracted independently; a combined assessment merges all enabled sources within a configurable date window.

Two scopes are supported:

| Scope | Report prefix | Typical use |
|-------|---------------|-------------|
| **National** | `resilience-report-{date}-{HHMM}` | Country-wide population behavior |
| **North** | `resilience-report-north-{date}-{HHMM}` | Galilee / Golan / northern border belt |

A key design principle: **LLM extracts, code scores**. The LLM finds behavioral evidence and classifies it into a fixed signal vocabulary (`SIGNAL_CATALOG`, ~165 types). A deterministic algorithm maps those signals to component scores — the LLM does not decide the scores.

---

## Two pipeline paths

### Modern multi-source pipeline (production default)

Split into auditable stages so signals are reusable and comparable across days:

```
[Per-source ingest] → signals/signals-{type}-{date}.json
        ↓
[assess-signals.js] → merge + scope filter + deterministic scoring + LLM narrative
        ↓
reports/resilience-report[-north]-{date}-{HHMM}.{md,json}
        ↓
validation artifacts (records + review queue)
```

**Stage 1 — extract:** `npm run extract-signals -- --source-type <type> --files … --date YYYY-MM-DD`  
**Stage 2 — assess:** `npm run assess-signals -- --date YYYY-MM-DD --days N [--scope national|north]`

Recommended entry points:

| Entry | What it runs |
|-------|--------------|
| `/8comp-3` | 3-day national window (news, whatsapp, field, PBO, … per config) |
| `/8comp-3-north` | Same + north scope + `social-media:gather-daily` (X + Telegram) |
| `./scripts/daily-pipeline.sh` | Cron-friendly: transcribe → fetch news → extract all sources → assess (3-day) |

### Legacy news-only path (still supported)

Single-shot analysis from one markdown file — no intermediate signal JSON, no multi-source merge, no validation collection:

```bash
npm run homefront-to-md
npm run analyze-resilience -- --date YYYY-MM-DD
```

Also used by `POST /api/analyze` (SSE maintainer trigger). Prefer `assess-signals` for production daily reports.

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

Whisper transcription → `articles-audio-{station}-{program}-{date}.md`. Optional `--contextualize` for speaker labels. Daily pipeline runs `scripts/radio-transcribe.sh` for missing recordings.

### WhatsApp (`source_type: whatsapp`)

```bash
npm run whatsapp-to-md -- --date YYYY-MM-DD
```

Export → `business_modules/whatsapp/reports/whatsapp_reports-{date}.md`. Live webhook ingest also available. Always counted as north scope. Geo attached via `IGeoEnrichmentPort` (see geographic doc).

### Field reports (`source_type: field`)

Markdown bundles at `business_modules/visits/data/articles-field-reports-{date}.md` — professional visit notes. Signals written to `business_modules/visits/data/signals/signals-field-{date}.json`. Always north scope.

### PBO municipality (`source_type: pbo`)

```bash
node business_modules/pbo_report_muni/input/extract-pbo-signals.js
```

Excel `north_<day>_4.xlsx` → `signals/signals-pbo-{date}.json` (structured conversion, no extraction LLM).

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
| X gather | Cluster queries (`xHomefrontClusterQueries.js`) → counts + search → raw JSON → behavior filter → Haiku classifier |
| Telegram gather | MTProto client → public channels (`telegram-public-channels.json`) → raw JSONL → same classify path |
| Treat | `findings[]` → resilience `signals[]` via `findingToSignalMapper.js` |
| Output | `business_modules/social_media/data/signals-social-{date}.json`, `social-osint-report-{date}.md` |

**UI:** Social media tab (Daily feed + Topic search). **Assessment:** `assess-signals.js` loads `signals-social-*.json` when `social` is enabled.

| Variable | Purpose |
|----------|---------|
| `X_BEARER_TOKEN` | X API v2 |
| `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_SESSION` | Telegram MTProto |
| `ANTHROPIC_API_KEY` | Haiku classifier in gather-daily |

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

**Core:** `business_modules/resilience/infrastructure/claudeEvaluator.js`

| Feature | Detail |
|---------|--------|
| Model | `claude-haiku-4-5-20251001` |
| Vocabulary | ~165 closed `signal_type` values in `SIGNAL_CATALOG` (`domain/services/signalCatalog.js`) |
| Multipass | 3 grouped Haiku passes + 4th self-check pass (`RESILIENCE_EXTRACT_MULTIPASS=0` to disable) |
| Verification | N-gram evidence containment; optional embedding rescue (`RESILIENCE_EMBEDDING_VERIFY=1`) |
| Output | `signals/signals-{type}-{date}.json` (+ field/social paths as above) |
| Geo | Set `GEO_ATTACH_ON_EXTRACT=1` to persist `geo` on written signal files |

Full signal schema, domain groups, and source-specific prompts: [8-component doc §6](./8-component-analysis-end-to-end.md#6-stage-2--signal-extraction-llm-closed-vocabulary).

---

## Stage 3 — Combined assessment (`assess-signals.js`)

```bash
npm run assess-signals -- --date 2026-05-23 --days 3 --scope national
npm run assess-signals -- --date 2026-05-23 --days 3 --scope north
```

**What it does:**

1. Discovers signal JSON for all **enabled** sources within `{date, date−1, …}` (up to `--days`, max 14).
2. Applies **temporal weights** (T=1.0, T−1=0.85, T−2=0.70, then geometric decay to floor 0.50 for older days in the window).
3. **Within-source dedup** and **cross-source dedup** on `(signal_type | source | evidence)`.
4. Attaches **geo** to news/radio signals; applies **north scope filter** when `--scope north`.
5. **Deterministic scoring** via `scoreComponents()` — sigmoid to 1–10, bootstrap CI, counterfactual, EWMA, polarization, facets.
6. **LLM narrative** (Sonnet) — writes behavioral text only; does not re-score.
7. Writes `reports/resilience-report[-north]-{date}-{HHMM}.{md,json}` (+ `-brief.md` for operators).
8. Runs **validation collection** (see below).
9. Emits **methodology** (`assessment.methodology`) — epistemic scope counts, scope-decision summary, optional advisory `tuning_proposal` from `suggest-tuning` history.
10. Computes **data void index** (`assessment.data_void`) when digital channels drop while field/PBO remain active (`dataVoidIndex.js`; disable with `RESILIENCE_DATA_VOID=0`).
11. Counts **OOV captures** for the run date (`reports/oov-capture-{date}.jsonl` when `RESILIENCE_OOV_CAPTURE=1`).

**Display tiers:** operator API/UI omits headline 1–10 scores by default; analysts use `?view=analyst` when allowlisted (`RESILIENCE_ANALYST_EMAILS`). See [8-component doc §11.2](./8-component-analysis-end-to-end.md#112-display-tiers-operator-vs-analyst).

| Variable | Purpose |
|----------|---------|
| `RESILIENCE_COST_CAP_USD` | Per-run LLM cost cap (default $3) |
| `RESILIENCE_ANALYST_EMAILS` | Comma-separated emails for analyst-tier API/UI |
| `RESILIENCE_EPISTEMIC_GEO_V2` | Geo-first north scope; keyword fallback excluded from metrics (default on) |
| `RESILIENCE_DATA_VOID` | Data void / digital darkness index (default on) |
| `RESILIENCE_OOV_CAPTURE` | Log unknown types, self-check uncertain, zero-signal articles (default on) |

---

## Catalog learning & OOV capture (analyst tooling)

During **extract**, optional learning capture writes JSONL under `reports/` (kinds: unknown signal types, self-check uncertain, zero-signal articles; optional residual observations when `RESILIENCE_RESIDUAL_CAPTURE=1`).

**Gap report** — clusters recent captures for catalog expansion review:

```bash
npm run catalog-learning:gap-report
# optional: --days 14 --out reports/catalog-gap-report.md
```

**Module:** `business_modules/catalogLearning/` (`catalogLearningService`, `learningCaptureFsAdapter`). Shared capture kinds live in `cross-cut-modules/learningCapture/`. Extraction hooks: `resilience/infrastructure/learningCapture.js` + `domain/services/oovCapture.js`. Cluster digest CLI: `validation/scripts/oovClusterDigest.js`.

Does not change daily scores — feeds analyst review of the closed `SIGNAL_CATALOG` vocabulary.

---

## Validation collection (post-assess)

Automatically invoked at the end of every `assess-signals` run (not legacy `analyze-resilience`).

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
| `review-queue/{date}-{scope}.jsonl` | Up to 15 flagged articles/day for expert review |
| `phase-log/phase-changes.jsonl` | Manual phase transitions |

Acceptance tiers are defined in config: **CI** golden corpus enforces `micro_F1 ≥ 0.55` / `macro_κ ≥ 0.40` in tests; **operational tier 2** in config targets `0.65` / `0.5` once hand-reviewed articles exist. No dedicated UI tab — CLI + artifact files.

---

## Search trends (UI module, separate from assessment)

**Module:** `business_modules/search_trends/`  
**Tab:** Trends (main nav)

Google Trends–style interest dashboards for 8 Israel districts × 1/3/7-day windows. DataForSEO primary, `google-trends-api` fallback, 6-hour file cache.

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
7. PBO municipality extract
8. Regional PBO extract
9. Naftali extract
10. Combined assessment (`assess-signals --days 3`)

Social OSINT is **not** in this shell script — run via `/8comp-3-north` or `social-media:gather-daily` separately.

---

## Report outputs

| File | Audience |
|------|----------|
| `reports/resilience-report-{date}-{HHMM}.md` | Full markdown (analyst) |
| `reports/resilience-report-{date}-{HHMM}.json` | Structured data + API |
| `reports/resilience-report-{date}-{HHMM}-brief.md` | Operator brief (no numeric scores) |
| `reports/resilience-report-north-{date}-{HHMM}.*` | North scope variants |

JSON includes: all scores, narratives, manifestations, signal appendix with URLs, methodology block, geo reference versions, reliability instruments per component.

---

## Web UI and API

| Tab / endpoint | Role |
|----------------|------|
| **Report** | Latest assessment (`GET /api/report/today?scope=&view=operator\|analyst`) |
| **Report (analyst)** | Per-component **score sparklines** via `GET /api/resilience/drift` (embedded in Report cards; not a separate nav tab) |
| **Social media** | Daily OSINT feed + topic fetch |
| **Trends** | Search interest dashboards |
| **Visits** | Field report dashboard |
| **PBO reports** | Municipality/regional PBO views |

North scope in UI requires a north report artifact — otherwise API returns `hint: north_requires_assess_signals` (expected until `/8comp-3-north` has been run).

---

## Cost and safety controls

| Control | Value / behavior |
|---------|------------------|
| Cost cap | $3.00 per assess run (`RESILIENCE_COST_CAP_USD`) |
| Haiku retries | Up to 3 attempts, 3/6/9s backoff |
| Sonnet retries | Up to 3 attempts, 5/10/15s backoff |
| Partial recovery | Truncated Haiku JSON salvaged when possible |
| Unknown signal types | Dropped with warning — no score corruption |

Typical legacy news-only run (`analyze-resilience`): ~$0.18–0.26. Multi-source runs scale with enabled sources and window size.

---

## File map

```
business_modules/news-sites/
  input/extract-homefront-articles.js     News fetch + LLM filter
  articles_extracted/articles-homefront-{date}.md

business_modules/resilience/
  input/extract-signals.js                Stage 1: per-source extraction
  input/assess-signals.js                 Stage 2: merge + score + narrate
  input/analyze-resilience.js             Legacy all-in-one (news/audio)
  validation/                             Post-assess calibration collection
  domain/services/behaviorSignals.js      Scoring + SIGNAL_TO_COMPONENTS
  domain/services/dataVoidIndex.js        Digital darkness / data void index
  domain/services/oovCapture.js           OOV + learning-capture buffer
  infrastructure/claudeEvaluator.js       LLM extraction + narratives
  infrastructure/learningCapture.js       Residual / zero-signal capture hooks

business_modules/catalogLearning/
  input/generate-gap-report.js            npm run catalog-learning:gap-report

business_modules/pbo_report_regional/
  input/extract-regional-pbo-signals.js   → signals-pbo_regional-{date}.json

business_modules/geo/                     Reference data + IGeoEnrichmentPort impl

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
  analyze-news.md                         Legacy news-only shortcut
```

---

## Design principles

1. **LLM extracts, code scores.** Scoring is deterministic and auditable.
2. **Closed vocabulary.** ~165 fixed signal types; trends comparable across days.
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
