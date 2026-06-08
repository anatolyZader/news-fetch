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
  synthesizeComponents,
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
