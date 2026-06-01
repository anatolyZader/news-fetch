/**
 * Public facade for the resilience module.
 *
 * Other business modules MUST import resilience capabilities from here, not by
 * reaching into ./domain, ./app, or ./infrastructure directly. This keeps the
 * module's internals free to change behind a stable surface (Low Coupling /
 * Protected Variations) and is the seam the cross-module ESLint rule enforces.
 *
 * Grouped by concern, mirroring the convention in business_modules/geo/index.js.
 */

// --- Display tier / report shaping (domain) ---
export {
  deriveInstrumentState,
  operatorAssessmentSummary,
  resolveDisplayView,
  DISPLAY_VIEWS,
  redactReportPayload,
  redactScoreBySource,
} from './domain/services/assessmentDisplayTier.js';

// --- Attention items & scope (domain) ---
export { buildAttentionItems } from './domain/services/attentionItems.js';
export { normalizeReportScope } from './domain/services/regionSignalFilter.js';

// --- Signal taxonomy & components (domain) ---
export {
  COMPONENT_IDS,
  SIGNAL_TYPES,
  SIGNAL_CATALOG,
  CATALOG_VERSION,
} from './domain/services/behaviorSignals.js';
export { RESILIENCE_COMPONENTS } from './domain/resilienceComponents.js';

// --- Policies (domain) ---
export { GROUNDING_TIER } from './domain/services/groundingPolicy.js';
export { enrichFieldProvenance } from './domain/services/fieldSignalPolicy.js';
export { isDmPhoneAllowed } from './domain/services/signalGamingPolicy.js';

// --- Application services ---
export { updateOperatorRecommendationStatus } from './app/operatorRecommendationService.js';
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
  buildSignalExtractionSystemPrompt,
  extractJsonArray,
  extractEvidence,
  synthesizeComponents,
} from './app/resilienceLlmCapability.js';
export { extractJson } from './infrastructure/claudeJsonHelpers.js';
export { loadMdFile, loadMdFiles } from './infrastructure/mdReportsLoader.js';
export { applySourceNativeGrounding } from './infrastructure/sourceNativeGrounding.js';
export {
  createGeoEnrichmentAdapter,
  createNoOpGeoEnrichmentPort,
} from './infrastructure/adapters/geoEnrichmentAdapter.js';
export { loadProbeRecordsForDate } from './infrastructure/adapters/connectivityProbeFileAdapter.js';
