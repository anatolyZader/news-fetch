export { createSocialMediaService } from './app/socialMediaService.js';
export { createSocialMediaGatherService } from './app/socialMediaGatherService.js';
export { createSocialMediaTreatmentService } from './app/socialMediaTreatmentService.js';
export { createSocialMediaFsAdapter } from './infrastructure/adapters/socialMediaFsAdapter.js';
export {
  SOCIAL_PLATFORMS,
  DEFAULT_PLATFORMS_SEARCHED,
  CONTENT_KIND_OSINT,
  SOURCE_TYPE_SOCIAL,
} from './domain/value_objects/socialPlatform.js';
export {
  HOMEFRONT_KEYWORDS,
  HOMEFRONT_KEYWORDS_ARA,
  HOMEFRONT_KEYWORDS_RUS,
  HOMEFRONT_KEYWORDS_ENG,
  HOMEFRONT_KEYWORDS_FRA,
  isHomefrontRelevant,
} from './domain/services/homefrontKeywords.js';
export {
  isHomefrontBehaviorRelevant,
  isTelegramPostBehaviorEvidence,
  hasPopulationBehaviorSignal,
  isMilitaryOperationsNews,
  isAttackAlertOnly,
} from './domain/services/homefrontBehaviorFilter.js';
export { mapFindingToSignal, mapFindingsToSignals } from './domain/services/findingToSignalMapper.js';
export { validateOsintBundle } from './domain/services/osintBundleValidator.js';
export { evaluateCitizenVoiceCandidate } from './domain/services/osintRejectionRules.js';
export { buildDefaultGatherQueries } from './domain/services/gatherQueryTemplates.js';
export { buildSocialOsintMarkdown } from './domain/services/socialMediaReportWriter.js';
export { socialFindingsToExtractUnits } from './domain/services/socialFindingsToExtractUnits.js';
export { isBundleFreshForRun } from './domain/services/osintBundleMerge.js';
export { socialMediaRoutes } from './input/socialMediaRoutes.js';
