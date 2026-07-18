// Taxonomy (shared contract) + scoring policy (this module) behind one facade.
export {
  CATALOG_VERSION,
  SIGNAL_CATALOG,
  SIGNAL_DOMAINS,
  SIGNAL_TYPES,
  SIGNAL_ALIASES,
  getSignalCatalogEntry,
  canonicalizeSignalType,
  validateSignalCatalog,
  assertValidSignalCatalog,
} from '../../contracts/signalCatalog.js';
export {
  SIGNAL_TO_COMPONENTS,
  SIGNAL_ROUTING_ROLES,
  getRoutingRole,
  validateSignalRouting,
  assertValidSignalRouting,
} from './signalRouting.js';
export {
  DEFAULT_SCORING_PRIORS,
  SCORING_PRIORS_BY_TYPE,
  getScoringPriors,
} from './scoringPriors.js';
