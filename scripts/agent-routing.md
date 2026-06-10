# Agent routing — npm scripts to module entry points

Companion to `AGENTS.md` task routing. Start at the listed `input/` file or composition registrar.

## Ingest

| npm script | Module entry |
|------------|--------------|
| `articles-to-md` | `business_modules/news-sites/input/fetch-articles-to-md.js` |
| `homefront-to-md` | `business_modules/news-sites/input/extract-homefront-articles.js` |
| `audio-to-md` | `business_modules/audio/input/audio-to-md.js` |
| `video-grab-url` | `business_modules/video/input/video-grab-url.js` |
| `youtube-to-md` | `business_modules/video/input/youtube-to-md.js` |
| `whatsapp-to-md` | `business_modules/whatsapp/input/whatsapp-to-md.js` |
| `ingest-field-reports` | `business_modules/visits/input/visitsInput.js` |
| `social-media:init` | `business_modules/social_media/input/socialMediaInput.js` |
| `social-media:gather-daily` | `business_modules/social_media/input/socialMediaInput.js` |
| `social-media:treat` | `business_modules/social_media/input/socialMediaInput.js` |
| `capture:test` / `capture:jobs` / `capture:start` | `business_modules/scheduled_stream_capture/input/` |
| `radio:setup` | `business_modules/radio/input/setup-tzafon.js` |
| `mail:digest` | `business_modules/mailing/input/runDailyDigest.js` |
| `analyze-event-log` | `business_modules/pbo_report_muni/input/analyze-event-log.js` |

Ingest services are wired in `composition/registerIngestion.js`.

## Resilience pipeline

| npm script | Module entry |
|------------|--------------|
| `extract-signals` | `business_modules/resilience/input/extract-signals.js` |
| `extract-observations` | `business_modules/signals_extraction/input/extract-observations.js` |
| `assess-signals` | `business_modules/resilience/input/assess-signals.js` |
| `pipeline:status` | `business_modules/resilience/input/pipeline-status.js` |
| `validation:status` | `business_modules/resilience/validation/scripts/validationStatus.js` |
| `validation:set-phase` | `business_modules/resilience/validation/scripts/validationSetPhase.js` |
| `signal-catalog-evolution:gap-report` | `business_modules/signal_catalog_evolution/input/generate-gap-report.js` |
| `suggest-tuning` | `business_modules/resilience/tuning/scripts/suggestComponentTuning.js` |
| `backfill:report-brief` | `business_modules/resilience/input/backfillReportBriefMd.js` |
| `worker:assess` | `scripts/workers/assess-signals-worker.js` |

Analysis wiring: `composition/registerAnalysis.js`. Assessment agent: `business_modules/resilience_assessment/`.

## RAG / DB ops

| npm script | Module entry |
|------------|--------------|
| `archive:backfill` | `db/input/backfillSourceArchive.js` |
| `archive:purge` | `db/input/purgeSourceArchive.js` |
| `rag:reindex` | `db/input/reindexRag.js` |
| `rag:reindex-catalog` | `business_modules/signal_catalog_evolution/input/reindex-catalog.js` |
| `rag:reindex-field-examples` | `business_modules/report_build/input/reindex-field-examples.js` |
| `rag:reindex-hfc` | `cross-cut-modules/retrieval/input/reindex-hfc.js` |
| `rag:reindex-social-examples` | `business_modules/social_media/input/reindex-social-examples.js` |
| `rag:reindex-docs` | `cross-cut-modules/retrieval/input/reindex-docs.js` |
| `rag:reindex-terms` | `cross-cut-modules/retrieval/input/reindex-terms.js` |
| `rag:eval` | `db/input/ragEval.js` |
| `agent:eval` | `db/input/agentEval.js` |
| `analyze-survey` | `cross-cut-modules/geo/input/runAnalyzeSurvey.js` |
| `build:north-reference` | `business_modules/geo/input/buildNorthReferenceFromRegions.js` |

## Client / analyst

| npm script | Entry |
|------------|-------|
| `client:dev` | `client/` (Vite dev server) |
| `client:build` | `client/` → `client/dist/` |
| `analyst:dev` | `analyst-site/` (separate app) |
| `analyst:build` | `analyst-site/` |

## CI / quality

| npm script | Purpose |
|------------|---------|
| `deps:boundaries` | Module boundary check (run after cross-module edits) |
| `test` | `tests/**/*.test.js` |
| `lint` | ESLint |
| `openapi:lint` | `openapi/openapi.yaml` |
| `test-tokens` | `cross-cut-modules/budget/input/test-token-usage.js` |
