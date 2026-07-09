# 03 - Data Sources and Geography

## What this answers

- Every **data source** the system ingests and how each becomes pipeline input.
- How the **northern district** is modeled geographically.
- How a report is **scoped** to the district (vs national), and how signals are filtered.

## 1. Context recap

The system serves a **district population-behavior officer** in the **northern district**. Its job is to fuse many heterogeneous district sources into evidence the officer can read. Each source has its own native form (article JSON, audio, chat export, spreadsheet, questionnaire) and is normalized into either a **markdown corpus** (for LLM extraction) or a **pre-built signal/observation bundle** before entering the dual-path pipeline (see file 02).

## 2. Sources and ingestion

Ingestion services are wired in `composition/registerIngestion.js`. The npm-script-to-module map is in `scripts/agent-routing.md`.

| Source | npm / entry | Native form | Intermediate artifact | Signal output |
|--------|-------------|-------------|------------------------|---------------|
| **Homefront news** | `homefront-to-md` -> `business_modules/news-sites/input/extract-homefront-articles.js` | NewsAPI article JSON | `business_modules/news-sites/articles_extracted/articles-homefront-{date}.md` | `signals-news-{date}.json` |
| **News fetch** | `articles-to-md` -> `business_modules/news-sites/input/fetch-articles-to-md.js` | API JSON | dated articles markdown | feeds homefront extract |
| **Radio / audio** | `audio-to-md` -> `business_modules/audio/input/audio-to-md.js` | mp3/mp4 | `articles-audio-{station}-{date}T{HH-MM}.md` | `signals-radio-{date}.json` |
| **Radio capture (scheduled)** | `radio:setup`, `capture:*` -> `business_modules/radio/input/setup-tzafon.js`, `business_modules/scheduled_stream_capture/input/` | live stream | auto-captured -> transcribed markdown | radio signals |
| **Video** | `youtube-to-md`, `video-grab-url` -> `business_modules/video/input/` | video URL | audio-style markdown | via radio extract |
| **WhatsApp** | `whatsapp-to-md` -> `business_modules/whatsapp/input/whatsapp-to-md.js` | group export | `business_modules/whatsapp/reports/whatsapp_reports-{date}.md` | `signals-whatsapp-{date}.json` |
| **Social OSINT** | `social-media:gather-daily`, `:treat` -> `business_modules/social_media/input/socialMediaInput.js` | social posts | JSON bundle (no markdown) | `business_modules/social_media/data/signals-social-{date}.json` (`findings[]` -> `signals[]`) |
| **Field visits** | `ingest-field-reports` -> `business_modules/visits/input/visitsInput.js` | Hebrew visit notes (.xlsx) | `business_modules/visits/data/articles-field-reports-{date}.md` | `business_modules/visits/data/signals/signals-field-{date}.json` |
| **PBO municipal** | pipeline step -> `business_modules/pbo_report_muni/input/extract-pbo-signals.js` | Excel dashboards (verbal text columns + review follow-up only; numeric scores not analyzed) | text units from Excel | `signals-pbo-{date}.json` + `observations-pipeline-pbo-{date}.json` (LLM dual-path) |
| **PBO regional** | pipeline step -> `business_modules/pbo_report_regional/input/extract-regional-pbo-signals.js` | Excel / regional markdown | `business_modules/pbo_report_regional/data/*{date}*.md` | `signals-pbo_regional-{date}.json` |
| **Naftali (pool)** | pipeline step -> `business_modules/pool/input/extract-naftali-signals.js` | weekly questionnaire (structured) | (skips markdown) | `signals-naftali-{date}.json` (weekly cadence) |
| **PBO event log** | `analyze-event-log` -> `business_modules/pbo_report_muni/input/analyze-event-log.js` | raw `.txt` log | analysis output | separate from daily 8-component flow |
| **Report bot inbox** | HTTP only -> `business_modules/report_bot/` | manual reports (WhatsApp bot / srulik.ai) | files in `business_modules/report_bot/data/` | manual, not auto-extracted |
| **Mailing digest** | `mail:digest` -> `business_modules/mailing/input/runDailyDigest.js` | n/a | n/a (emails existing reports) | n/a |

### 2.1 Two ingestion shapes

1. **Textual sources** (news, radio, WhatsApp, field, regional PBO) produce a **markdown corpus** consumed by `loadMdFiles` in `business_modules/resilience_scorer/infrastructure/mdReportsLoader.js`, then both extraction paths run (file 02).
2. **Structured sources** (Naftali, social after treat) emit **signal/observation bundles directly** without a markdown corpus step. **PBO municipal** uses verbal Excel fields only (not officer score columns) via the same LLM dual-path extract as other free-text sources.

## 3. The northern-district geographic model

### 3.1 Districts

Canonical district ids (`cross-cut-modules/geo/israelDistricts.js`): national plus `north`, `south`, `jerusalem`, `haifa`, `dan` (legacy aliases `tel_aviv` -> `dan`, `center` -> `jerusalem`). For this product, only `national` and `north` report scopes are supported.

