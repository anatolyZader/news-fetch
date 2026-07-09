/**
 * Single allowed bridge from operator resilience code into analyst/scoring.
 */
export {
  scoreComponents,
  overallScore,
  COMPONENT_TUNING,
  resolveSignalWeights,
  resolveComponentTuning,
  enrichWithCalibrationPenalty,
  enrichWithWeightSensitivity,
} from '../analyst/scoring/index.js';
