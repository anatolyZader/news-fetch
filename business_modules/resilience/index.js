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
  getAvailableReportDates,
  resolveReportJsonPathForDate,
} from './app/reportCacheService.js';
export {
  updateOperatorRecommendationStatus,
  parseOperatorRecommendationRequest,
} from './app/operatorRecommendationService.js';
export { archiveMarkdownFiles } from './app/archiveMarkdownFromMd.js';
export { runResilienceAssessment } from './app/resilienceAnalysisService.js';
export { contentBatchFromMdArticles } from './app/contentBatchFromMdArticles.js';
export { createAnthropicResilienceLlmAdapter } from './infrastructure/adapters/anthropicResilienceLlmAdapter.js';

// --- Epistemic ingestion math (operator — not headline /10 scoring) ---
export { applySourceCap, sourceCapWasApplied } from './domain/epistemic/evidenceCaps.js';
export {
  buildDuplicateOccurrenceIndex,
  round3,
  contributionForSignal,
} from './domain/epistemic/massContribution.js';
export { certaintyTuningFor } from './domain/epistemic/certaintyTuning.js';
export { collectComponentItems } from './domain/epistemic/componentItems.js';
export {
  defaultSignalWeights,
  resolveSignalWeights,
} from './domain/epistemic/signalWeights.js';
export { computeMediaMentionMass } from './domain/services/mediaMentionMass.js';
export { applyInvestigationSignalFlags } from './domain/services/investigationSignalFlags.js';

// --- OOV / investigation burst ---
export { countOovCapturesForDate } from './domain/services/oovCapture.js';
export { evaluateInvestigationBurst } from './domain/services/oovBurstAlert.js';

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

// --- Narrative grounding ---
export {
  scoreTextGrounding,
  computeGroundingScores,
} from './domain/services/narrativeGrounding/sentenceGroundingChecker.js';
export { buildSignalRefRegistry } from './domain/services/narrativeGrounding/signalRefRegistry.js';
export { SIGNAL_TO_COMPONENTS } from './domain/services/signalRouter.js';

// --- Survey CLI runner (cross-cut geo entry) ---
export { runAnalyzeSurveyCli } from './app/analyzeSurveyCli.js';
export {
  runArticleDualPathExtract,
  indexExtractStoryClusters,
} from './app/articleDualPathExtractService.js';
