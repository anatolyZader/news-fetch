/** Canonical assessment pipeline stages (metadata only; artifacts remain on disk). */
export const PIPELINE_STAGES = Object.freeze([
  'INGEST',
  'NORMALIZE',
  'EXTRACT',
  'SCORE',
  'NARRATE',
  'PERSIST',
]);

/** @typedef {typeof PIPELINE_STAGES[number]} PipelineStage */
