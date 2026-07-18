/**
 * Analyst quarantine — headline scoring engine only.
 * Operator daily work should not import this tree except via app/scoringFacade.js.
 */
export {
  scoreComponents,
  overallScore,
  COMPONENT_TUNING,
  resolveSignalWeights,
  resolveComponentTuning,
  enrichWithCalibrationPenalty,
  enrichWithWeightSensitivity,
} from './scoring/index.js';
