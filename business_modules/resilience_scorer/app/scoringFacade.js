/**
 * Single allowed bridge from operator resilience code into analyst/ (headline scoring engine).
 */
export {
  scoreComponents,
  overallScore,
  COMPONENT_TUNING,
  resolveSignalWeights,
  resolveComponentTuning,
  enrichWithCalibrationPenalty,
  enrichWithWeightSensitivity,
} from '../analyst/index.js';
