# Resilience module — agent entry

Read this before any file under `business_modules/resilience_scorer/` or `specialist_agents/`.

## Entry

- `index.js` — public facade; read first
- `app/resilienceAnalysisService.js` — `runResilienceAssessment`
- `app/scoringFacade.js` — **only** bridge into `analyst/scoring/` for headline /10
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

- `analyst/` — headline /10 scoring engine only (see `analyst/README.md`)
- `validation/artifacts/` (top-level, outside `analyst/` — preserved historical data) unless task says validation
- Prompt files unless task explicitly says "prompt"

## Neighbors (via composition, not direct import)

- `cross-cut-modules/retrieval/`, `business_modules/specialist_agents/domain/services/`
- Taxonomy: `cross-cut-modules/resilience-contracts/`

## Terminology

Operator redaction uses **display_view**; assessment agent uses **specialist_depth** (A/B/C). See `docs/architecture/ubiquitous-language.md` § Terminology.

### One concept, several historical names (do not "fix" one into the other)

- **Novel / non-catalogue signal discovery** ("open X") is named per stage: **open vocabulary** at extraction (`openVocabularyExtractService.js`), **open observations** at load/artifact level (`loadOpenObservationsForAssess.js`, openObs bundles), **open evidence** at verification/scoring (`openEvidenceVerification.js`, `openEvidenceScoringSignals.js`). `oov/` is the same family (out-of-vocabulary).
- **Fixed-taxonomy flow** ("closed X"): **closed catalogue** at extraction (`closedCatalogueExtractService.js`), **closed core** for the assessment shell/narrate path (`buildClosedCoreAssessmentShell.js`, `closedCoreNarrate.js`), **closedSignalBundle** at the infra port/adapter and artifact level.
- **"Grounding" means two unrelated things.** `GROUNDING_TIER` (`contracts/groundingTier.js`, `signals/groundingPolicy.js`) is an evidence-verification confidence tier that discounts scoring mass; `comp.grounding_score` is written by `specialist_agents`. `narrativeGrounding/*` is post-hoc QA of generated prose against cited evidence; `comp.narrative_grounding_score` is written by `claudeNarratives.js` / `operatorNarrativePipeline.js`. They never call each other.
