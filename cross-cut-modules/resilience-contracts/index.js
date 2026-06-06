/**
 * Shared resilience taxonomy, policy constants, and pure helpers.
 * Other modules import from here instead of business_modules/resilience.
 */

export { RESILIENCE_COMPONENTS } from './resilienceComponents.js';
export { COMPONENT_IDS } from './componentIds.js';
export {
  CATALOG_VERSION,
  SIGNAL_CATALOG,
  SIGNAL_TYPES,
  SIGNAL_DOMAINS,
  DEFAULT_SCORING_PRIORS,
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
