# Resilience module — agent entry (min-math)

Read this before any file under `business_modules/resilience_scorer/` or `specialist_agents/`.

**min-math design:** this fork is narrative-first. There are **no numeric resilience scores** anywhere — no 1–10 headline, no evidence mass, no caps/CI/EWMA. Per-component assessment = verified signals + count-based `evidence_basis` (sufficiency/balance/concentration) + critical flags + LLM narrative grounded in evidence. Single report view (no operator/analyst redaction split).

## Entry

- `index.js` — public facade; read first
- `app/resilienceAnalysisService.js` — `runResilienceAssessment`
- `domain/contracts/componentEvidence.js` — count-based per-component evidence contract (`buildComponentEvidence`)
- `app/assessment/evidencePipelinePrep.js` — partition → evidence → epistemic gate (successor to the scoring pipeline; return keys kept compatible)
- `domain/epistemic/` — presence gates, high-salience flags, thin-evidence policy, epistemic profile — all count-based
- `input/extract-signals.js`, `input/assess-signals.js` — pipeline CLIs (`app/extraction/extractSignalsCli.js`, `app/assessment/assessSignalsCli.js`)
- `input/run-pipeline.js` — unified ingest+assess orchestrator CLI (`npm run pipeline:run -- --preset 8comp-3`)
- `app/pipeline/pipelineOrchestrator.js`, `app/pipeline/pipelineIngestPlan.js` — ingest plan + spawn orchestration
- `domain/services/paths/` — canonical artifact paths
- `input/reportRoutes.js` — report HTTP API

## Assessment agent (sibling module)

- `business_modules/specialist_agents/app/assessmentOrchestrator.js` — planner → specialists → critic → synthesizer; consumes `epistemicProfile.by_component` (thin_evidence, contested, certainty_band, signal_count — `evidence_mass` is a compat alias for signal_count)

## Ports (`domain/ports/`)

`IResilienceLlmPort`, `IReportReadPort`, `IGeoEnrichmentPort`, `ISignalBundlePort`, `IConnectivityProbePort`, `IPipelineRunStore`, `IReportScopePolicy`, `IReportWritePort`, `IReportDisplayPort`

## Layer conventions (do not "fix")

- **`domain/contracts/` is the isomorphic client-safe layer** — the React client imports citation/display helpers (`citationDisplay`, `apaCitationFormat`, `inlineCitationResolve`, …) from these paths directly. Presentation-looking code here is deliberate; do not move it into `services/`.
- **`infrastructure/` must not import `app/`** (depcruise rule `infrastructure-no-app`). Shared window/bundle helpers live in `domain/services/paths/{assessmentWindow,signalBundles}.js`.
- **`redactAssessmentForView`/`redactReportPayload` are passthroughs** that attach the per-component `instrument` object — they no longer redact anything (nothing numeric left to hide). The `view` parameter survives for call-site compatibility only.

## Do not read

- `validation/artifacts/` (preserved historical data) unless task says validation
- Prompt files unless task explicitly says "prompt"

## Neighbors (via composition, not direct import)

- `cross-cut-modules/retrieval/`, `business_modules/specialist_agents/domain/services/`
- Taxonomy: `cross-cut-modules/resilience-contracts/`

## Terminology

Assessment agent uses **specialist_depth** (A/B/C). See `docs/architecture/ubiquitous-language.md` § Terminology.

### One concept, several historical names (do not "fix" one into the other)

- **Novel / non-catalogue signal discovery** ("open X") is named per stage: **open vocabulary** at extraction (`openVocabularyExtractService.js`), **open observations** at load/artifact level (`loadOpenObservationsForAssess.js`, openObs bundles), **open evidence** at verification (`openEvidenceVerification.js`, `openEvidenceScoringSignals.js`). `oov/` is the same family (out-of-vocabulary).
- **Fixed-taxonomy flow** ("closed X"): **closed catalogue** at extraction (`closedCatalogueExtractService.js`), **closed core** for the assessment shell/narrate path (`buildClosedCoreAssessmentShell.js`, `closedCoreNarrate.js`), **closedSignalBundle** at the infra port/adapter and artifact level.
- **"Grounding" means two unrelated things.** `GROUNDING_TIER` (`contracts/groundingTier.js`, `signals/groundingPolicy.js`) is an evidence-verification confidence tier; `comp.grounding_score` is written by `specialist_agents`. `narrativeGrounding/*` is post-hoc QA of generated prose against cited evidence; `comp.narrative_grounding_score` is written by `claudeNarratives.js` / `operatorNarrativePipeline.js`. They never call each other.
