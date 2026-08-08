/**
 * Persists per-run pipeline stage completion metadata for user monitoring.
 *
 * Pipeline position: spans INGEST→PERSIST — written by pipelineRunTracker during
 * runResilienceAssessment; read by pipeline-status CLI and monitoring surfaces.
 *
 * Owns: contract surface (methods/typedefs below) and PipelineRunRecord shape.
 * Does NOT: implement adapters (those live in infrastructure/ and db/persistence/).
 *
 * Key collaborators: pipelineRunTracker, resilienceAnalysisService,
 * createPipelineRunStore (SQLite), input/pipeline-status.js.
 */

/** @typedef {import('../value_objects/pipelineStages.js').PipelineStage} PipelineStage */

/**
 * Snapshot of one assessment pipeline run and its per-stage status timestamps.
 *
 * @typedef {object} PipelineRunRecord
 * @property {string} runKey Composite key `{reportDate}:{reportScopeId}`.
 * @property {string} reportDate Assessment target date (YYYY-MM-DD).
 * @property {string} reportScopeId Canonical scope id (e.g. national, north).
 * @property {Record<string, { status: string, at: string, versions?: object }>} stages
 * Map of PipelineStage → completion/failure record with ISO timestamp and optional
 * version stamps (catalog, geo policy, etc.).
 */

/**
 * Store for pipeline run lifecycle and stage telemetry.
 *
 * @typedef {object} IPipelineRunStore
 * @property {(opts: { runKey: string, reportDate: string, reportScopeId: string }) => void} startRun
 * Initialize or reset a run record before the first stage executes.
 * @property {(runKey: string, stage: PipelineStage, versions?: object) => void} completeStage
 * Mark a stage as successfully finished; optionally attach artifact/version metadata.
 * @property {(runKey: string, stage: PipelineStage, error: string) => void} failStage
 * Record stage failure with a human-readable error message for status dashboards.
 * @property {(runKey: string) => PipelineRunRecord | null} getRun
 * Load the current run snapshot, or null when no record exists for the key.
 */

export {};
