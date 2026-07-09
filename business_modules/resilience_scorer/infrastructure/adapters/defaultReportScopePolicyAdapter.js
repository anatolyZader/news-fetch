import {
  filterSignalsForScope,
  normalizeReportScope,
} from '../../domain/services/signals/regionSignalFilter.js';

/** Default scope policy delegating to regionSignalFilter. */
export function createDefaultReportScopePolicy() {
  return {
    filterSignalsForScope,
    normalizeReportScope,
  };
}
