/**
 * Extract-stage flags for parallel pipeline open observations.
 */

export function isOpenPipelineExtractEnabled(env = process.env) {
  const v = env.RESILIENCE_OPEN_EXTRACT_PARALLEL;
  if (v == null || v === '') return false;
  return v === '1' || v === 'true' || v === 'on';
}
