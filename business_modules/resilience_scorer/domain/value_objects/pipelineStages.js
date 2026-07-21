/**
 * Canonical ordered list of resilience assessment pipeline stage identifiers.
 *
 * Pipeline position: metadata vocabulary — referenced by IPipelineRunStore,
 * pipelineRunTracker, and monitoring status surfaces; not executable stage logic.
 *
 * Owns: PIPELINE_STAGES constant and PipelineStage union type.
 * Does NOT: run stages, write artifacts, or define stage-specific business rules
 * (those live in app/pipeline/ and app/extraction|assessment/).
 *
 * Key collaborators: IPipelineRunStore, pipelineRunTracker, pipelineStageTelemetry,
 * input/pipeline-status.js, cross-cut-modules/monitoring pipeline status UI.
 */

/** Ordered stage names from ingest through persist (artifacts remain on disk). */
export const PIPELINE_STAGES = Object.freeze([
  'INGEST',
  'NORMALIZE',
  'EXTRACT',
  'SCORE',
  'NARRATE',
  'PERSIST',
]);

/** @typedef {typeof PIPELINE_STAGES[number]} PipelineStage */
