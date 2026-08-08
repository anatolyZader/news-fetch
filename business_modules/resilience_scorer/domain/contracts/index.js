/**
 * Public re-export barrel for the isomorphic contracts layer.
 *
 * Pipeline position: client-safe isomorphic — imported by server assess/report paths,
 * React client citation UI, and sibling modules (pbo_report, cross-cut retrieval)
 * via the resilience_scorer facade.
 *
 * Owns: stable export surface for taxonomy, policy constants, and pure helpers.
 * Does NOT: orchestrate pipelines, call LLMs, or hold mutable runtime state.
 *
 * Key collaborators: resilience_scorer/index.js (facade), client report components,
 * citationDisplay.js, signalCatalog.js, componentEvidence.js.
 */

// Load-bearing for external consumers (pbo_report, cross-cut retrieval) via the module facade.
export { RESILIENCE_COMPONENTS } from './resilienceComponents.js';
export { COMPONENT_IDS } from './componentIds.js';
export {
  CATALOG_VERSION,
  SIGNAL_CATALOG,
  SIGNAL_TYPES,
  SIGNAL_DOMAINS,
  SIGNAL_ALIASES,
  canonicalizeSignalType,
  validateSignalCatalog,
  assertValidSignalCatalog,
} from './signalCatalog.js';
export { GROUNDING_TIER } from './groundingTier.js';
export { isDmPhoneAllowed } from './gamingPolicy.js';
export { extractJson, extractJsonArray } from './jsonExtract.js';
export { DISPLAY_VIEWS, resolveDisplayView } from './displayViews.js';
export { normalizeReportScope } from './scopePolicy.js';
export {
  COMPONENTS_TABLE_HELP_MARKDOWN,
  EVIDENCE_LEVEL_INLINE_NOTE,
} from './componentsTableGlossary.js';
export {
  ASSESSMENT_SCHEMA_VERSION,
  validateAssessmentV2,
  createEmptyAssessmentV2,
} from './assessmentV2.js';
export {
  userEpistemicOverlayEnabled,
} from './userEpistemicOverlay.js';
export {
  narrativeEpistemicMode,
  narrativeInvestigationPermissive,
} from './narrativeEpistemicMode.js';
export {
  userSurfaceMode,
  richSurfaceSkipSpecialists,
  richSurfaceDeterministicOnly,
  shouldUseRichDeterministicPath,
  userEvidenceChars,
  userMaxClaims,
  userHighlightPerSource,
} from './userSurfaceMode.js';
export {
  normalizePoolSourceType,
  poolItemSourceBucket,
  groupPoolItemsBySource,
  SOURCE_BUCKET_ORDER,
} from './evidencePoolGrouping.js';
export { isSoftVoidWarning, SOFT_VOID_REASONS } from './softVoidReasons.js';
export {
  INTERNAL_REF_BRACKET,
  sourceTypeCitationLabel,
  citationAuthorForSignal,
  apaSourceFromSignalEntry,
  buildCitationRegistryFromStored,
  proseHasResolvableCitations,
} from './citationDisplay.js';
export { resolveInlineSignalCitations, linkPlainApaParentheticals } from './inlineCitationResolve.js';
export {
  encodeRefForAnchor,
  evidenceAnchorId,
  evidenceAnchorHref,
  isEvidenceAnchorHref,
  parseEvidenceAnchorHref,
} from './evidenceAnchor.js';
export { closedSignalsDir } from './closedSignalsPaths.js';
export {
  LEARNING_CAPTURE_KINDS,
  LEARNING_CAPTURE_KIND_SET,
} from './learningCaptureKinds.js';
export {
  clusterKeyForRecord,
  evidenceTextForRecord,
  captureKindLabel,
  inferSourceDensityClass,
  inferDominantSourceClass,
} from './learningCaptureRecordHelpers.js';
export {
  FIELD_ANCHOR_SOURCE_TYPES,
  VISITS_SOURCE_TYPES,
  FIELD_FAMILY_SOURCE_TYPES,
  DEFAULT_NORTH_SOURCE_TYPES,
  WHATSAPP_SOURCE_TYPES,
} from './sourceFamilies.js';
export { assertValidResilienceContentBatch } from './resilienceContentBatch.js';
