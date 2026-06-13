/**
 * Analyst quarantine — headline scoring, validation, tuning, drift, shadow.
 * Operator daily work should not import this tree except via composition wiring.
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

export {
  createValidationReviewSqliteStore,
  createValidationReviewService,
  validationReviewRoutes,
} from './validation/index.js';
export { formatSimilarArticlesForChat } from './validation/app/validationToolExecutor.js';

export { createDriftService } from './drift/driftService.js';
export { registerDriftRoutes } from './drift/driftRoutes.js';

export { computeDivergence, writeShadowArtifacts } from './shadow/index.js';
