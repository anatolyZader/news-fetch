/**
 * Extract-stage flags for parallel pipeline open observations.
 */
import { envFlagOn } from '../../../../cross-cut-modules/config/envFlags.js';

export function isOpenPipelineExtractEnabled(env = process.env) {
  return envFlagOn(env, 'RESILIENCE_OPEN_EXTRACT_PARALLEL');
}
