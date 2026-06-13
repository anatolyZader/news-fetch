/**
 * Extract-stage flags for parallel pipeline open observations.
 */

export function isOpenPipelineExtractEnabled(env = process.env) {
  const v = env.RESILIENCE_OPEN_EXTRACT_PARALLEL;
  if (v == null || v === '') return true;
  return v === '1' || v === 'true' || v === 'on';
}
