/**
 * Placeholder for future T5 / ridge calibration of signal weights (plan §7).
 *
 * When labeled component scores or dense counterfactuals exist, this may return
 * fitted weights. Today it always returns `null` — callers should no-op.
 *
 * @param {object} input
 * @param {Array<object>} [input.labeledExamples]  { component_id, signals?, score?, ... }
 * @returns {null | { weights: Record<string, number>, notes: string }}
 */
export function fitSignalWeightsRidgeMock({ labeledExamples } = {}) {
  if (!Array.isArray(labeledExamples) || labeledExamples.length < 2) {
    return null;
  }
  return null;
}
