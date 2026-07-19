/**
 * Public facade for the resilience module.
 *
 * Other business modules and cross-cut modules MUST import resilience
 * taxonomy/constants from this facade (domain/contracts lives inside this
 * module), and operational capabilities via injected ports wired in
 * composition.
 */

// --- Resilience contracts (domain/contracts barrel) ---
export * from './domain/contracts/index.js';

// --- OOV learning-capture clustering (domain) ---
export {
  cosineSimilarity,
  clusterByPrefix,
  clusterByEmbedding,
  rankClusters,
} from './domain/services/oov/oovClusterer.js';

// --- Display tier / report shaping (domain) ---
export {
  deriveInstrumentState,
  operatorAssessmentSummary,
  redactReportPayload,
  redactScoreBySource,
} from './domain/services/operator/assessmentDisplayTier.js';

// --- Attention items & scope (domain) ---
export {
  buildAttentionItems,
  annotateAttentionNovelty,
  applyDecisionBriefPriority,
  sortAttentionItems,
  ATTENTION_KINDS,
  ATTENTION_LEVELS,
} from './domain/services/operator/attentionItems.js';
export { buildActionCompass, actionCompassEnabled } from './domain/services/actionCompass/actionCompass.js';
export {
  operatorEpistemicOverlayEnabled,
  stripOperatorGuidancePayload,
} from './domain/contracts/operatorEpistemicOverlay.js';
export {
  narrativeEpistemicMode,
  narrativeInvestigationPermissive,
} from './domain/contracts/narrativeEpistemicMode.js';
export {
  operatorSurfaceMode,
  richSurfaceDeterministicOnly,
  shouldUseRichDeterministicPath,
  operatorEvidenceChars,
  operatorMaxClaims,
  operatorHighlightPerSource,
} from './domain/contracts/operatorSurfaceMode.js';
export {
  groupPoolItemsBySource,
  poolItemSourceBucket,
  normalizePoolSourceType,
} from './domain/contracts/evidencePoolGrouping.js';
export {
  isOpenExtractParallelEnabled,
  isOpenPipelineLegacyEnabled,
  isOmissionAuditEnabled,
  isClosedCoreAssessEnabled,
  isOpenObsForAgentEnabled,
  isResidualForAgentEnabled,
} from './domain/services/oov/openExtractConfig.js';
export { pipelineOpenObservationsPath } from './domain/services/paths/ingestPaths.js';
export {
  resilienceReportsDir,
  resilienceCapturesDir,
  resilienceAuditsDir,
  epistemicProfilesDir,
  analystShadowDir,
  divergenceArtifactPath,
} from './domain/services/paths/outputDirs.js';
export { resolveRepoRoot as resolveResilienceRepoRoot } from './domain/services/paths/repoRoot.js';
export {
  buildReportBasename,
  parseReportFilename,
  reportScopeSlug,
  isResilienceReportFilename,
  isNationalReportFilename,
  listReportJsonFilenamesForDate,
  reportFilenameMatchesDate,
} from './domain/services/paths/reportNames.js';
export { stripTraceFields } from './infrastructure/claudeExtraction.js';
export { buildAnomalyStrip } from './domain/services/operator/anomalyStrip.js';

// --- Policies (domain) ---
export { enrichFieldProvenance } from './domain/services/signals/fieldSignalPolicy.js';
export {
  applyFieldReportSignalHygiene,
  isTrivialFieldReportEvidence,
} from './domain/services/signals/fieldReportHygiene.js';
export {
  resolveSignalTypeAlias,
  applySignalTypeHygiene,
  rewriteMisclassifiedSignalType,
  shouldDropNonResilienceCasualtySignal,
  isExcludedNationalContextSignalType,
  isBareHazardTickerEvidence,
  NATIONAL_CONTEXT_EXCLUDED_SIGNAL_TYPES,
} from './domain/services/signals/signalTypeHygiene.js';
export {
  splitBundledHarmInfrastructure,
  splitEvidenceClauses,
  classifyHarmInfrastructureClause,
} from './domain/services/signals/harmInfrastructureSplit.js';
export { topContributorsFromScored } from './domain/services/operator/topContributors.js';

// --- Application services ---
export {
  getCachedReport,
  getAvailableReportDates,
  getAvailableReportEditions,
  resolveReportJsonPathForDate,
  listReportJsonPathsForDate,
  parseReportRunIdFromFilename,
} from './infrastructure/reportCacheService.js';
export {
  parseOperatorRecommendationRequest,
} from './app/operator/operatorRecommendationService.js';
export { updateOperatorRecommendationStatus } from './infrastructure/recommendationStatusWriter.js';
export { archiveMarkdownFiles } from './app/extraction/archiveMarkdownFromMd.js';
export { runResilienceAssessment } from './app/resilienceAnalysisService.js';
export { contentBatchFromMdArticles } from './app/extraction/contentBatchFromMdArticles.js';
export { createAnthropicResilienceLlmAdapter } from './infrastructure/adapters/anthropicResilienceLlmAdapter.js';

// --- Evidence grouping (count-based) ---
export { collectComponentSignals } from './domain/services/signals/componentSignalGroups.js';
export { buildComponentEvidence } from './domain/contracts/componentEvidence.js';
export {
  defaultSignalWeights,
  resolveSignalWeights,
} from './domain/services/signals/signalWeights.js';
export { applyInvestigationSignalFlags } from './domain/services/signals/investigationSignalFlags.js';
export { buildNorthClusterNarrativesFromSignals } from './domain/services/narrative/northClusterNarrative.js';

// --- Epistemic profile computation (feeds the specialist_agents assessment agent) ---
export { computeEpistemicProfile } from './domain/epistemic/epistemicProfileBuilder.js';
export { createEpistemicFeaturesService } from './app/assessment/epistemicFeaturesService.js';

// --- OOV / investigation burst ---
export { countOovCapturesForDate } from './domain/services/oov/oovCapture.js';
export { evaluateInvestigationBurst } from './domain/services/oov/oovBurstAlert.js';

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
export {
  resolveNarrativePipelineMode,
  hybridNarrativeEnabled,
  legacyNarrativeOnly,
  operatorNarrativePipelineEnabled,
} from './domain/services/narrativeGrounding/groundingConfig.js';
export {
  applyOperatorNarrativePipeline,
  runOperatorNarrativePipeline,
  applyOperatorNarrativeToAssessment,
} from './app/assessment/operatorNarrativePipeline.js';
export {
  finalizeOperatorNarrativeSurface,
  resolveOperatorComponentNarrative,
  buildProseFromClaims,
  buildCuratedEvidenceBullets,
  isStubNarrative,
  INSUFFICIENT_SYNTHESIS_NARRATIVE,
} from './domain/services/operator/operatorNarrativeSurface.js';
export {
  attachRichOperatorSurface,
  attachRichInvestigationPool,
  buildDeterministicNarrativeFromClaims,
  assignOperatorEpistemicRole,
} from './domain/services/operator/operatorInvestigationSurface.js';
export { SIGNAL_TO_COMPONENTS } from './domain/services/signals/signalRouter.js';

export {
  runExtractionStage,
  indexExtractStoryClusters,
} from './app/extraction/extractionStage.js';
export { readResilienceHistory } from './infrastructure/reportHistoryReader.js';
