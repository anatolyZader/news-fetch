/**
 * Analyst headline scoring public API (/10, CI, calibration, sensitivity).
 */
export {
  scoreComponents,
  COMPONENT_TUNING,
  resolveSignalWeights,
  resolveComponentTuning,
} from './scoreComponentsOrchestrator.js';
export { overallScore } from './overallScore.js';
export { enrichWithCalibrationPenalty } from './calibrationPenalty.js';
export { enrichWithWeightSensitivity } from './weightSensitivity.js';
