/**
 * Calibration hooks for future T5 / ridge fitting of signal weights (plan §7).
 *
 * When labeled component scores or dense counterfactuals exist, offline scripts may
 * fit weights against CALIBRATION_TARGETS. Shadow RGR path activates when report count
 * meets tier3_tuning.min_reports (default 30).
 */

import { resolveStateStore } from '../../../../../cross-cut-modules/persistence/domain/resolveStateStore.js';

function getStore(deps = {}) {
  return resolveStateStore(deps);
}
import { resolve } from 'node:path';
import {
  CATALOG_VERSION,
  DEFAULT_SCORING_PRIORS,
  SIGNAL_CATALOG,
  SIGNAL_TO_COMPONENTS,
  getScoringPriors,
} from './signalCatalog.js';
import { COMPONENT_TUNING } from '../../epistemic/certaintyTuning.js';

/** Fields that may be calibrated when labeled data exists. */
export const CALIBRATION_TARGETS = Object.freeze({
  signal_to_components: 'Per-type component routing weights (SIGNAL_TO_COMPONENTS)',
  component_tuning: 'Per-component tanhK and certM (COMPONENT_TUNING)',
  scoring_priors: 'Per-type priors merged from DEFAULT_SCORING_PRIORS + catalog scoringPriors',
});

const DEFAULT_SHADOW_MIN_REPORTS = 30;

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
 * Load shadow weight overlay written by offline tuning scripts (optional).
 * @param {string} [rootDir]
 */
export function loadShadowWeights(rootDir = process.cwd()) {
  const path = resolve(rootDir, 'business_modules/resilience_scorer/analyst/tuning/shadow-weights.json');
  if (!getStore().existsSync(path)) return null;
  try {
    return JSON.parse(getStore().readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Merge shadow weights into a calibration snapshot (read-only overlay for analysis).
 * @param {object} snapshot
 * @param {object | null} shadow
 */
export function applyCalibrationOverlay(snapshot, shadow) {
  if (!shadow?.signal_to_components) return snapshot;
  return {
    ...snapshot,
    signal_to_components: { ...snapshot.signal_to_components, ...shadow.signal_to_components },
    _shadow_overlay: true,
    _shadow_source: shadow.generated_at ?? null,
  };
}

/**
 * @param {object} input
 * @param {Array<object>} [input.labeledExamples]  { component_id, signals?, score?, ... }
 * @param {number} [input.minReports]
 * @returns {null | { mode: string, weights: object, notes: string, example_count: number }}
 */
export function fitSignalWeightsRidgeMock({ labeledExamples, minReports } = {}) {
  const threshold = minReports ?? DEFAULT_SHADOW_MIN_REPORTS;
  if (!Array.isArray(labeledExamples) || labeledExamples.length < threshold) {
    return null;
  }
  const snap = getCalibrationSnapshot();
  const shadow = loadShadowWeights();
  const overlay = shadow ? applyCalibrationOverlay(snap, shadow) : snap;
  return {
    mode: 'shadow_rgr',
    weights: overlay.signal_to_components,
    notes:
      `Shadow RGR: ${labeledExamples.length} report(s) ≥ ${threshold}; ` +
      'weights unchanged until labeled component scores exist.',
    example_count: labeledExamples.length,
  };
}
