/**
 * Confidence display labels for report and operator surfaces.
 *
 * Pipeline position: report — presentation helper for confidence strings on signals and components.
 *
 * Owns: normalizing confidence values to a display string (including insufficient_data).
 * Does NOT: confidence assignment during extraction, grounding tiers, or epistemic certainty bands.
 *
 * Key collaborators: groundingPolicy.js, ../../contracts/componentEvidence.js, domain/services/operator/.
 */

/**
 * Render confidence as a display string (simple passthrough for v2 string values).
 *
 * @param {string|object|null|undefined} conf confidence field from signal or component
 * @returns {string} display label, or 'insufficient_data' when absent
 */
export function summarizeConfidence(conf) {
  if (conf == null || conf === 'insufficient_data') return 'insufficient_data';
  if (typeof conf === 'string') return conf;
  return conf.signal_confidence ?? 'insufficient_data';
}
