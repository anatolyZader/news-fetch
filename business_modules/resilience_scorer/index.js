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
  userAssessmentSummary,
  redactReportPayload,
  redactScoreBySource,
} from './domain/services/user/assessmentDisplayTier.js';

// --- Attention items & scope (domain) ---
export {
  buildAttentionItems,
  annotateAttentionNovelty,
  applyDecisionBriefPriority,
  sortAttentionItems,
  ATTENTION_KINDS,
  ATTENTION_LEVELS,
} from './domain/services/user/attentionItems.js';
export { buildActionCompass, actionCompassEnabled } from './domain/services/actionCompass/actionCompass.js';
export {
  userEpistemicOverlayEnabled,
} from './domain/contracts/userEpistemicOverlay.js';
export {
  narrativeEpistemicMode,
  narrativeInvestigationPermissive,
} from './domain/contracts/narrativeEpistemicMode.js';
export {
  userSurfaceMode,
  richSurfaceDeterministicOnly,
  shouldUseRichDeterministicPath,
  userEvidenceChars,
  userMaxClaims,
  userHighlightPerSource,
} from './domain/contracts/userSurfaceMode.js';
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
  divergenceArtifactPath,
} from './domain/services/paths/outputDirs.js';
export { resolveRepoRoot as resolveResilienceRepoRoot } from './domain/services/paths/repoRoot.js';
export {
  buildReportBasename,
  runAtFromLabeledBasename,
  parseReportFilename,
  reportScopeSlug,
  isResilienceReportFilename,
  isNationalReportFilename,
  listReportJsonFilenamesForDate,
  reportFilenameMatchesDate,
  LABELED_REPORT_BASENAME_RE,
  COMPACT_REPORT_BASENAME_RE,
} from './domain/services/paths/reportNames.js';
export { stripTraceFields } from './infrastructure/claudeExtraction.js';

// --- Policies (domain) ---
export { enrichFieldProvenance } from './domain/services/signals/fieldSignalPolicy.js';
export {
  applyFieldReportSignalHygiene,
  isTrivialFieldReportEvidence,
} from './domain/services/signals/hygiene/fieldReportHygiene.js';
export {
  PBO_EXTRACTOR_CONTRACT,
  PBO_EXTRACTOR_CONTRACT_VERSION,
  PBO_CONTRACT_GATE_BLOCK_ENV_KEY,
} from './domain/services/paths/pboBundleContract.js';
export {
  resolveSignalTypeAlias,
  applySignalTypeHygiene,
  rewriteMisclassifiedSignalType,
  shouldDropNonResilienceCasualtySignal,
  isExcludedNationalContextSignalType,
  isBareHazardTickerEvidence,
  NATIONAL_CONTEXT_EXCLUDED_SIGNAL_TYPES,
} from './domain/services/signals/hygiene/signalTypeHygiene.js';
export {
  SIGNAL_TYPES,
  getSignalCatalogEntry,
  canonicalizeSignalType,
} from './domain/contracts/signalCatalog.js';
export {
  splitBundledHarmInfrastructure,
  splitEvidenceClauses,
  classifyHarmInfrastructureClause,
} from './domain/services/signals/hygiene/harmInfrastructureSplit.js';
export { topContributorsFromScored } from './domain/services/user/topContributors.js';

// --- Application services ---
export {
  getCachedReport,
  getLatestGeneratedReport,
  pickLatestGeneratedEdition,
  getAvailableReportDates,
  getAvailableReportEditions,
  resolveReportJsonPathForDate,
  listReportJsonPathsForDate,
  parseReportRunIdFromFilename,
} from './infrastructure/reportCacheService.js';
export {
  parseUserRecommendationRequest,
} from './app/user/userRecommendationService.js';
export { updateUserRecommendationStatus } from './infrastructure/recommendationStatusWriter.js';
export { archiveMarkdownFiles } from './app/extraction/archiveMarkdownFromMd.js';
export { runResilienceAssessment } from './app/resilienceAnalysisService.js';
export { contentBatchFromMdArticles } from './app/extraction/contentBatchFromMdArticles.js';
export { createAnthropicResilienceLlmAdapter } from './infrastructure/adapters/anthropicResilienceLlmAdapter.js';

// --- Evidence grouping (count-based) ---
export { collectComponentSignals } from './domain/services/signals/componentSignalGroups.js';
export { buildComponentEvidence } from './domain/contracts/componentEvidence.js';
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
export {
  buildSignalRefRegistry,
  buildRefKey,
  signalArticleKey,
} from './domain/services/narrative/signalRefRegistry.js';
export {
  CLAIM_REF_NAMESPACES,
  classifyClaimRef,
  canonicalClaimRef,
  resolveClaimRef,
} from './domain/services/narrative/claimRefNamespace.js';

// --- Cross-report critique (post-hoc user QA) ---
export {
  CLAIM_WEAKNESS_KINDS,
  CLAIM_WEAKNESS_TIERS,
  critiqueClaim,
  critiqueReport,
  aggregateCritiques,
} from './domain/services/critique/crossReportCritique.js';
export {
  selectReportFiles,
  buildCrossReportCritique,
  buildAndWriteCrossReportCritique,
} from './app/assessment/crossReportCritiqueService.js';
export {
  resolveNarrativePipelineMode,
  hybridNarrativeEnabled,
  legacyNarrativeOnly,
  userNarrativePipelineEnabled,
} from './domain/services/narrativeGrounding/groundingConfig.js';
export {
  applyUserNarrativePipeline,
  runUserNarrativePipeline,
  applyUserNarrativeToAssessment,
} from './app/assessment/userNarrativePipeline.js';
export {
  finalizeUserNarrativeSurface,
  resolveUserComponentNarrative,
  buildProseFromClaims,
  buildCuratedEvidenceBullets,
  isStubNarrative,
  INSUFFICIENT_SYNTHESIS_NARRATIVE,
} from './domain/services/user/userNarrativeSurface.js';
export {
  attachRichUserSurface,
  attachRichInvestigationPool,
  buildDeterministicNarrativeFromClaims,
  assignUserEpistemicRole,
} from './domain/services/user/userInvestigationSurface.js';
export {
  SIGNAL_TO_COMPONENTS,
  NON_SCORING_FALLBACK_TYPES,
  getRoutingRole,
} from './domain/services/signals/routing/signalRouter.js';

export {
  runExtractionStage,
  indexExtractStoryClusters,
} from './app/extraction/extractionStageRunner.js';
export { readResilienceHistory } from './infrastructure/reportHistoryReader.js';
