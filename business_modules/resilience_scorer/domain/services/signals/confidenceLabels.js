/**
 * Confidence display labels.
 */

/** Render confidence as a display string (simple passthrough for v2 string values). */
export function summarizeConfidence(conf) {
  if (conf == null || conf === 'insufficient_data') return 'insufficient_data';
  if (typeof conf === 'string') return conf;
  return conf.signal_confidence ?? 'insufficient_data';
}
