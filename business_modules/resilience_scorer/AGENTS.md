# Resilience module — agent entry

Read this before any file under `business_modules/resilience_scorer/` or `specialist_agents/`.

## Entry

- `index.js` — public facade; read first
- `app/resilienceAnalysisService.js` — `runResilienceAssessment`
- `app/scoringFacade.js` — **only** bridge into `analyst/scoring/` for headline /10
- `app/shadowFacade.js` — **only** bridge into `analyst/shadow/`
- `domain/epistemic/` — operator caps + mass (not headline scoring)
- `input/extract-signals.js`, `input/assess-signals.js` — pipeline CLIs (`app/extraction/extractSignalsCli.js`, `app/assessment/assessSignalsCli.js`)
- `input/run-pipeline.js` — unified ingest+assess orchestrator CLI (`npm run pipeline:run -- --preset 8comp-3`)
- `app/pipeline/pipelineOrchestrator.js`, `app/pipeline/pipelineIngestPlan.js` — ingest plan + spawn orchestration
- `domain/services/paths/` — canonical artifact paths
- `input/reportRoutes.js` — report HTTP API

## Assessment agent (sibling module)

- `business_modules/specialist_agents/app/assessmentOrchestrator.js` — planner → specialists → critic → synthesizer

## Ports (`domain/ports/`)

`IResilienceLlmPort`, `IReportReadPort`, `IGeoEnrichmentPort`, `ISignalBundlePort`, `IConnectivityProbePort`, `IPipelineRunStore`, `IReportScopePolicy`

## Do not read

- `analyst/` — headline /10, validation, tuning, drift (see `analyst/README.md`)
- `analyst/validation/artifacts/`, `analyst/tuning/golden/` unless task says validation or golden eval
- `validation/artifacts/` (top-level, outside `analyst/` — preserved historical data) unless task says validation
- Prompt files unless task explicitly says "prompt"

## Neighbors (via composition, not direct import)

- `cross-cut-modules/retrieval/`, `business_modules/specialist_agents/domain/services/`
- Taxonomy: `cross-cut-modules/resilience-contracts/`

## Terminology

Operator redaction uses **display_view**; assessment agent uses **specialist_depth** (A/B/C). See `docs/architecture/ubiquitous-language.md` § Terminology.