### 3.2 Northern subregions

The northern district is decomposed into five subregions (`business_modules/geo/domain/value_objects/northSubregionId.js`):

```5:5:business_modules/geo/domain/value_objects/northSubregionId.js
export const NORTH_SUBREGION_IDS = ['naftali', 'golan', 'baram', 'hiram', 'galma'];
```

These are the same ids used by the regional PBO module, keeping geography and PBO regional data aligned.

### 3.3 The north reference

A hierarchical reference of the district's localities is built from regions:

- CLI: `business_modules/geo/input/buildNorthReferenceFromRegions.js` (npm `build:north-reference`).
- Implementation: `business_modules/geo/app/buildNorthReferenceCli.js` maps Hebrew region keys (e.g. `נפתלי` -> `naftali`, `גולן` -> `golan`) to subregion ids.
- Input: `business_modules/geo/data/regions.json`; output: `business_modules/geo/data/north-reference.json`.
- Shape: `subregions.{naftali|golan|baram|hiram|galma}.localities[]`, each locality with `canonicalKey`, `officialHebrewName`, `names[]`, `lat`, `lon`, optional `geoEntityType`.

Non-north districts use lighter stubs (`business_modules/geo/domain/services/homefrontDistrictStubs.js` over `business_modules/geo/data/homefront-district-stubs.json`).

## 4. Scoping a report to the district

### 4.1 How scope flows

The scope id travels end to end:

- CLI: `assess-signals.js --scope north`.
- API: `?scope=north` on the report routes.
- Filename prefix: `reportFilePrefix('north')` -> `resilience-report-north` (`cross-cut-modules/geo/reportScopeIds.js`).

### 4.2 The scope policy port

Filtering is abstracted behind a port (`business_modules/resilience_scorer/domain/ports/IReportScopePolicy.js`):

```1:5:business_modules/resilience_scorer/domain/ports/IReportScopePolicy.js
/**
 * @typedef {object} IReportScopePolicy
 * @property {(signals: object[], reportScopeId: string) => object[]} filterSignalsForScope
 * @property {(scope: string | null | undefined) => string} normalizeReportScope
 */
```

Default adapter: `business_modules/resilience_scorer/infrastructure/adapters/defaultReportScopePolicyAdapter.js`, delegating to `business_modules/resilience_scorer/domain/services/regionSignalFilter.js`.

### 4.3 The filtering logic

`scopeDecisionForSignal` (in `regionSignalFilter.js`):

- **National scope:** keep all signals.
- **Regional scope (e.g. `north`):** keep a signal when any of:
  1. its explicit `signal_district` (or legacy north fallback) matches the scope,
  2. its resolved `geo` envelope tags include the target district,
  3. (north only) its `pboSubregionId` is one of the north subregions (`districtRelevanceFromResolvedGeo.js`).

### 4.4 Structured sources default to north

Field and WhatsApp bundles default `district_id: 'north'` at extraction (`business_modules/resilience_scorer/app/extraction/closedCatalogueExtractService.js`), and the structured source types (`field`, `field_whatsapp`, `pbo`, `pbo_regional`, `naftali`, `whatsapp`) fall back to a `legacy_north_fallback` when `district_id` is absent (`business_modules/resilience_scorer/domain/services/signalDistrictId.js`). An explicit `district_id` on a signal always overrides this.

### 4.5 District picture, with national context

A `north` report scores the **scope-local signals** but attaches **national context** for comparison (`scopeAndPartitionSignals` plus the national comparison built in `app/assessment/assessSignalsCli.js`). So a north report is the **whole-district read** with a national benchmark - not a single municipality, and not a national report relabeled.

## 5. Key code locations

| Concern | Path |
|---------|------|
| Ingestion wiring | `composition/registerIngestion.js` |
| npm -> module map | `scripts/agent-routing.md` |
| Canonical artifact paths | `business_modules/resilience_scorer/domain/services/pipelineArtifactPaths.js` |
| Markdown loader | `business_modules/resilience_scorer/infrastructure/mdReportsLoader.js` |
| District ids | `cross-cut-modules/geo/israelDistricts.js` |
| North subregions | `business_modules/geo/domain/value_objects/northSubregionId.js` |
| North reference builder | `business_modules/geo/app/buildNorthReferenceCli.js` |
| Scope policy port | `business_modules/resilience_scorer/domain/ports/IReportScopePolicy.js` |
| Scope filter impl | `business_modules/resilience_scorer/domain/services/regionSignalFilter.js` |
| District relevance from geo | `business_modules/geo/domain/services/districtRelevanceFromResolvedGeo.js` |
| Source district defaulting | `business_modules/resilience_scorer/domain/services/signalDistrictId.js` |
| Scope ids / filenames | `cross-cut-modules/geo/reportScopeIds.js` |
