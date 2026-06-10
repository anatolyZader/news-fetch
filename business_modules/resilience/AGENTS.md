# Resilience module — agent entry

Read this before any file under `business_modules/resilience/` or `resilience_assessment/`.

## Entry

- `index.js` — public facade; read first
- `app/resilienceAnalysisService.js` — `runResilienceAssessment`
- `app/produceAssessmentWithShadow.js` — agent + shadow path
- `input/extract-signals.js`, `input/assess-signals.js` — pipeline CLIs
- `input/reportRoutes.js` — report HTTP API

## Assessment agent (sibling module)

- `business_modules/resilience_assessment/app/assessmentOrchestrator.js` — planner → specialists → critic → synthesizer

## Ports (`domain/ports/`)

`IResilienceLlmPort`, `IReportReadPort`, `IResilienceReportWriterPort`, `IGeoEnrichmentPort`, `ISignalBundlePort`, `IConnectivityProbePort`, `IPipelineRunStore`, `IReportScopePolicy`

## Do not read

- `validation/artifacts/`, `tuning/golden/` unless task says validation or golden eval
- Prompt files unless task explicitly says "prompt"

## Neighbors (via composition, not direct import)

- `cross-cut-modules/retrieval/`, `business_modules/epistemic_features/`
- Taxonomy: `cross-cut-modules/resilience-contracts/`
