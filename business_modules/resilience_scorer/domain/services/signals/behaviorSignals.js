/**
 * Closed-vocabulary behavior signal taxonomy for community resilience analysis.
 *
 * Architecture (from design spec):
 *   1. Atomic signals only — one verb, one behavioral fact per signal
 *   2. Closed vocabulary — LLM chooses from this fixed enum, never invents types
 *   3. Many-to-many mapping — one signal affects multiple components
 *   4. LLM extracts → code maps & scores (deterministic, auditable)
 *
 * Component IDs match resilienceComponents.js:
 *   narrative, information_communication, lifesaving_behavior,
 *   functional_continuity, community_capital, leadership,
 *   belonging_solidarity, wellbeing_at_risk
 */

export {
  CATALOG_VERSION,
  DEFAULT_SCORING_PRIORS,
  SIGNAL_CATALOG,
  SIGNAL_DOMAINS,
  SIGNAL_TO_COMPONENTS,
  SIGNAL_TYPES,
  getScoringPriors,
  getSignalCatalogEntry,
} from './signalRouter.js';

export {
  SIGNAL_CLASSES,
  INTENSITY_LEVELS,
  PHASE_LEVELS,
  AFFECTED_SUBGROUPS,
  AFFECTED_SYSTEMS,
  POLARITY_OVERRIDE_SIGNAL_TYPES,
  AFFECTED_SYSTEM_SIGNAL_TYPES,
  EQUITY_RELEVANT_TYPES,
  INTENSITY_WEIGHT,
} from './signalInstanceSchema.js';

export {
  COMPONENT_IDS,
} from '../../contracts/componentIds.js';

// ─── Public API ───────────────────────────────────────────────────────────────

/** Render confidence as a display string (simple passthrough for v2 string values). */
export function summarizeConfidence(conf) {
  if (conf == null || conf === 'insufficient_data') return 'insufficient_data';
  if (typeof conf === 'string') return conf;
  return conf.signal_confidence ?? 'insufficient_data';
}
