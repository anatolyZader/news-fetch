/**
 * Public re-export barrel for narrative grounding (post-hoc prose vs evidence QA).
 *
 * Pipeline position: consumed by narrative LLM pipeline and operator finalize;
 * NOT related to GROUNDING_TIER evidence verification.
 *
 * Owns: facade exports for config, signal refs, co-occurrence, validation, scoring.
 * Does NOT: implement logic (see submodules) or run specialist agent grounding.
 *
 * Key collaborators: all modules under `narrativeGrounding/`, `contracts/inlineCitationResolve.js`.
 */

export {
  isNarrativeGroundingEnabled,
  isNarrativeFactsPassEnabled,
  isNarrativeJudgeEnabled,
  narrativeGroundingMinScore,
  narrativeSynthesisMaxUrls,
  narrativeFactsMaxTokens,
  narrativeJudgeMaxTokens,
  isNarrativeGroundingBlockEnabled,
  EVIDENCE_OVERLAP_MIN,
  resolveNarrativePipelineMode,
  hybridNarrativeEnabled,
  legacyNarrativeOnly,
  operatorNarrativePipelineEnabled,
} from './groundingConfig.js';

export {
  buildSignalRefRegistry,
  buildRefKey,
  resolveRef,
  resolveLabel,
  formatSignalWithRef,
  signalArticleKey,
  citationLabelForSignal,
  evidenceAttributionLabel,
  epistemicFramingHint,
} from './signalRefRegistry.js';

export { resolveInlineSignalCitations } from '../../contracts/inlineCitationResolve.js';

export {
  buildCoOccurrenceGroups,
  formatCoOccurrenceForPrompt,
  validateClaimRelation,
  signalsMayCoOccur,
} from './coOccurrenceGraph.js';

export {
  splitSentences,
  findForbiddenConnectives,
  textOverlapScore,
  bestEvidenceOverlap,
  stripMarkdownLinks,
  FORBIDDEN_CONNECTIVES,
} from './narrativeTextUtils.js';

export {
  validateNarrativeOutput,
  formatValidationFeedback,
} from './narrativeSchemaValidator.js';

export {
  scoreTextGrounding,
  computeGroundingScores,
} from './sentenceGroundingChecker.js';

export {
  formatDigitalQuarantineNarrativeBlock,
  narrativeQuarantineContextActive,
} from './digitalQuarantineNarrativeContext.js';
