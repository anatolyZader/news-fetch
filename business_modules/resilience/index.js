/**
 * Public facade for the resilience module.
 *
 * Other business modules MUST import shared taxonomy/constants from
 * cross-cut-modules/resilience-contracts, and operational capabilities via
 * injected ports wired in composition.
 */

// --- Shared contracts (re-export for backward compatibility) ---
export {
  RESILIENCE_COMPONENTS,
  COMPONENT_IDS,
  SIGNAL_TYPES,
  SIGNAL_CATALOG,
  CATALOG_VERSION,
  GROUNDING_TIER,
  isDmPhoneAllowed,
  extractJson,
  DISPLAY_VIEWS,
  resolveDisplayView,
  normalizeReportScope,
} from '../../cross-cut-modules/resilience-contracts/index.js';

// --- Display tier / report shaping (domain) ---
export {
  deriveInstrumentState,
  operatorAssessmentSummary,
  redactReportPayload,
  redactScoreBySource,
} from './domain/services/assessmentDisplayTier.js';

// --- Attention items & scope (domain) ---
export { buildAttentionItems } from './domain/services/attentionItems.js';
export { buildActionCompass, actionCompassEnabled } from './domain/services/actionCompass.js';
export { buildAnomalyStrip } from './domain/services/anomalyStrip.js';

// --- Policies (domain) ---
export { enrichFieldProvenance } from './domain/services/fieldSignalPolicy.js';

// --- Application services ---
export {
  getCachedReport,
  resolveReportJsonPathForDate,
} from './app/reportCacheService.js';
export {
  updateOperatorRecommendationStatus,
  parseOperatorRecommendationRequest,
} from './app/operatorRecommendationService.js';
export { archiveMarkdownFiles } from './app/archiveMarkdownFromMd.js';
export { createDriftService } from './app/driftService.js';
export { formatSimilarArticlesForChat } from './validation/app/validationToolExecutor.js';
export { runResilienceAssessment } from './app/resilienceAnalysisService.js';
export { contentBatchFromMdArticles } from './app/contentBatchFromMdArticles.js';
export { createAnthropicResilienceLlmAdapter } from './infrastructure/adapters/anthropicResilienceLlmAdapter.js';

// --- Validation submodule (facade for app.js composition root) ---
export {
  createValidationReviewSqliteStore,
  createValidationReviewService,
  validationReviewRoutes,
} from './validation/index.js';

// --- Resilience LLM capability (sibling modules use this, not claudeEvaluator directly) ---
export {
  getDefaultResilienceLlmPort,
  setDefaultResilienceLlmPort,
  resetDefaultResilienceLlmPortForTests,
  createResilienceLlmCapability,
  buildSignalExtractionSystemPrompt,
  extractJsonArray,
  extractEvidence,
} from './app/resilienceLlmCapability.js';
export { loadMdFile, loadMdFiles } from './infrastructure/mdReportsLoader.js';
export { applySourceNativeGrounding } from './infrastructure/sourceNativeGrounding.js';
export {
  createGeoEnrichmentAdapter,
  createNoOpGeoEnrichmentPort,
} from './infrastructure/adapters/geoEnrichmentAdapter.js';
export { loadProbeRecordsForDate } from './infrastructure/adapters/connectivityProbeFileAdapter.js';
export { createReportReadPort } from './infrastructure/adapters/reportReadPortAdapter.js';
export { createReportDisplayPort } from './infrastructure/adapters/reportDisplayPortAdapter.js';
export { generateDecisionBrief, decisionBriefEnabled } from './infrastructure/decisionBriefGenerator.js';

// --- Scoring internals (facade for epistemic_features) ---
export { applySourceCap } from './domain/services/scoring/applyEvidenceCaps.js';
export {
  buildDuplicateOccurrenceIndex,
  round3,
  sourceCapWasApplied,
  tuningFor,
} from './domain/services/scoring/scoringShared.js';
export { collectComponentItems } from './domain/services/scoring/scoreSingleComponent.js';
export {
  defaultSignalWeights,
  resolveSignalWeights,
} from './domain/services/scoring/scoringOverrides.js';

// --- OOV / investigation burst ---
export { countOovCapturesForDate } from './domain/services/oovCapture.js';
export { overallScore, scoreComponents } from './domain/services/behaviorSignals.js';
export { evaluateInvestigationBurst } from './domain/services/oovBurstAlert.js';

// --- Narrative grounding ---
export {
  scoreTextGrounding,
  computeGroundingScores,
} from './domain/services/narrativeGrounding/sentenceGroundingChecker.js';
export { buildSignalRefRegistry } from './domain/services/narrativeGrounding/signalRefRegistry.js';
export { SIGNAL_TO_COMPONENTS } from './domain/services/signalRouter.js';

// --- Survey CLI runner (cross-cut geo entry) ---
export { runAnalyzeSurveyCli } from './app/analyzeSurveyCli.js';
