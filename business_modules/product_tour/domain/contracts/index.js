/**
 * Client-safe contracts barrel for the product tour module.
 */
export {
  MAIN_SHELL_TOUR_ID,
  MAIN_SHELL_TOUR_VERSION,
  MAIN_SHELL_TOUR,
  KNOWN_TOURS,
  KNOWN_TOUR_IDS,
  TOUR_TIERS,
  getTourDefinition,
  anchorSelector,
} from './tourDefinitions.js';
export {
  TOUR_STATUSES,
  MAX_STEP_INDEX,
  normalizeProgress,
  filterStepsForTier,
  shouldAutoStart,
} from './tourProgress.js';
