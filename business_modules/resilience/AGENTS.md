# Resilience module — agent entry

Read this before any file under `business_modules/resilience/` or `resilience_assessment/`.

## Entry

- `index.js` — public facade; read first
- `app/resilienceAnalysisService.js` — `runResilienceAssessment`
- `app/scoringFacade.js` — **only** bridge into `analyst/scoring/` for headline /10
- `app/shadowFacade.js` — **only** bridge into `analyst/shadow/`
- `domain/epistemic/` — operator caps + mass (not headline scoring)
- `input/extract-signals.js`, `input/assess-signals.js` — pipeline CLIs
- `input/run-pipeline.js` — unified ingest+assess orchestrator CLI
- `app/pipelineOrchestrator.js`, `app/pipelineIngestPlan.js` — ingest plan + spawn orchestration
- `domain/services/pipelineArtifactPaths.js` — canonical artifact paths
- `input/reportRoutes.js` — report HTTP API

## Assessment agent (sibling module)

- `business_modules/resilience_assessment/app/assessmentOrchestrator.js` — planner → specialists → critic → synthesizer

## Ports (`domain/ports/`)

`IResilienceLlmPort`, `IReportReadPort`, `IResilienceReportWriterPort`, `IGeoEnrichmentPort`, `ISignalBundlePort`, `IConnectivityProbePort`, `IPipelineRunStore`, `IReportScopePolicy`

## Do not read

- `analyst/` — headline /10, validation, tuning, drift (see `analyst/README.md`)
- `validation/artifacts/`, `tuning/golden/` under `analyst/` unless task says validation or golden eval
- Prompt files unless task explicitly says "prompt"

## Neighbors (via composition, not direct import)

- `cross-cut-modules/retrieval/`, `business_modules/epistemic_features/`
- Taxonomy: `cross-cut-modules/resilience-contracts/`

## Terminology

Operator redaction uses **display_view**; assessment agent uses **specialist_depth** (A/B/C). See `docs/architecture/ubiquitous-language.md` § Terminology.
