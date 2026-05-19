/**
 * Calibration hooks for future T5 / ridge fitting of signal weights (plan §7).
 *
 * When labeled component scores or dense counterfactuals exist, offline scripts may
 * fit weights against CALIBRATION_TARGETS. Today fitSignalWeightsRidgeMock returns null.
 */

import {
  CATALOG_VERSION,
  DEFAULT_SCORING_PRIORS,
  SIGNAL_CATALOG,
  SIGNAL_TO_COMPONENTS,
  getScoringPriors,
} from './signalCatalog.js';
import { COMPONENT_TUNING } from './behaviorSignals.js';

/** Fields that may be calibrated when labeled data exists. */
export const CALIBRATION_TARGETS = Object.freeze({
  signal_to_components: 'Per-type component routing weights (SIGNAL_TO_COMPONENTS)',
  component_tuning: 'Per-component tanhK and certM (COMPONENT_TUNING)',
  scoring_priors: 'Per-type priors merged from DEFAULT_SCORING_PRIORS + catalog scoringPriors',
});

/**
 * Snapshot of fittable parameters for offline ridge / regression scripts.
 * @returns {{ catalog_version: string, signal_count: number, priors_by_type: Record<string, object>, component_tuning: object, signal_to_components: object }}
 */
export function getCalibrationSnapshot() {
  const priors_by_type = {};
  for (const entry of SIGNAL_CATALOG) {
    priors_by_type[entry.type] = getScoringPriors(entry.type);
  }
  return {
    catalog_version: CATALOG_VERSION,
    signal_count: SIGNAL_CATALOG.length,
    priors_by_type,
    component_tuning: { ...COMPONENT_TUNING },
    signal_to_components: SIGNAL_TO_COMPONENTS,
    default_scoring_priors: { ...DEFAULT_SCORING_PRIORS },
  };
}

/**
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
