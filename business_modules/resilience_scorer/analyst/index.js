/**
 * Analyst quarantine — headline scoring engine only.
 * Operator daily work should not import this tree except via app/scoringFacade.js.
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
